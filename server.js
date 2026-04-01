```javascript
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

const countries = [
    { name: 'South Africa', code: '+27', price: 170, countryId: 31, flag: '🇿🇦' },
    { name: 'Indonesia', code: '+62', price: 200, countryId: 6, flag: '🇮🇩' },
    { name: 'Canada', code: '+1', price: 210, countryId: 36, flag: '🇨🇦' },
    { name: 'Philippines', code: '+63', price: 210, countryId: 4, flag: '🇵🇭' },
    { name: 'Thailand', code: '+66', price: 300, countryId: 52, flag: '🇹🇭' },
    { name: 'Vietnam', code: '+84', price: 210, countryId: 10, flag: '🇻🇳' },
    { name: 'Colombia', code: '+57', price: 270, countryId: 33, flag: '🇨🇴' },
    { name: 'Saudi Arabia', code: '+966', price: 320, countryId: 53, flag: '🇸🇦' },
    { name: 'Brazil', code: '+55', price: 370, countryId: 73, flag: '🇧🇷' },
    { name: 'USA', code: '+1', price: 400, countryId: 187, flag: '🇺🇸' },
    { name: 'United Kingdom', code: '+44', price: 450, countryId: 16, flag: '🇬🇧' }
];
const facebookCountries = [
    { name: 'Canada', code: '+1', price: 70, countryId: 36, flag: '🇨🇦' },
    { name: 'USA', code: '+1', price: 80, countryId: 187, flag: '🇺🇸' },
    { name: 'USA Virtual', code: '+1', price: 70, countryId: 12, flag: '🇺🇸' }
];
const instagramCountries = [
    { name: 'USA', code: '+1', price: 70, countryId: 187, flag: '🇺🇸' },
    { name: 'Indonesia', code: '+62', price: 30, countryId: 6, flag: '🇮🇩' },
    { name: 'United Kingdom', code: '+44', price: 40, countryId: 16, flag: '🇬🇧' },
    { name: 'Brazil', code: '+55', price: 30, countryId: 73, flag: '🇧🇷' }
];
const snapchatCountries = [
    { name: 'USA', code: '+1', price: 70, countryId: 187, flag: '🇺🇸' },
    { name: 'Colombia', code: '+57', price: 30, countryId: 33, flag: '🇨🇴' },
    { name: 'USA Virtual', code: '+1', price: 20, countryId: 12, flag: '🇺🇸' }
];
const googleCountries = [
    { name: 'Indonesia', code: '+62', price: 90, countryId: 6, flag: '🇮🇩' }
];
const tiktokCountries = [
    { name: 'United Kingdom', code: '+44', price: 70, countryId: 16, flag: '🇬🇧' },
    { name: 'Indonesia', code: '+62', price: 40, countryId: 6, flag: '🇮🇩' },
    { name: 'USA', code: '+1', price: 70, countryId: 187, flag: '🇺🇸' }
];

const svcConfig = {
    whatsapp: { code: SVC_WA, countries, label: 'WhatsApp', name: 'WhatsApp Number' },
    facebook: { code: SVC_FB, countries: facebookCountries, label: 'Facebook', name: 'Facebook Number' },
    instagram: { code: SVC_IG, countries: instagramCountries, label: 'Instagram', name: 'Instagram Number' },
    snapchat: { code: SVC_SC, countries: snapchatCountries, label: 'Snapchat', name: 'Snapchat Number' },
    google: { code: SVC_GO, countries: googleCountries, label: 'Google', name: 'Google Number' },
    tiktok: { code: SVC_TK, countries: tiktokCountries, label: 'TikTok', name: 'TikTok Number' }
};

function parseNumResp(d) {
    if (typeof d === 'string') { const t = d.trim(); if (t.startsWith('{') || t.startsWith('[')) { try { return parseNumResp(JSON.parse(t)); } catch { return parseV1(t); } } return parseV1(t); }
    if (d && typeof d === 'object') {
        const aid = d.activationId || d.id || d.activation_id;
        const ph = d.phoneNumber || d.phone || d.phone_number;
        if (aid && ph) return { success: true, activationId: String(aid), phoneNumber: String(ph).startsWith('+') ? String(ph) : `+${String(ph)}` };
    }
    return { success: false, error: 'No number' };
}
function parseV1(t) { const r = String(t || '').trim(); if (r.startsWith('ACCESS_NUMBER:')) { const p = r.split(':'); if (p.length >= 3) return { success: true, activationId: p[1], phoneNumber: p[2].startsWith('+') ? p[2] : `+${p[2]}` }; } return { success: false, error: r || 'No number' }; }

function extractProviders(node) {
    const b = [], s = new Set();
    (function rec(n) { if (!n || typeof n !== 'object') return; if (Object.prototype.hasOwnProperty.call(n, 'provider_id') && Object.prototype.hasOwnProperty.call(n, 'price')) { const pi = Number(n.provider_id), pp = Number(n.price); if (!Number.isNaN(pi) && !Number.isNaN(pp)) { const k = `${pi}:${pp}`; if (!s.has(k)) { s.add(k); b.push({ provider_id: pi, price: pp }); } } } for (const v of Object.values(n)) { if (v && typeof v === 'object') rec(v); } })(node);
    return b.sort((a, b) => a.price - b.price);
}

async function fetchTiers(cid, sc = 'wa') {
    const r = await axios.get(`${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=getPricesV3&service=${sc}&country=${cid}`, { timeout: 15000 });
    const d = r.data; let prov = [];
    if (d && typeof d === 'object') { const cn = d[String(cid)] ?? d[cid] ?? (Object.keys(d).length === 1 ? Object.values(d)[0] : null); const sn = cn?.[sc] ?? (cn && Object.keys(cn).length === 1 ? Object.values(cn)[0] : null); prov = extractProviders(sn || d); }
    return prov.filter(p => Number.isFinite(p.provider_id) && Number.isFinite(p.price)).sort((a, b) => a.price - b.price);
}

async function buyFromProv(cid, prov, sc = 'wa') {
    try { const r = await axios.get(`${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=getNumberV2&service=${sc}&country=${cid}&maxPrice=${prov.price}&providerIds=${prov.provider_id}`, { timeout: 15000 }); const p = parseNumResp(r.data); if (p.success) return { ...p, provider_id: prov.provider_id, provider_price: prov.price }; return { success: false, error: p.error }; } catch (e) { return { success: false, error: e.message }; }
}

async function buyByTier(cid, maxUsd, sc = 'wa') {
    try {
        const provs = await fetchTiers(cid, sc);
        const aff = provs.filter(p => p.price <= maxUsd + 0.000001).slice(0, 5);
        if (!aff.length) return { success: false, strategy: 'unavailable', error: 'No tiers in range' };
        for (const prov of aff) {
            const start = Date.now();
            while (Date.now() - start < 10000) {
                const r = await buyFromProv(cid, prov, sc);
                if (r.success) return { success: true, activationId: r.activationId, phoneNumber: r.phoneNumber, strategy: 'provider', provider_id: r.provider_id, provider_price: r.provider_price };
                const rem = 10000 - (Date.now() - start); if (rem <= 0) break;
                await waitMs(Math.min(5000, rem));
            }
        }
        return { success: false, strategy: 'exhausted', error: 'No number in tiers' };
    } catch (e) { return { success: false, strategy: 'unavailable', error: e.message }; }
}

async function buyRetry(cid, baseUsd, sc = 'wa') {
    for (let i = 0; i < 3; i++) { const mp = (baseUsd * (1 + i * 0.05)).toFixed(3); try { const r = await axios.get(`${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=getNumber&service=${sc}&country=${cid}&maxPrice=${mp}`, { timeout: 15000 }); const p = parseNumResp(r.data); if (p.success) return { success: true, activationId: p.activationId, phoneNumber: p.phoneNumber, strategy: 'fallback' }; if (i < 2) await waitMs(8000); } catch (e) { if (i === 2) return { success: false, error: e.message }; await waitMs(8000); } }
    return { success: false, error: 'No number after retries' };
}

async function getBestNum(cid, maxUsd, sc = 'wa') {
    let r = await buyByTier(cid, maxUsd, sc);
    if (!r.success && r.strategy === 'unavailable') r = await buyRetry(cid, maxUsd, sc);
    return r;
}

async function checkSms(aid) {
    try { const r = await axios.get(`${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=getStatus&id=${aid}`, { timeout: 15000 }); const t = String(r.data || '').trim(); if (t.startsWith('STATUS_OK:')) return { success: true, code: t.split(':')[1] }; if (t === 'STATUS_WAIT_CODE') return { success: true, waiting: true }; return { success: false, raw: t }; } catch (e) { return { success: false, error: e.message }; }
}

function ensureAuth(req, res, next) { if (!req.session.userId) return res.status(401).send('Login required'); next(); }
async function ensureAdmin(req, res, next) { try { if (!req.session.userId) return res.status(401).send('Login required'); const u = await findUserById(req.session.userId); if (!u || u.role !== 'admin') return res.status(403).send('Admin only'); req.user = u; next(); } catch { res.status(500).send('Server error'); } }

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/countries', (req, res) => res.json(countries));
app.get('/api/facebook/countries', (req, res) => res.json(facebookCountries));
app.get('/api/instagram/countries', (req, res) => res.json(instagramCountries));
app.get('/api/snapchat/countries', (req, res) => res.json(snapchatCountries));
app.get('/api/google/countries', (req, res) => res.json(googleCountries));
app.get('/api/tiktok/countries', (req, res) => res.json(tiktokCountries));

app.post('/api/forgot-password', async (req, res) => {
    try { const { email } = req.body; if (!vEmail(email)) return res.status(400).send('Valid email required'); const u = await findUser(email); if (!u) return res.json({ sent: false }); const token = crypto.randomBytes(32).toString('hex'); const exp = new Date(Date.now() + 3600000).toISOString(); await qR('UPDATE users SET reset_token=$1,reset_token_expires=$2 WHERE id=$3', [token, exp, u.id]); const domain = req.get('origin') || ''; res.json({ sent: true, link: `${domain}/reset-password?token=${token}` }); } catch (e) { res.status(500).send(safeErr(e)); }
});

app.post('/api/reset-password', async (req, res) => {
    try { const { token, newPassword } = req.body; if (!token || !vPass(newPassword)) return res.status(400).send('Invalid'); const u = await q1('SELECT * FROM users WHERE reset_token=$1 AND reset_token_expires>NOW()', [token]); if (!u) return res.status(400).send('Invalid or expired link'); await updatePass(u.id, newPassword); await qR('UPDATE users SET reset_token=NULL,reset_token_expires=NULL WHERE id=$1', [u.id]); res.json({ success: true }); } catch (e) { res.status(500).send(safeErr(e)); }
});

app.get('/api/auth/google', (req, res) => res.redirect('/auth/google'));
app.get('/auth/google', async (req, res) => {
    if (!ensureG()) return res.status(500).send('Google not configured');
    const state = crypto.randomBytes(16).toString('hex'); req.session.google_oauth_state = state;
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_CALLBACK_URL, response_type: 'code', scope: 'openid email profile', state, access_type: 'online', prompt: 'select_account' }).toString()}`);
});

app.get('/auth/google/callback', async (req, res) => {
    try {
        if (!ensureG()) return res.status(500).send('Google not configured');
        const { code, state, error } = req.query;
        if (error) return res.redirect('/?google_error=denied');
        if (!code || !state || state !== req.session.google_oauth_state) return res.redirect('/?google_error=state');
        delete req.session.google_oauth_state;
        const tr = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: GOOGLE_CALLBACK_URL }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
        const at = tr.data.access_token; if (!at) return res.redirect('/?google_error=token');
        const pr = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${at}` }, timeout: 15000 });
        const pf = pr.data; if (!pf || !pf.email) return res.redirect('/?google_error=email');
        let u = await findUser(pf.email); if (!u) { await createUser(pf.name || pf.email.split('@')[0], pf.email, randP()); u = await findUser(pf.email); }
        if (!u || !u.is_active) return res.redirect('/?google_error=blocked');
        await updateLastLogin(u.id); await updateLoginAttempts(u.id, 0);
        req.session.regenerate(e => { if (e) return res.redirect('/?google_error=session'); req.session.userId = u.id; req.session.save(s => { if (s) return res.redirect('/?google_error=save'); res.redirect('/'); }); });
    } catch { res.redirect('/?google_error=oauth'); }
});

app.post('/api/register', async (req, res) => { try { const n = String(req.body.name || '').trim(), e = sEmail(req.body.email), p = req.body.password; if (!n) return res.status(400).send('Name required'); if (!vEmail(e)) return res.status(400).send('Valid email required'); if (!vPass(p)) return res.status(400).send('Password min 6 chars'); if (await findUser(e)) return res.status(400).send('Email exists'); await createUser(n, e, p); res.json({ success: true }); } catch (e) { res.status(500).send(safeErr(e)); } });

app.post('/api/login', async (req, res) => {
    try {
        const e = sEmail(req.body.email), p = req.body.password;
        if (!vEmail(e)) return res.status(400).send('Valid email required');
        if (typeof p !== 'string' || !p) return res.status(400).send('Password required');
        const u = await findUser(e); if (!u) return res.status(401).send('Invalid credentials');
        if (!u.is_active) return res.status(401).send('Account blocked');
        const pc = await verifyP(p, u.password);
        if (!pc.valid) { const na = Number(u.login_attempts || 0) + 1; await updateLoginAttempts(u.id, na); if (na >= 5) await qR('UPDATE users SET is_active=FALSE WHERE id=$1', [u.id]); return res.status(401).send('Invalid credentials'); }
        if (pc.needsUpgrade) await updatePassHash(u.id, await hashP(p));
        await updateLoginAttempts(u.id, 0); await updateLastLogin(u.id);
        req.session.regenerate(e => { if (e) return res.status(500).send('Login failed'); req.session.userId = u.id; req.session.save(s => { if (s) return res.status(500).send('Login failed'); res.json({ success: true }); }); });
    } catch (e) { res.status(500).send(safeErr(e)); }
});

app.post('/api/change-password', ensureAuth, async (req, res) => { try { const { currentPassword, newPassword } = req.body; if (!currentPassword) return res.status(400).send('Current password required'); if (!vPass(newPassword)) return res.status(400).send('Min 6 chars'); const u = await findUserById(req.session.userId); if (!u) return res.status(404).send('Not found'); if (!(await verifyP(currentPassword, u.password)).valid) return res.status(400).send('Wrong password'); await updatePass(u.id, newPassword); res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); } });

app.get('/api/me', ensureAuth, async (req, res) => { try { const u = await findUserById(req.session.userId); if (!u) return res.status(401).send('Not found'); res.json({ id: u.id, name: u.name, email: u.email, balance: u.balance, role: u.role, referralCode: u.referral_code, maskedPassword: '********' }); } catch { res.status(500).send('Server error'); } });

app.get('/api/logout', (req, res) => { req.session.destroy(() => { res.clearCookie('mrf.sid'); res.send('OK'); }); });

app.post('/api/order', ensureAuth, rateLimit, async (req, res) => {
    const client = await pool.connect(); try {
        const { countryName, price, countryId, service } = req.body;
        const cfg = svcConfig[service]; if (!cfg) return res.status(400).send('Invalid service');
        const co = cfg.countries.find(c => c.name === countryName && Number(c.countryId) === Number(countryId));
        if (!co) return res.status(400).send('Invalid country');
        await client.query('BEGIN');
        const ur = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.session.userId])).rows[0];
        if (!ur) { await client.query('ROLLBACK'); return res.status(401).send('Not found'); }
        if (Number(ur.balance) < Number(price)) { await client.query('ROLLBACK'); return res.status(400).send('Insufficient balance'); }
        const maxUsd = pkrUsd(price); const result = await getBestNum(countryId, maxUsd, cfg.code);
        if (!result.success) { await client.query('ROLLBACK'); return res.status(500).send('No number available. Try again.'); }
        const now = new Date(); const exp = new Date(now.getTime() + 25 * 60000).toISOString(); const cancelAt = new Date(now.getTime() + 60000).toISOString();
        const costUsd = result.provider_price || 0;
        await client.query('UPDATE users SET balance=$1 WHERE id=$2', [Number(ur.balance) - Number(price), ur.id]);
        const ins = (await client.query(`INSERT INTO orders(user_id,user_email,service_type,service_name,country,country_code,country_id,price,provider_cost_usd,payment_method,order_status,phone_number,activation_id,expires_at,cancel_available_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`, [ur.id, ur.email, service, cfg.name, countryName, co.code, co.countryId, price, costUsd, 'balance', 'active', result.phoneNumber, result.activationId, exp, cancelAt, now.toISOString()])).rows[0];
        await client.query('COMMIT');
        res.json({ id: ins.id, number: result.phoneNumber });
    } catch (e) { await client.query('ROLLBACK'); res.status(500).send(safeErr(e, 'Order failed')); } finally { client.release(); }
});

app.get('/api/orders/:id', ensureAuth, async (req, res) => { try { const o = await getOrderById(Number(req.params.id)); if (!o) return res.status(404).send('Not found'); const u = await findUserById(req.session.userId); if (!u) return res.status(401).send('Not found'); if (o.user_id !== u.id && u.role !== 'admin') return res.status(403).send('Unauthorized'); res.json(o); } catch { res.status(500).send('Server error'); } });
app.get('/api/orders', ensureAuth, async (req, res) => { try { res.json(await getUserOrders(req.session.userId)); } catch { res.status(500).send('Server error'); } });

app.post('/api/orders/:id/replace', ensureAuth, async (req, res) => {
    try { const o = await getOrderById(Number(req.params.id)); if (!o) return res.status(404).send('Not found'); const u = await findUserById(req.session.userId); if (!u || o.user_id !== u.id) return res.status(403).send('Unauthorized'); if (o.order_status !== 'active') return res.status(400).send('Cannot replace'); if (o.otp_received) return res.status(400).send('OTP received'); try { await axios.get(`${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=setStatus&id=${o.activation_id}&status=8`, { timeout: 15000 }); } catch {} const cfg = svcConfig[o.service_type]; const sc = cfg ? cfg.code : SVC_WA; const r = await getBestNum(o.country_id, pkrUsd(o.price), sc); if (!r.success) return res.status(500).send('No replacement'); const now = new Date(); await updateOrder(o.id, { phone_number: r.phoneNumber, activation_id: r.activationId, otp_received: false, otp_code: null, order_status: 'active', created_at: now.toISOString(), expires_at: new Date(now.getTime() + 25 * 60000).toISOString(), cancel_available_at: new Date(now.getTime() + 60000).toISOString(), provider_cost_usd: r.provider_price || 0 }); res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); }
});

app.post('/api/orders/:id/cancel', ensureAuth, async (req, res) => {
    const c = await pool.connect(); try {
        const oid = Number(req.params.id); await c.query('BEGIN');
        const o = (await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [oid])).rows[0]; if (!o) { await c.query('ROLLBACK'); return res.status(404).send('Not found'); }
        const u = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.session.userId])).rows[0]; if (!u || o.user_id !== u.id) { await c.query('ROLLBACK'); return res.status(403).send('Unauthorized'); }
        if (o.order_status !== 'active') { await c.query('ROLLBACK'); return res.status(400).send('Cannot cancel'); }
        if (o.otp_received) { await c.query('ROLLBACK'); return res.status(400).send('OTP received'); }
        if (new Date() < new Date(o.cancel_available_at)) { await c.query('ROLLBACK'); return res.status(400).send('Wait for cancel unlock'); }
        try { await axios.get(`${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=setStatus&id=${o.activation_id}&status=8`, { timeout: 15000 }); } catch {}
        await c.query('UPDATE users SET balance=$1 WHERE id=$2', [Number(u.balance || 0) + Number(o.price || 0), u.id]);
        await c.query('UPDATE orders SET order_status=$1 WHERE id=$2', ['cancelled', oid]); await c.query('COMMIT'); res.send('OK');
    } catch (e) { await c.query('ROLLBACK'); res.status(500).send(safeErr(e)); } finally { c.release(); }
});

app.post('/api/orders/:id/complete', ensureAuth, async (req, res) => { try { const o = await getOrderById(Number(req.params.id)); if (!o) return res.status(404).send('Not found'); const u = await findUserById(req.session.userId); if (!u || o.user_id !== u.id) return res.status(403).send('Unauthorized'); if (!o.otp_received) return res.status(400).send('No OTP'); try { await axios.get(`${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=setStatus&id=${o.activation_id}&status=6`, { timeout: 15000 }); } catch {} await updateOrder(o.id, { order_status: 'completed', completed_at: new Date().toISOString() }); res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); } });

app.post('/api/orders/:id/expire', ensureAuth, async (req, res) => { try { const o = await getOrderById(Number(req.params.id)); if (!o) return res.status(404).send('Not found'); const u = await findUserById(req.session.userId); if (!u) return res.status(401).send('Not found'); if (o.user_id !== u.id && u.role !== 'admin') return res.status(403).send('Unauthorized'); if (o.order_status === 'active' && !o.otp_received) { try { await axios.get(`${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=setStatus&id=${o.activation_id}&status=8`, { timeout: 15000 }); } catch {} await updateOrder(o.id, { order_status: 'cancelled' }); } res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); } });

app.get('/api/orders/:id/otp', ensureAuth, async (req, res) => {
    try {
        const o = await getOrderById(Number(req.params.id)); if (!o) return res.status(404).send('Not found');
        const u = await findUserById(req.session.userId); if (!u) return res.status(401).send('Not found'); if (o.user_id !== u.id && u.role !== 'admin') return res.status(403).send('Unauthorized');
        if (o.otp_received) return res.json({ received: true, code: o.otp_code });
        if (!o.activation_id) return res.json({ received: false, error: 'No activation ID' });
        if (new Date() >= new Date(o.expires_at) && !o.otp_received && o.order_status === 'active') { try { await axios.get(`${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=setStatus&id=${o.activation_id}&status=8`, { timeout: 15000 }); } catch {} await updateOrder(o.id, { order_status: 'cancelled' }); return res.json({ received: false, expired: true }); }
        const sr = await checkSms(o.activation_id);
        if (sr.success && sr.code) { await updateOrder(o.id, { otp_received: true, otp_code: sr.code, order_status: 'otp_received' }); playDing(); return res.json({ received: true, code: sr.code }); }
        if (sr.success && sr.waiting) return res.json({ received: false, waiting: true });
        return res.json({ received: false, error: true });
    } catch { res.status(500).json({ received: false, error: true }); }
});

app.get('/api/admin/stats', ensureAdmin, async (req, res) => {
    try {
        const today = await q1("SELECT COALESCE(SUM(price),0) as rev, COUNT(*) as cnt FROM orders WHERE created_at>=CURRENT_DATE");
        const users = await q1("SELECT COUNT(*) as cnt FROM users");
        const active = await q1("SELECT COUNT(*) as cnt FROM orders WHERE order_status='active'");
        const success = await q1("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE otp_received=true) as ok FROM orders WHERE created_at>=CURRENT_DATE");
        const totalRevenue = await q1("SELECT COALESCE(SUM(price),0) as rev FROM orders");
        const totalCost = await q1("SELECT COALESCE(SUM(provider_cost_usd * 280),0) as cost FROM orders WHERE otp_received=true");
        const totalProfit = await q1("SELECT COALESCE(SUM(price - provider_cost_usd * 280),0) as profit FROM orders WHERE otp_received=true");
        res.json({
            todayRevenue: Number(today.rev || 0),
            todayOrders: Number(today.cnt || 0),
            totalUsers: Number(users.cnt || 0),
            activeOrders: Number(active.cnt || 0),
            todaySuccessRate: Number(success.total || 0) > 0 ? Math.round(Number(success.ok || 0) / Number(success.total || 0) * 100) : 0,
            totalRevenue: Number(totalRevenue.rev || 0),
            totalCost: Number(totalCost.cost || 0),
            totalProfit: Number(totalProfit.profit || 0)
        });
    } catch (e) { res.status(500).send(safeErr(e)); }
});

app.get('/api/admin/orders', ensureAdmin, async (req, res) => { try { res.json(await getAllOrders()); } catch { res.status(500).send('Server error'); } });
app.get('/api/admin/transactions', ensureAdmin, async (req, res) => { try { res.json(await getPendingTx()); } catch { res.status(500).send('Server error'); } });
app.post('/api/admin/transactions/:id/approve', ensureAdmin, async (req, res) => { try { await approveTx(Number(req.params.id)); res.send('OK'); } catch (e) { res.status(404).send(safeErr(e)); } });
app.post('/api/admin/transactions/:id/reject', ensureAdmin, async (req, res) => { try { await rejectTx(Number(req.params.id)); res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); } });
app.get('/api/admin/resets', ensureAdmin, async (req, res) => { try { res.json(await qA("SELECT id,email,reset_token,reset_token_expires FROM users WHERE reset_token IS NOT NULL AND reset_token_expires>NOW() ORDER BY reset_token_expires DESC")); } catch { res.status(500).send('Server error'); } });

app.post('/api/add-funds', ensureAuth, upload.single('screenshot'), async (req, res) => { try { const a = parseFloat(req.body.amount); if (!a || a < 150) return res.status(400).send('Min 150 PKR'); const s = req.file ? req.file.filename : null; if (!s) return res.status(400).send('Screenshot required'); const u = await findUserById(req.session.userId); if (!u) return res.status(401).send('Not found'); await qR('INSERT INTO transactions(user_id,user_email,amount,screenshot) VALUES($1,$2,$3,$4)', [req.session.userId, u.email, a, s]); res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); } });

app.use('/uploads', express.static(UPLOAD_DIR));

function playDing() {
    try {
        const { exec } = require('child_process');
        exec('echo -e "\\a"');
    } catch (e) {}
}

initDB().then(() => { app.listen(PORT, '0.0.0.0', () => console.log(`Running on port ${PORT}`)); }).catch(e => { console.error('DB init failed:', e); process.exit(1); });
```
