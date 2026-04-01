const express = require('express');
const session = require('express-session');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(1); }
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) { console.error('SESSION_SECRET missing'); process.exit(1); }
const SMSBOWER_API_KEY = process.env.SMSBOWER_API_KEY || 'CHANGE_THIS';
const SMSBOWER_URL = 'https://smsbower.page/stubs/handler_api.php';
const SVC_WA = 'wa', SVC_FB = 'fb', SVC_IG = 'ig', SVC_SC = 'sc', SVC_GO = 'go', SVC_TK = 'tk';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const pool = new Pool({ connectionString: DATABASE_URL, ssl: IS_PROD ? { rejectUnauthorized: false } : false });

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    store: new pgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
    name: 'mrf.sid', secret: SESSION_SECRET, proxy: true, resave: false,
    saveUninitialized: false, rolling: true, unset: 'destroy',
    cookie: { secure: 'auto', httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

const rateStore = {};
function rateLimit(req, res, next) {
    const ip = req.ip; const now = Date.now();
    if (!rateStore[ip]) rateStore[ip] = [];
    rateStore[ip] = rateStore[ip].filter(t => now - t < 60000);
    if (rateStore[ip].length >= 30) return res.status(429).send('Too many requests');
    rateStore[ip].push(now);
    next();
}

function normUser(r) { if (!r) return null; return { ...r, balance: Number(r.balance || 0), referralCode: r.referral_code, is_active: r.is_active, login_attempts: r.login_attempts }; }
function normOrder(r) { if (!r) return null; return { ...r, price: Number(r.price || 0), provider_cost_usd: Number(r.provider_cost_usd || 0), otp_received: r.otp_received }; }
async function q1(s, p = []) { const r = await pool.query(s, p); return r.rows[0] || null; }
async function qA(s, p = []) { const r = await pool.query(s, p); return r.rows; }
async function qR(s, p = []) { return pool.query(s, p); }
function isHashed(p) { return typeof p === 'string' && /^\$2[aby]\$\d{2}\$/.test(p); }
async function hashP(p) { return bcrypt.hash(p, BCRYPT_ROUNDS); }
async function verifyP(i, s) { if (!s || typeof s !== 'string') return { valid: false, needsUpgrade: false }; if (isHashed(s)) return { valid: await bcrypt.compare(i, s), needsUpgrade: false }; return { valid: i === s, needsUpgrade: true }; }
function sEmail(e) { return String(e || '').trim().toLowerCase(); }
function vEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function vPass(p) { return typeof p === 'string' && p.length >= 6; }
function randP() { return crypto.randomBytes(24).toString('hex'); }
function ensureG() { return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CALLBACK_URL; }
function waitMs(ms) { return new Promise(r => setTimeout(r, ms)); }
function pkrUsd(p) { return parseFloat((p / 280).toFixed(3)); }
function safeErr(e, f = 'Server error') { if (!e) return f; if (typeof e.message === 'string' && e.message.trim()) return e.message; return f; }

async function initDB() {
    await qR(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT,balance NUMERIC(12,2) DEFAULT 0,role TEXT DEFAULT 'user',referral_code TEXT,is_active BOOLEAN DEFAULT TRUE,login_attempts INTEGER DEFAULT 0,last_login TIMESTAMPTZ,reset_token TEXT,reset_token_expires TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);
    await qR(`CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,user_email TEXT,service_type TEXT,service_name TEXT,country TEXT,country_code TEXT,country_id INTEGER,price NUMERIC(12,2),provider_cost_usd NUMERIC(12,4) DEFAULT 0,payment_method TEXT,payment_status TEXT DEFAULT 'pending',order_status TEXT DEFAULT 'pending',phone_number TEXT,activation_id TEXT,otp_received BOOLEAN DEFAULT FALSE,otp_code TEXT,expires_at TIMESTAMPTZ,cancel_available_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,completed_at TIMESTAMPTZ)`);
    await qR(`CREATE TABLE IF NOT EXISTS transactions(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,user_email TEXT,amount NUMERIC(12,2),screenshot TEXT,status TEXT DEFAULT 'pending',created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);
    try { await qR(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_cost_usd NUMERIC(12,4) DEFAULT 0`); } catch {}
    try { await qR(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`); } catch {}
    try { await qR(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ`); } catch {}
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
        const ae = sEmail(ADMIN_EMAIL);
        const ex = normUser(await q1('SELECT * FROM users WHERE email=$1', [ae]));
        if (!ex) { await qR('INSERT INTO users(email,password,name,role,referral_code) VALUES($1,$2,$3,$4,$5)', [ae, await hashP(ADMIN_PASSWORD), ADMIN_NAME, 'admin', 'ADMIN']); }
        else if (ex.role !== 'admin') { await qR('UPDATE users SET role=$1 WHERE id=$2', ['admin', ex.id]); }
    }
}

async function findUser(e) { return normUser(await q1('SELECT * FROM users WHERE email=$1', [sEmail(e)])); }
async function findUserById(id) { return normUser(await q1('SELECT * FROM users WHERE id=$1', [id])); }
async function createUser(n, e, p) { const rc = Math.random().toString(36).substring(2, 10).toUpperCase(); return qR('INSERT INTO users(email,password,name,referral_code) VALUES($1,$2,$3,$4)', [sEmail(e), await hashP(p), String(n || '').trim(), rc]); }
async function updatePass(uid, np) { return qR('UPDATE users SET password=$1 WHERE id=$2', [await hashP(np), uid]); }
async function updatePassHash(uid, h) { return qR('UPDATE users SET password=$1 WHERE id=$2', [h, uid]); }
async function getPendingTx() { return (await qA('SELECT * FROM transactions WHERE status=$1 ORDER BY id DESC', ['pending'])).map(r => ({ ...r, amount: Number(r.amount || 0) })); }
async function approveTx(tid) {
    const c = await pool.connect(); try {
        await c.query('BEGIN');
        const tx = (await c.query('SELECT * FROM transactions WHERE id=$1 FOR UPDATE', [tid])).rows[0];
        if (!tx) throw new Error('Not found');
        const u = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [tx.user_id])).rows[0];
        if (!u) throw new Error('User not found');
        await c.query('UPDATE transactions SET status=$1 WHERE id=$2', ['approved', tid]);
        await c.query('UPDATE users SET balance=$1 WHERE id=$2', [Number(u.balance || 0) + Number(tx.amount || 0), tx.user_id]);
        await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
async function rejectTx(tid) { await qR('UPDATE transactions SET status=$1 WHERE id=$2', ['rejected', tid]); }
async function getUserOrders(uid) { return (await qA('SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC', [uid])).map(normOrder); }
async function getOrderById(id) { return normOrder(await q1('SELECT * FROM orders WHERE id=$1', [id])); }
async function updateOrder(id, u) { const k = Object.keys(u); if (!k.length) return; const f = k.map((key, i) => `${key}=$${i + 1}`).join(','); const v = k.map(key => u[key]); v.push(id); await qR(`UPDATE orders SET ${f} WHERE id=$${v.length}`, v); }
async function getAllOrders() { return (await qA('SELECT * FROM orders ORDER BY id DESC')).map(normOrder); }
async function updateLoginAttempts(uid, a) { return qR('UPDATE users SET login_attempts=$1 WHERE id=$2', [a, uid]); }
async function updateLastLogin(uid) { return qR('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=$1', [uid]); }

// ... (countries and svcConfig same as before, omitted for brevity, but keep your existing country lists)
// [Keep your country definitions and svcConfig here exactly as in your original code]

// ------------------------------------------------------------------
// Improved SMSBower response parsing (handles many formats)
// ------------------------------------------------------------------
function parseSMSBowerResponse(raw) {
    const str = String(raw).trim();
    // JSON response
    if (str.startsWith('{') || str.startsWith('[')) {
        try {
            const obj = JSON.parse(str);
            if (obj.activationId && obj.phoneNumber) {
                return { success: true, activationId: String(obj.activationId), phoneNumber: String(obj.phoneNumber).startsWith('+') ? obj.phoneNumber : `+${obj.phoneNumber}` };
            }
            // sometimes the number is in `phone` field
            if (obj.activationId && obj.phone) {
                return { success: true, activationId: String(obj.activationId), phoneNumber: String(obj.phone).startsWith('+') ? obj.phone : `+${obj.phone}` };
            }
        } catch (e) { /* ignore */ }
    }
    // ACCESS_NUMBER:activationId:phoneNumber
    if (str.startsWith('ACCESS_NUMBER:')) {
        const parts = str.split(':');
        if (parts.length >= 3) {
            const phone = parts[2].startsWith('+') ? parts[2] : `+${parts[2]}`;
            return { success: true, activationId: parts[1], phoneNumber: phone };
        }
    }
    // Sometimes it's just the phone number
    if (/^\+?\d{7,15}$/.test(str)) {
        return { success: true, activationId: '', phoneNumber: str.startsWith('+') ? str : `+${str}` };
    }
    return { success: false, error: str };
}

async function getBestNum(cid, maxUsd, sc = 'wa') {
    // First try tiered purchase
    try {
        const provs = await fetchTiers(cid, sc);
        const affordable = provs.filter(p => p.price <= maxUsd + 0.001).slice(0, 5);
        for (const prov of affordable) {
            const start = Date.now();
            while (Date.now() - start < 10000) {
                const r = await buyFromProv(cid, prov, sc);
                if (r.success) {
                    // Ensure phone number is valid
                    if (!r.phoneNumber) {
                        console.warn('Missing phone number from provider', r);
                        continue;
                    }
                    return { success: true, activationId: r.activationId, phoneNumber: r.phoneNumber, strategy: 'tier', provider_id: r.provider_id, provider_price: r.provider_price };
                }
                await waitMs(2000);
            }
        }
    } catch (e) { /* ignore */ }

    // Fallback to simple getNumber with increasing price
    for (let i = 0; i < 3; i++) {
        const mp = (maxUsd * (1 + i * 0.05)).toFixed(3);
        try {
            const url = `${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=getNumber&service=${sc}&country=${cid}&maxPrice=${mp}`;
            const resp = await axios.get(url, { timeout: 15000 });
            const parsed = parseSMSBowerResponse(resp.data);
            if (parsed.success) {
                return { success: true, activationId: parsed.activationId, phoneNumber: parsed.phoneNumber, strategy: 'fallback', provider_price: parseFloat(mp) };
            }
        } catch (e) { /* ignore */ }
        await waitMs(5000);
    }

    return { success: false, error: 'No number available after retries' };
}

async function buyFromProv(cid, prov, sc) {
    try {
        const url = `${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=getNumberV2&service=${sc}&country=${cid}&maxPrice=${prov.price}&providerIds=${prov.provider_id}`;
        const resp = await axios.get(url, { timeout: 15000 });
        const parsed = parseSMSBowerResponse(resp.data);
        if (parsed.success) {
            return { ...parsed, provider_id: prov.provider_id, provider_price: prov.price };
        }
        return { success: false, error: parsed.error };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function fetchTiers(cid, sc) {
    try {
        const url = `${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=getPricesV3&service=${sc}&country=${cid}`;
        const resp = await axios.get(url, { timeout: 15000 });
        const data = resp.data;
        // Extract providers from the nested structure (your existing extractProviders function)
        return extractProviders(data);
    } catch (e) {
        return [];
    }
}

function extractProviders(node) {
    const b = [], s = new Set();
    (function rec(n) {
        if (!n || typeof n !== 'object') return;
        if (Object.prototype.hasOwnProperty.call(n, 'provider_id') && Object.prototype.hasOwnProperty.call(n, 'price')) {
            const pi = Number(n.provider_id), pp = Number(n.price);
            if (!Number.isNaN(pi) && !Number.isNaN(pp)) {
                const k = `${pi}:${pp}`;
                if (!s.has(k)) {
                    s.add(k);
                    b.push({ provider_id: pi, price: pp });
                }
            }
        }
        for (const v of Object.values(n)) {
            if (v && typeof v === 'object') rec(v);
        }
    })(node);
    return b.sort((a, b) => a.price - b.price);
}

// ... (rest of your server code remains same, including routes and admin panel)

// Update the /api/order route to handle missing number
app.post('/api/order', ensureAuth, rateLimit, async (req, res) => {
    const client = await pool.connect();
    try {
        const { countryName, price, countryId, service } = req.body;
        const cfg = svcConfig[service];
        if (!cfg) return res.status(400).send('Invalid service');
        const co = cfg.countries.find(c => c.name === countryName && Number(c.countryId) === Number(countryId));
        if (!co) return res.status(400).send('Invalid country');

        await client.query('BEGIN');
        const ur = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.session.userId])).rows[0];
        if (!ur) { await client.query('ROLLBACK'); return res.status(401).send('Not found'); }
        if (Number(ur.balance) < Number(price)) { await client.query('ROLLBACK'); return res.status(400).send('Insufficient balance'); }

        const maxUsd = pkrUsd(price);
        const result = await getBestNum(countryId, maxUsd, cfg.code);

        if (!result.success) {
            await client.query('ROLLBACK');
            const errMsg = result.error && result.error.includes('end of the range')
                ? 'No numbers available for this country right now. Please try another country or service.'
                : 'No number available. Please try again later.';
            return res.status(503).send(errMsg);
        }

        // Ensure phone number is present
        if (!result.phoneNumber) {
            await client.query('ROLLBACK');
            console.error('Missing phone number in result', result);
            return res.status(500).send('Internal error: missing phone number');
        }

        const now = new Date();
        const exp = new Date(now.getTime() + 25 * 60000).toISOString();
        const cancelAt = new Date(now.getTime() + 60000).toISOString();
        const costUsd = result.provider_price || 0;

        await client.query('UPDATE users SET balance=$1 WHERE id=$2', [Number(ur.balance) - Number(price), ur.id]);

        const ins = (await client.query(`
            INSERT INTO orders(user_id,user_email,service_type,service_name,country,country_code,country_id,price,provider_cost_usd,payment_method,order_status,phone_number,activation_id,expires_at,cancel_available_at,created_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id
        `, [ur.id, ur.email, service, cfg.name, countryName, co.code, co.countryId, price, costUsd, 'balance', 'active', result.phoneNumber, result.activationId, exp, cancelAt, now.toISOString()])).rows[0];

        await client.query('COMMIT');
        res.json({ id: ins.id, number: result.phoneNumber });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Order error:', e);
        res.status(500).send(safeErr(e, 'Order failed'));
    } finally {
        client.release();
    }
});

// ... (keep all other routes unchanged)

initDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`Running on port ${PORT}`));
}).catch(e => {
    console.error('DB init failed:', e);
    process.exit(1);
});
