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
const IS_PROD = (process.env.NODE_ENV || 'development') === 'production';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) { console.error('SESSION_SECRET missing'); process.exit(1); }
const SMSBOWER_API_KEY = process.env.SMSBOWER_API_KEY || 'CHANGE_THIS';
const SMSBOWER_URL = process.env.SMSBOWER_API_KEY ? process.env.SMSBOWER_API_KEY.replace(/\/[^\/]*$/, '') : 'https://smsbower.page';
const API_PATH = process.env.SMSBOWER_PATH || '/stubs/handler_api.php';
const FULL_API_URL = SMSBOWER_URL + API_PATH;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';
const pool = new Pool({ connectionString: DATABASE_URL, ssl: IS_PROD ? { rejectUnauthorized: false } : false });

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    store: new pgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
    name: 'mrf.sid', secret: SESSION_SECRET, proxy: true, resave: false,
    saveUninitialized: false, rolling: true, unset: 'destroy',
    cookie: { secure: 'auto', httpOnly: true, sameSite: 'lax', maxAge: 86400000 }
}));

function normUser(r) { if (!r) return null; return Object.assign({}, r, { balance: Number(r.balance || 0), referralCode: r.referral_code, is_active: r.is_active }); }
function normOrder(r) { if (!r) return null; return Object.assign({}, r, { price: Number(r.price || 0), otp_received: r.otp_received }); }
function q1(s, p) { p = p || []; return pool.query(s, p).then(function(r) { return r.rows[0] || null; }); }
function qA(s, p) { p = p || []; return pool.query(s, p).then(function(r) { return r.rows; }); }
function qR(s, p) { p = p || []; return pool.query(s, p); }
function hashP(p) { return bcrypt.hash(p, 12); }
function sEmail(e) { return String(e || '').trim().toLowerCase(); }
function vEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function vPass(p) { return typeof p === 'string' && p.length >= 6; }
function randP() { return crypto.randomBytes(24).toString('hex'); }
function ensureG() { return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CALLBACK_URL; }
function waitMs(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
function pkrUsd(p) { return parseFloat((p / 280).toFixed(3)); }
function safeErr(e) { return (e && e.message) ? e.message : 'Server error'; }

// ========================================
// DEBUG ENDPOINT - SMSBower response dekho
// ========================================
app.get('/api/debug-buy', async function(req, res) {
    try {
        var cid = req.query.country || '36';
        var sc = req.query.service || 'wa';
        var maxUsd = req.query.maxUsd || '1.0';
        var url = FULL_API_URL + '?api_key=' + SMSBOWER_API_KEY + '&action=getNumber&service=' + sc + '&country=' + cid + '&maxPrice=' + maxUsd;
        console.log('[DEBUG] URL: ' + url);
        var r = await axios.get(url, { timeout: 60000 });
        var raw = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
        console.log('[DEBUG] RAW RESPONSE: ' + raw);
        var parsed = extractPhone(r.data);
        console.log('[DEBUG] EXTRACTED: ' + JSON.stringify(parsed));
        res.json({ url: url, raw: raw, parsed: parsed });
    } catch(e) {
        res.json({ error: e.message });
    }
});

// ========================================
// AGGRESSIVE PHONE EXTRACTOR
// Puri response mein se phone dhundta hai
// Chahe JSON ho, string ho, HTML ho
// ========================================
function extractPhone(data) {
    // Step 1: Convert everything to string
    var raw = '';
    if (typeof data === 'string') raw = data;
    else if (data && typeof data === 'object') raw = JSON.stringify(data);
    else raw = String(data || '');

    console.log('[EXTRACT] Input length: ' + raw.length);
    console.log('[EXTRACT] First 500 chars: ' + raw.substring(0, 500));

    // Step 2: Check errors
    if (raw.indexOf('NO_NUMBERS') >= 0) return { ok: false, error: 'NO_NUMBERS' };
    if (raw.indexOf('BAD_SERVICE') >= 0) return { ok: false, error: 'BAD_SERVICE' };
    if (raw.indexOf('BAD_KEY') >= 0) return { ok: false, error: 'BAD_KEY' };
    if (raw.indexOf('NO_BALANCE') >= 0) return { ok: false, error: 'NO_BALANCE' };
    if (raw.indexOf('ERROR') >= 0 && raw.indexOf('ACCESS_NUMBER') < 0) return { ok: false, error: raw.substring(0, 100) };

    // Step 3: ACCESS_NUMBER:id:phone format
    if (raw.indexOf('ACCESS_NUMBER:') >= 0) {
        var idx = raw.indexOf('ACCESS_NUMBER:');
        var afterColon = raw.substring(idx + 15); // skip "ACCESS_NUMBER:"
        var parts = afterColon.split(':');
        if (parts.length >= 2) {
            var aid = parts[0].trim();
            var phone = parts.slice(1).join(':').trim();
            if (phone.length >= 7) {
                if (!phone.startsWith('+')) phone = '+' + phone;
                console.log('[EXTRACT] Method=ACCESS_NUMBER phone=' + phone + ' id=' + aid);
                return { ok: true, phone: phone, id: aid };
            }
        }
    }

    // Step 4: JSON field names
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        var phoneKeys = ['phoneNumber', 'phone_number', 'phone', 'number', 'tel', 'mobile', 'phoneNum', 'num', 'full_number', 'msisdn'];
        var idKeys = ['activationId', 'activation_id', 'id', 'activationIdStr', 'activation', 'requestId'];
        for (var i = 0; i < phoneKeys.length; i++) {
            if (data[phoneKeys[i]] != null && data[phoneKeys[i]] !== '') {
                var p = String(data[phoneKeys[i]]).replace(/[\s\-\(\)\.]/g, '');
                if (p.length >= 10) {
                    if (!p.startsWith('+')) p = '+' + p;
                    var aid = null;
                    for (var j = 0; j < idKeys.length; j++) {
                        if (data[idKeys[j]] != null && data[idKeys[j]] !== '') { aid = String(data[idKeys[j]]); break; }
                    }
                    console.log('[EXTRACT] Method=JSON key=' + phoneKeys[i] + ' phone=' + p + ' id=' + aid);
                    return { ok: true, phone: p, id: aid };
                }
            }
        }
        // Nested
        var nk = ['data', 'response', 'result', 'body', 'content'];
        for (var k = 0; k < nk.length; k++) {
            if (data[nk[k]] != null) {
                var nested = extractPhone(data[nk[k]]);
                if (nested.ok) return nested;
            }
        }
    }

    // Step 5: Find "+XXXXXXXXXX" pattern (number with + sign)
    var plusMatches = raw.match(/\+\d{10,15}/g);
    if (plusMatches && plusMatches.length > 0) {
        // Pick longest match
        var best = plusMatches.sort(function(a, b) { return b.length - a.length; })[0];
        console.log('[EXTRACT] Method=PlusRegex phone=' + best);
        return { ok: true, phone: best, id: null };
    }

    // Step 6: Find any 10-15 digit sequence
    // But exclude things that look like timestamps (13 digits starting with 1 or 2, from year 2024+)
    var allDigits = raw.match(/\d{10,15}/g);
    if (allDigits && allDigits.length > 0) {
        // Filter out timestamps and IDs
        var candidates = allDigits.filter(function(d) {
            // Skip if looks like Unix timestamp (13 digits, starts with 17)
            if (d.length === 13 && d.startsWith('17')) return false;
            // Skip if looks like year-based number
            if (d.startsWith('202') || d.startsWith('203') || d.startsWith('201')) return false;
            return true;
        });
        if (candidates.length === 0) candidates = allDigits; // fallback to all
        var best2 = candidates.sort(function(a, b) { return b.length - a.length; })[0];
        console.log('[EXTRACT] Method=DigitRegex phone=+' + best2);
        return { ok: true, phone: '+' + best2, id: null };
    }

    console.log('[EXTRACT] FAILED - no phone found');
    return { ok: false, error: 'No phone in response' };
}

// ========================================
// SIMPLE NUMBER BUYER
// ========================================
async function buyNumber(cid, maxUsd, sc) {
    for (var attempt = 0; attempt < 3; attempt++) {
        var mp = (maxUsd * (1 + attempt * 0.2)).toFixed(3);
        try {
            var url = FULL_API_URL + '?api_key=' + SMSBOWER_API_KEY + '&action=getNumber&service=' + sc + '&country=' + cid + '&maxPrice=' + mp;
            console.log('[BUY] Attempt ' + (attempt + 1) + ' URL: ' + url);
            var r = await axios.get(url, { timeout: 60000 });
            var result = extractPhone(r.data);
            console.log('[BUY] Attempt ' + (attempt + 1) + ' Result: ' + JSON.stringify(result));
            if (result.ok) return result;
        } catch (e) {
            console.log('[BUY] Attempt ' + (attempt + 1) + ' Error: ' + e.message);
        }
        if (attempt < 2) await waitMs(5000);
    }
    // One more try without maxPrice
    try {
        var url2 = FULL_API_URL + '?api_key=' + SMSBOWER_API_KEY + '&action=getNumber&service=' + sc + '&country=' + cid;
        console.log('[BUY] Final attempt URL: ' + url2);
        var r2 = await axios.get(url2, { timeout: 60000 });
        var result2 = extractPhone(r2.data);
        console.log('[BUY] Final Result: ' + JSON.stringify(result2));
        if (result2.ok) return result2;
    } catch (e) {
        console.log('[BUY] Final Error: ' + e.message);
    }
    return { ok: false, error: 'No number found' };
}

async function checkSms(aid) {
    try {
        var r = await axios.get(FULL_API_URL + '?api_key=' + SMSBOWER_API_KEY + '&action=getStatus&id=' + aid, { timeout: 30000 });
        var t = String(r.data || '').trim();
        if (t.indexOf('STATUS_OK:') === 0) return { ok: true, code: t.split(':')[1] };
        if (t === 'STATUS_WAIT_CODE') return { ok: true, waiting: true };
        return { ok: false, raw: t };
    } catch (e) { return { ok: false, error: e.message }; }
}

function ensureAuth(req, res, next) { if (!req.session.userId) return res.status(401).send('Login required'); next(); }
async function ensureAdmin(req, res, next) {
    try { if (!req.session.userId) return res.status(401).send('Login required'); var u = await findUserById(req.session.userId); if (!u || u.role !== 'admin') return res.status(403).send('Admin only'); req.user = u; next(); }
    catch (e) { res.status(500).send('Error'); }
}

app.get('/', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/reset-password', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/api/countries', function(req, res) { res.json(countries); });
app.get('/api/facebook/countries', function(req, res) { res.json(facebookCountries); });
app.get('/api/instagram/countries', function(req, res) { res.json(instagramCountries); });
app.get('/api/snapchat/countries', function(req, res) { res.json(snapchatCountries); });
app.get('/api/google/countries', function(req, res) { res.json(googleCountries); });
app.get('/api/tiktok/countries', function(req, res) { res.json(tiktokCountries); });

app.post('/api/forgot-password', async function(req, res) {
    try { var email = req.body.email; if (!vEmail(email)) return res.status(400).send('Valid email required'); var u = await findUser(email); if (!u) return res.json({ sent: false }); var token = crypto.randomBytes(32).toString('hex'); await qR('UPDATE users SET reset_token=$1,reset_token_expires=$2 WHERE id=$3', [token, new Date(Date.now() + 3600000).toISOString(), u.id]); res.json({ sent: true }); } catch (e) { res.status(500).send(safeErr(e)); }
});
app.post('/api/reset-password', async function(req, res) {
    try { var token = req.body.token, np = req.body.newPassword; if (!token || !vPass(np)) return res.status(400).send('Invalid'); var u = await q1('SELECT * FROM users WHERE reset_token=$1 AND reset_token_expires>NOW()', [token]); if (!u) return res.status(400).send('Expired'); await qR('UPDATE users SET password=$1,reset_token=NULL,reset_token_expires=NULL WHERE id=$2', [hashP(np), u.id]); res.json({ success: true }); } catch (e) { res.status(500).send(safeErr(e)); }
});
app.get('/api/auth/google', function(req, res) { res.redirect('/auth/google'); });
app.get('/auth/google', async function(req, res) {
    if (!ensureG()) return res.status(500).send('Google not configured');
    var state = crypto.randomBytes(16).toString('hex'); req.session.google_oauth_state = state;
    res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_CALLBACK_URL, response_type: 'code', scope: 'openid email profile', state: state }).toString());
});
app.get('/auth/google/callback', async function(req, res) {
    try {
        if (!ensureG()) return res.status(500).send('Google not configured');
        var code = req.query.code, state = req.query.state;
        if (!code || state !== req.session.google_oauth_state) return res.redirect('/');
        delete req.session.google_oauth_state;
        var tr = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, code: code, grant_type: 'authorization_code', redirect_uri: GOOGLE_CALLBACK_URL }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 });
        var pr = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + tr.data.access_token }, timeout: 30000 });
        if (!pr.data || !pr.data.email) return res.redirect('/');
        var u = await findUser(pr.data.email); if (!u) { await createUser(pr.data.name || '', pr.data.email, randP()); u = await findUser(pr.data.email); }
        if (!u || !u.is_active) return res.redirect('/');
        req.session.regenerate(function(e) { if (e) return res.redirect('/'); req.session.userId = u.id; res.redirect('/'); });
    } catch (e) { res.redirect('/'); }
});
app.post('/api/register', async function(req, res) {
    try { var n = String(req.body.name || '').trim(), e = sEmail(req.body.email), p = req.body.password; if (!n || !vEmail(e) || !vPass(p)) return res.status(400).send('Invalid input'); if (await findUser(e)) return res.status(400).send('Email exists'); await createUser(n, e, p); res.json({ success: true }); } catch (e) { res.status(500).send(safeErr(e)); }
});
app.post('/api/login', async function(req, res) {
    try {
        var e = sEmail(req.body.email), p = req.body.password;
        if (!vEmail(e) || !p) return res.status(400).send('Invalid input');
        var u = await findUser(e); if (!u || !u.is_active) return res.status(401).send('Invalid credentials');
        var match = await bcrypt.compare(p, u.password); if (!match) return res.status(401).send('Invalid credentials');
        await qR('UPDATE users SET login_attempts=0,last_login=CURRENT_TIMESTAMP WHERE id=$1', [u.id]);
        req.session.regenerate(function(e) { if (e) return res.status(500).send('Failed'); req.session.userId = u.id; res.json({ success: true }); });
    } catch (e) { res.status(500).send(safeErr(e)); }
});
app.post('/api/change-password', ensureAuth, async function(req, res) {
    try { var u = await findUserById(req.session.userId); if (!u) return res.status(404).send('Not found'); if (!(await bcrypt.compare(req.body.currentPassword, u.password))) return res.status(400).send('Wrong password'); await qR('UPDATE users SET password=$1 WHERE id=$2', [hashP(req.body.newPassword), u.id]); res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); }
});
app.get('/api/me', ensureAuth, async function(req, res) {
    try { var u = await findUserById(req.session.userId); if (!u) return res.status(401).send('Not found'); res.json({ id: u.id, name: u.name, email: u.email, balance: u.balance, role: u.role, referralCode: u.referral_code }); } catch (e) { res.status(500).send('Error'); }
});
app.get('/api/logout', function(req, res) { req.session.destroy(function() { res.clearCookie('mrf.sid'); res.send('OK'); }); });

// ===== MAIN ORDER ENDPOINT =====
app.post('/api/order', ensureAuth, async function(req, res) {
    var client = await pool.connect();
    try {
        var countryName = req.body.countryName, price = req.body.price, countryId = req.body.countryId, service = req.body.service;
        var cfg = svcConfig[service];
        if (!cfg) { client.release(); return res.status(400).send('Invalid service'); }
        var co = cfg.countries.find(function(c) { return c.name === countryName && Number(c.countryId) === Number(countryId); });
        if (!co) { client.release(); return res.status(400).send('Invalid country'); }

        await client.query('BEGIN');
        var ur = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.session.userId])).rows[0];
        if (!ur || Number(ur.balance) < Number(price)) { await client.query('ROLLBACK'); client.release(); return res.status(400).send('Insufficient balance'); }

        console.log('[ORDER] ===== START BUYING =====');
        console.log('[ORDER] service=' + cfg.code + ' country=' + countryId + ' maxUsd=' + pkrUsd(price));
        var result = await buyNumber(countryId, pkrUsd(price), cfg.code);
        console.log('[ORDER] ===== FINAL RESULT: ' + JSON.stringify(result) + ' =====');

        if (!result.ok || !result.phone) {
            await client.query('ROLLBACK'); client.release();
            return res.status(500).send('No number available. Try again.');
        }

        var now = new Date();
        await client.query('UPDATE users SET balance=$1 WHERE id=$2', [Number(ur.balance) - Number(price), ur.id]);
        var ins = (await client.query(
            'INSERT INTO orders(user_id,user_email,service_type,service_name,country,country_code,country_id,price,payment_method,order_status,phone_number,activation_id,expires_at,cancel_available_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id',
            [ur.id, ur.email, service, cfg.name, countryName, co.code, co.countryId, price, 'balance', 'active', result.phone, result.id || null, new Date(now.getTime() + 25 * 60000).toISOString(), new Date(now.getTime() + 60000).toISOString(), now.toISOString()]
        )).rows[0];
        await client.query('COMMIT');
        client.release();
        console.log('[ORDER] SUCCESS! id=' + ins.id + ' phone=' + result.phone);
        res.json({ id: ins.id, number: result.phone });
    } catch (e) {
        await client.query('ROLLBACK'); client.release();
        console.error('[ORDER] ERROR:', e);
        res.status(500).send(safeErr(e));
    }
});

app.get('/api/orders/:id', ensureAuth, async function(req, res) { try { var o = await getOrderById(Number(req.params.id)); if (!o) return res.status(404).send('Not found'); var u = await findUserById(req.session.userId); if (!u || (o.user_id !== u.id && u.role !== 'admin')) return res.status(403).send('No access'); res.json(o); } catch (e) { res.status(500).send('Error'); } });
app.get('/api/orders', ensureAuth, async function(req, res) { try { res.json(await getUserOrders(req.session.userId)); } catch (e) { res.status(500).send('Error'); } });

app.post('/api/orders/:id/replace', ensureAuth, async function(req, res) {
    try { var o = await getOrderById(Number(req.params.id)); if (!o) return res.status(404).send('Not found'); var u = await findUserById(req.session.userId); if (!u || o.user_id !== u.id || o.order_status !== 'active' || o.otp_received) return res.status(400).send('Cannot replace'); try { await axios.get(FULL_API_URL + '?api_key=' + SMSBOWER_API_KEY + '&action=setStatus&id=' + o.activation_id + '&status=8', { timeout: 30000 }); } catch (e) {} var r = await buyNumber(o.country_id, pkrUsd(o.price), svcConfig[o.service_type] ? svcConfig[o.service_type].code : 'wa'); if (!r.ok) return res.status(500).send('No replacement'); var now = new Date(); await updateOrder(o.id, { phone_number: r.phone, activation_id: r.id || null, otp_received: false, otp_code: null, order_status: 'active', created_at: now.toISOString(), expires_at: new Date(now.getTime() + 25 * 60000).toISOString(), cancel_available_at: new Date(now.getTime() + 60000).toISOString() }); res.json({ number: r.phone }); } catch (e) { res.status(500).send(safeErr(e)); }
});

app.post('/api/orders/:id/cancel', ensureAuth, async function(req, res) {
    var c = await pool.connect(); try { await c.query('BEGIN'); var o = (await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [Number(req.params.id)])).rows[0]; if (!o) { await c.query('ROLLBACK'); c.release(); return res.status(404).send('Not found'); } var u = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.session.userId])).rows[0]; if (!u || o.user_id !== u.id || o.order_status !== 'active' || o.otp_received || new Date() < new Date(o.cancel_available_at)) { await c.query('ROLLBACK'); c.release(); return res.status(400).send('Cannot cancel'); } try { await axios.get(FULL_API_URL + '?api_key=' + SMSBOWER_API_KEY + '&action=setStatus&id=' + o.activation_id + '&status=8', { timeout: 30000 }); } catch (e) {} await c.query('UPDATE users SET balance=$1 WHERE id=$2', [Number(u.balance || 0) + Number(o.price || 0), u.id]); await c.query('UPDATE orders SET order_status=$1 WHERE id=$2', ['cancelled', o.id]); await c.query('COMMIT'); c.release(); res.send('OK'); } catch (e) { await c.query('ROLLBACK'); c.release(); res.status(500).send(safeErr(e)); }
});

app.post('/api/orders/:id/complete', ensureAuth, async function(req, res) {
    try { var o = await getOrderById(Number(req.params.id)); if (!o || !o.otp_received) return res.status(400).send('Cannot complete'); try { await axios.get(FULL_API_URL + '?api_key=' + SMSBOWER_API_KEY + '&action=setStatus&id=' + o.activation_id + '&status=6', { timeout: 30000 }); } catch (e) {} await updateOrder(o.id, { order_status: 'completed', completed_at: new Date().toISOString() }); res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); }
});

app.post('/api/orders/:id/expire', ensureAuth, async function(req, res) {
    try { var o = await getOrderById(Number(req.params.id)); if (o && o.order_status === 'active' && !o.otp_received) { try { await axios.get(FULL_API_URL + '?api_key=' + SMSBOWER_API_KEY + '&action=setStatus&id=' + o.activation_id + '&status=8', { timeout: 30000 }); } catch (e) {} await updateOrder(o.id, { order_status: 'cancelled' }); } res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); }
});

app.get('/api/orders/:id/otp', ensureAuth, async function(req, res) {
    try {
        var o = await getOrderById(Number(req.params.id)); if (!o) return res.status(404).send('Not found');
        if (o.otp_received) return res.json({ received: true, code: o.otp_code });
        if (!o.activation_id) return res.json({ received: false, error: 'No ID' });
        if (new Date() >= new Date(o.expires_at) && !o.otp_received) { await updateOrder(o.id, { order_status: 'cancelled' }); return res.json({ received: false, expired: true }); }
        var sr = await checkSms(o.activation_id);
        if (sr.ok && sr.code) { await updateOrder(o.id, { otp_received: true, otp_code: sr.code, order_status: 'otp_received' }); return res.json({ received: true, code: sr.code }); }
        if (sr.ok && sr.waiting) return res.json({ received: false, waiting: true });
        return res.json({ received: false, error: true });
    } catch (e) { res.status(500).json({ received: false, error: true }); }
});

app.get('/api/admin/stats', ensureAdmin, async function(req, res) {
    try {
        var t = await q1("SELECT COALESCE(SUM(price),0) as rev, COUNT(*) as cnt FROM orders WHERE created_at>=CURRENT_DATE");
        var u = await q1("SELECT COUNT(*) as cnt FROM users");
        var a = await q1("SELECT COUNT(*) as cnt FROM orders WHERE order_status='active'");
        var s = await q1("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE otp_received=true) as ok FROM orders WHERE created_at>=CURRENT_DATE");
        var tr = await q1("SELECT COALESCE(SUM(price),0) as rev FROM orders");
        res.json({ todayRevenue: Number(t.rev || 0), todayOrders: Number(t.cnt || 0), totalUsers: Number(u.cnt || 0), activeOrders: Number(a.cnt || 0), todaySuccessRate: Number(s.total || 0) > 0 ? Math.round(Number(s.ok || 0) / Number(s.total || 0) * 100) : 0, totalRevenue: Number(tr.rev || 0), totalCost: 0, totalProfit: Number(tr.rev || 0) });
    } catch (e) { res.status(500).send(safeErr(e)); }
});
app.get('/api/admin/orders', ensureAdmin, async function(req, res) { try { res.json(await getAllOrders()); } catch (e) { res.status(500).send('Error'); } });
app.get('/api/admin/transactions', ensureAdmin, async function(req, res) { try { res.json(await qA("SELECT * FROM transactions WHERE status='pending' ORDER BY id DESC")); } catch (e) { res.status(500).send('Error'); } });
app.post('/api/admin/transactions/:id/approve', ensureAdmin, async function(req, res) { try { var c = await pool.connect(); await c.query('BEGIN'); var tx = (await c.query('SELECT * FROM transactions WHERE id=$1 FOR UPDATE', [Number(req.params.id)])).rows[0]; var u = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [tx.user_id])).rows[0]; await c.query('UPDATE transactions SET status=$1 WHERE id=$2', ['approved', tx.id]); await c.query('UPDATE users SET balance=$1 WHERE id=$2', [Number(u.balance || 0) + Number(tx.amount || 0), u.id]); await c.query('COMMIT'); c.release(); res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); } });
app.post('/api/admin/transactions/:id/reject', ensureAdmin, async function(req, res) { try { await qR('UPDATE transactions SET status=$1 WHERE id=$2', ['rejected', Number(req.params.id)]); res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); } });

app.post('/api/add-funds', ensureAuth, upload.single('screenshot'), async function(req, res) {
    try { var a = parseFloat(req.body.amount); if (!a || a < 150) return res.status(400).send('Min 150'); if (!req.file) return res.status(400).send('Screenshot required'); var u = await findUserById(req.session.userId); await qR('INSERT INTO transactions(user_id,user_email,amount,screenshot) VALUES($1,$2,$3,$4)', [req.session.userId, u.email, a, req.file.filename]); res.send('OK'); } catch (e) { res.status(500).send(safeErr(e)); }
});
app.use('/uploads', express.static(UPLOAD_DIR));

var countries = [
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
var facebookCountries = [ { name: 'Canada', code: '+1', price: 70, countryId: 36, flag: '🇨🇦' }, { name: 'USA', code: '+1', price: 80, countryId: 187, flag: '🇺🇸' }, { name: 'USA Virtual', code: '+1', price: 70, countryId: 12, flag: '🇺🇸' } ];
var instagramCountries = [ { name: 'USA', code: '+1', price: 70, countryId: 187, flag: '🇺🇸' }, { name: 'Indonesia', code: '+62', price: 30, countryId: 6, flag: '🇮🇩' }, { name: 'United Kingdom', code: '+44', price: 40, countryId: 16, flag: '🇬🇧' }, { name: 'Brazil', code: '+55', price: 30, countryId: 73, flag: '🇧🇷' } ];
var snapchatCountries = [ { name: 'USA', code: '+1', price: 70, countryId: 187, flag: '🇺🇸' }, { name: 'Colombia', code: '+57', price: 30, countryId: 33, flag: '🇨🇴' }, { name: 'USA Virtual', code: '+1', price: 20, countryId: 12, flag: '🇺🇸' } ];
var googleCountries = [ { name: 'Indonesia', code: '+62', price: 90, countryId: 6, flag: '🇮🇩' } ];
var tiktokCountries = [ { name: 'United Kingdom', code: '+44', price: 70, countryId: 16, flag: '🇬🇧' }, { name: 'Indonesia', code: '+62', price: 40, countryId: 6, flag: '🇮🇩' }, { name: 'USA', code: '+1', price: 70, countryId: 187, flag: '🇺🇸' } ];
var svcConfig = { whatsapp: { code: 'wa', countries: countries, name: 'WhatsApp Number' }, facebook: { code: 'fb', countries: facebookCountries, name: 'Facebook Number' }, instagram: { code: 'ig', countries: instagramCountries, name: 'Instagram Number' }, snapchat: { code: 'sc', countries: snapchatCountries, name: 'Snapchat Number' }, google: { code: 'go', countries: googleCountries, name: 'Google Number' }, tiktok: { code: 'tk', countries: tiktokCountries, name: 'TikTok Number' } };

async function initDB() {
    await qR('CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT,balance NUMERIC(12,2) DEFAULT 0,role TEXT DEFAULT \'user\',referral_code TEXT,is_active BOOLEAN DEFAULT TRUE,login_attempts INTEGER DEFAULT 0,last_login TIMESTAMPTZ,reset_token TEXT,reset_token_expires TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)');
    await qR('CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,user_email TEXT,service_type TEXT,service_name TEXT,country TEXT,country_code TEXT,country_id INTEGER,price NUMERIC(12,2),payment_method TEXT,order_status TEXT DEFAULT \'pending\',phone_number TEXT,activation_id TEXT,otp_received BOOLEAN DEFAULT FALSE,otp_code TEXT,expires_at TIMESTAMPTZ,cancel_available_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,completed_at TIMESTAMPTZ)');
    await qR('CREATE TABLE IF NOT EXISTS transactions(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,user_email TEXT,amount NUMERIC(12,2),screenshot TEXT,status TEXT DEFAULT \'pending\',created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)');
    try { await qR('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT'); } catch (e) {}
    try { await qR('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ'); } catch (e) {}
    if (ADMIN_EMAIL && ADMIN_PASSWORD) { var ae = sEmail(ADMIN_EMAIL); var ex = normUser(await q1('SELECT * FROM users WHERE email=$1', [ae])); if (!ex) { await qR('INSERT INTO users(email,password,name,role,referral_code) VALUES($1,$2,$3,$4,$5)', [ae, hashP(ADMIN_PASSWORD), ADMIN_NAME, 'admin', 'ADMIN']); } else if (ex.role !== 'admin') { await qR('UPDATE users SET role=$1 WHERE id=$2', ['admin', ex.id]); } }
}
async function findUser(e) { return normUser(await q1('SELECT * FROM users WHERE email=$1', [sEmail(e)])); }
async function findUserById(id) { return normUser(await q1('SELECT * FROM users WHERE id=$1', [id])); }
async function createUser(n, e, p) { return qR('INSERT INTO users(email,password,name,referral_code) VALUES($1,$2,$3,$4)', [sEmail(e), hashP(p), String(n || '').trim(), Math.random().toString(36).substring(2, 10).toUpperCase()]); }
async function getUserOrders(uid) { return (await qA('SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC', [uid])).map(normOrder); }
async function getOrderById(id) { return normOrder(await q1('SELECT * FROM orders WHERE id=$1', [id])); }
async function updateOrder(id, u) { var k = Object.keys(u); if (!k.length) return; await qR('UPDATE orders SET ' + k.map(function(key, i) { return key + '=$' + (i + 1); }).join(',') + ' WHERE id=$' + (k.length + 1), k.map(function(key) { return u[key]; }).concat([id])); }
async function getAllOrders() { return (await qA('SELECT * FROM orders ORDER BY id DESC')).map(normOrder); }

initDB().then(function() { app.listen(PORT, '0.0.0.0', function() { console.log('Running on ' + PORT + ' | API URL: ' + FULL_API_URL); }); }).catch(function(e) { console.error('DB fail:', e); process.exit(1); });
