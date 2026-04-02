const express = require('express');
const session = require('express-session');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);

const app = express();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const upload = multer({ dest: UPLOAD_DIR });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
}

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    console.error('SESSION_SECRET is missing or too short.');
    process.exit(1);
}

const SMSBOWER_API_KEY = process.env.SMSBOWER_API_KEY || 'CHANGE_THIS_API_KEY';
const SMSBOWER_URL = 'https://smsbower.page/stubs/handler_api.php';

const SMSBOWER_WA_SERVICE = 'wa';
const SMSBOWER_FB_SERVICE = 'fb';
const SMSBOWER_IG_SERVICE = 'ig';
const SMSBOWER_SNAPCHAT_SERVICE = 'fu';
const SMSBOWER_GOOGLE_SERVICE = 'go';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || '';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 60;

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: IS_PROD ? { rejectUnauthorized: false } : false
});

const mailTransporter = SMTP_HOST && SMTP_FROM
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
    })
    : null;

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.use(express.static('public', { index: false }));

app.use(session({
    store: new pgSession({
        pool,
        tableName: 'user_sessions',
        createTableIfMissing: true
    }),
    name: 'mrf.sid',
    secret: SESSION_SECRET,
    proxy: true,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    unset: 'destroy',
    cookie: {
        secure: 'auto',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

function normalizeUser(row) {
    if (!row) return null;
    return {
        ...row,
        balance: Number(row.balance || 0),
        referralCode: row.referral_code,
        is_active: row.is_active,
        login_attempts: row.login_attempts
    };
}

function normalizeOrder(row) {
    if (!row) return null;
    return {
        ...row,
        price: Number(row.price || 0),
        provider_cost_pkr: Number(row.provider_cost_pkr || 0),
        client_balance_left: row.client_balance_left == null ? null : Number(row.client_balance_left),
        profit_pkr: row.profit_pkr == null ? null : Number(row.profit_pkr),
        otp_received: row.otp_received
    };
}

function normalizeTransaction(row) {
    if (!row) return null;
    return {
        ...row,
        amount: Number(row.amount || 0),
        user_name: row.user_name || '',
        user_email: row.user_email || ''
    };
}

async function queryOne(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
}

async function queryAll(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows;
}

async function queryRun(sql, params = []) {
    return pool.query(sql, params);
}

function isPasswordHashed(password) {
    return typeof password === 'string' && /^\$2[aby]\$\d{2}\$/.test(password);
}

async function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(inputPassword, storedPassword) {
    if (!storedPassword || typeof storedPassword !== 'string') {
        return { valid: false, needsUpgrade: false };
    }
    if (isPasswordHashed(storedPassword)) {
        const valid = await bcrypt.compare(inputPassword, storedPassword);
        return { valid, needsUpgrade: false };
    }
    const valid = inputPassword === storedPassword;
    return { valid, needsUpgrade: valid };
}

function sanitizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    return typeof password === 'string' && password.length >= 6;
}

function randomPassword() {
    return crypto.randomBytes(24).toString('hex');
}

function ensureGoogleConfigured() {
    return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CALLBACK_URL;
}

function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pkrToUsd(pkr) {
    return parseFloat((pkr / 280).toFixed(3));
}

function formatSafeError(err, fallback = 'Server error') {
    if (!err) return fallback;
    if (typeof err.message === 'string' && err.message.trim()) return err.message;
    return fallback;
}

function isMailConfigured() {
    return Boolean(mailTransporter);
}

function hashToken(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function buildAbsoluteUrl(relativePath) {
    const base = APP_BASE_URL.endsWith('/') ? APP_BASE_URL : `${APP_BASE_URL}/`;
    return new URL(String(relativePath || '').replace(/^\//, ''), base).toString();
}

async function sendPasswordResetEmail(user, token) {
    if (!mailTransporter) {
        throw new Error('Password reset email is not configured');
    }
    const resetUrl = buildAbsoluteUrl(`/reset-password.html?token=${encodeURIComponent(token)}`);
    const recipientName = String(user.name || 'there').trim();
    await mailTransporter.sendMail({
        from: SMTP_FROM,
        to: user.email,
        subject: 'Reset your MRF SMS password',
        text: `Hello ${recipientName},\n\nUse this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request it, you can safely ignore this email.`,
        html: `
            <div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:32px;">
                <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:24px;padding:32px;border:1px solid #e2e8f0;box-shadow:0 16px 40px rgba(15,23,42,0.08);">
                    <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">MRF SMS</div>
                    <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#0f172a;">Reset your password</h1>
                    <p style="margin:0 0 20px;color:#475569;line-height:1.7;">Hello ${recipientName}, we received a request to reset your password. Click the button below to continue.</p>
                    <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">Reset Password</a>
                    <p style="margin:20px 0 0;color:#64748b;line-height:1.7;">This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
                    <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;word-break:break-all;">Direct link: ${resetUrl}</p>
                </div>
            </div>
        `
    });
}

async function initDB() {
    await queryRun(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT,
            balance NUMERIC(12,2) DEFAULT 0,
            role TEXT DEFAULT 'user',
            referral_code TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            login_attempts INTEGER DEFAULT 0,
            last_login TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await queryRun('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT');
    await queryRun('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ');
    await queryRun('CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (reset_token)');

    await queryRun(`
        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            user_email TEXT,
            service_type TEXT,
            service_name TEXT,
            country TEXT,
            country_code TEXT,
            country_id INTEGER,
            price NUMERIC(12,2),
            provider_cost_pkr NUMERIC(12,2) DEFAULT 0,
            payment_method TEXT,
            payment_status TEXT DEFAULT 'pending',
            order_status TEXT DEFAULT 'pending',
            phone_number TEXT,
            activation_id TEXT,
            otp_received BOOLEAN DEFAULT FALSE,
            otp_code TEXT,
            expires_at TIMESTAMPTZ,
            cancel_available_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMPTZ
        )
    `);

    await queryRun('ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_cost_pkr NUMERIC(12,2) DEFAULT 0');

    await queryRun(`
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            user_email TEXT,
            amount NUMERIC(12,2),
            screenshot TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
        const adminEmail = sanitizeEmail(ADMIN_EMAIL);
        const existingAdmin = normalizeUser(await queryOne('SELECT * FROM users WHERE email = $1', [adminEmail]));
        if (!existingAdmin) {
            const hashedAdminPassword = await hashPassword(ADMIN_PASSWORD);
            await queryRun(
                'INSERT INTO users (email, password, name, role, referral_code) VALUES ($1, $2, $3, $4, $5)',
                [adminEmail, hashedAdminPassword, ADMIN_NAME, 'admin', 'ADMIN']
            );
            console.log('Admin user created from environment variables');
        } else if (existingAdmin.role !== 'admin') {
            await queryRun('UPDATE users SET role = $1 WHERE id = $2', ['admin', existingAdmin.id]);
            console.log('Existing admin email promoted to admin role');
        }
    } else {
        console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin auto-create');
    }
}

async function findUser(email) {
    return normalizeUser(await queryOne('SELECT * FROM users WHERE email = $1', [sanitizeEmail(email)]));
}

async function findUserById(id) {
    return normalizeUser(await queryOne('SELECT * FROM users WHERE id = $1', [id]));
}

async function createUser(name, email, password) {
    const referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const hashedPassword = await hashPassword(password);
    return queryRun(
        'INSERT INTO users (email, password, name, referral_code) VALUES ($1, $2, $3, $4)',
        [sanitizeEmail(email), hashedPassword, String(name || '').trim(), referralCode]
    );
}

async function updateUserPassword(userId, newPlainPassword) {
    const hashed = await hashPassword(newPlainPassword);
    return queryRun('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId]);
}

async function updateUserPasswordHash(userId, hashedPassword) {
    return queryRun('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
}

async function savePasswordResetToken(userId, tokenHash, expiresAt) {
    return queryRun(
        'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
        [tokenHash, expiresAt, userId]
    );
}

async function clearPasswordResetToken(userId) {
    return queryRun(
        'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = $1',
        [userId]
    );
}

async function findUserByResetToken(token) {
    const tokenHash = hashToken(token);
    return normalizeUser(await queryOne(
        'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > CURRENT_TIMESTAMP',
        [tokenHash]
    ));
}

async function getPendingTransactions() {
    const rows = await queryAll(`
        SELECT
            t.*,
            COALESCE(u.name, '') AS user_name,
            COALESCE(u.email, t.user_email) AS user_email
        FROM transactions t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.status = $1
        ORDER BY t.id DESC
    `, ['pending']);
    return rows.map(normalizeTransaction);
}

async function getTransactionHistory() {
    const rows = await queryAll(`
        SELECT
            t.*,
            COALESCE(u.name, '') AS user_name,
            COALESCE(u.email, t.user_email) AS user_email
        FROM transactions t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.status <> $1
        ORDER BY t.id DESC
    `, ['pending']);
    return rows.map(normalizeTransaction);
}

async function approveTransaction(txId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const txRes = await client.query('SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [txId]);
        const tx = txRes.rows[0];
        if (!tx) throw new Error('Transaction not found');
        if (tx.status !== 'pending') throw new Error('Only pending transactions can be approved');
        const userRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [tx.user_id]);
        const user = userRes.rows[0];
        if (!user) throw new Error('User not found');
        await client.query('UPDATE transactions SET status = $1 WHERE id = $2', ['approved', txId]);
        await client.query(
            'UPDATE users SET balance = $1 WHERE id = $2',
            [Number(user.balance || 0) + Number(tx.amount || 0), tx.user_id]
        );
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function cancelTransaction(txId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const txRes = await client.query('SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [txId]);
        const tx = txRes.rows[0];
        if (!tx) throw new Error('Transaction not found');
        if (tx.status !== 'pending') throw new Error('Only pending transactions can be cancelled');
        await client.query('UPDATE transactions SET status = $1 WHERE id = $2', ['cancelled', txId]);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function getOrdersByUser(userId) {
    const rows = await queryAll('SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC', [userId]);
    return rows.map(normalizeOrder);
}

async function getOrderById(orderId) {
    return normalizeOrder(await queryOne('SELECT * FROM orders WHERE id = $1', [orderId]));
}

async function updateOrder(orderId, updates) {
    const keys = Object.keys(updates);
    if (!keys.length) return;
    const fields = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
    const values = keys.map((key) => updates[key]);
    values.push(orderId);
    await queryRun(`UPDATE orders SET ${fields} WHERE id = $${values.length}`, values);
}

async function getAllOrders() {
    const rows = await queryAll(`
        SELECT
            o.*,
            COALESCE(u.email, o.user_email) AS user_email,
            COALESCE(u.balance, 0) AS client_balance_left,
            CASE
                WHEN COALESCE(o.provider_cost_pkr, 0) > 0
                    THEN ROUND((COALESCE(o.price, 0) - COALESCE(o.provider_cost_pkr, 0))::numeric, 2)
                ELSE NULL
            END AS profit_pkr
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        ORDER BY o.id DESC
    `);
    return rows.map(normalizeOrder);
}

async function updateUserLoginAttempts(userId, attempts) {
    return queryRun('UPDATE users SET login_attempts = $1 WHERE id = $2', [attempts, userId]);
}

async function updateUserLastLogin(userId) {
    return queryRun('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
}

const whatsappCountries = [
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
    { name: 'Canada', code: '+1', price: 150, countryId: 36, flag: '🇨🇦' },
    { name: 'USA', code: '+1', price: 250, countryId: 187, flag: '🇺🇸' },
    { name: 'USA Virtual', code: '+1', price: 80, countryId: 189, flag: '🇺🇸' }
];

const instagramCountries = [
    { name: 'Indonesia', code: '+62', price: 200, countryId: 6, flag: '🇮🇩' },
    { name: 'USA', code: '+1', price: 400, countryId: 187, flag: '🇺🇸' },
    { name: 'United Kingdom', code: '+44', price: 450, countryId: 16, flag: '🇬🇧' }
];

const snapchatCountries = [
    { name: 'Indonesia', code: '+62', price: 200, countryId: 6, flag: '🇮🇩' },
    { name: 'USA', code: '+1', price: 400, countryId: 187, flag: '🇺🇸' }
];

const googleCountries = [
    { name: 'USA Virtual', code: '+1', price: 80, countryId: 189, flag: '🇺🇸' },
    { name: 'Indonesia', code: '+62', price: 200, countryId: 6, flag: '🇮🇩' },
    { name: 'Brazil', code: '+55', price: 370, countryId: 73, flag: '🇧🇷' },
    { name: 'USA', code: '+1', price: 400, countryId: 187, flag: '🇺🇸' }
];

const serviceCatalog = {
    whatsapp: {
        serviceType: 'whatsapp',
        serviceName: 'WhatsApp Number',
        serviceCode: SMSBOWER_WA_SERVICE,
        countries: whatsappCountries
    },
    facebook: {
        serviceType: 'facebook',
        serviceName: 'Facebook Number',
        serviceCode: SMSBOWER_FB_SERVICE,
        countries: facebookCountries
    },
    instagram: {
        serviceType: 'instagram',
        serviceName: 'Instagram Number',
        serviceCode: SMSBOWER_IG_SERVICE,
        countries: instagramCountries
    },
    snapchat: {
        serviceType: 'snapchat',
        serviceName: 'Snapchat Number',
        serviceCode: SMSBOWER_SNAPCHAT_SERVICE,
        countries: snapchatCountries
    },
    google: {
        serviceType: 'google',
        serviceName: 'Google / Gmail / YouTube Number',
        serviceCode: SMSBOWER_GOOGLE_SERVICE,
        countries: googleCountries
    }
};

function getServiceConfig(serviceType) {
    return serviceCatalog[String(serviceType || '').trim().toLowerCase()] || null;
}

function parseV1NumberResponse(text) {
    const raw = String(text || '').trim();
    if (raw.startsWith('ACCESS_NUMBER:')) {
        const parts = raw.split(':');
        if (parts.length >= 3) {
            return {
                success: true,
                activationId: parts[1],
                phoneNumber: parts[2].startsWith('+') ? parts[2] : `+${parts[2]}`
            };
        }
    }
    return { success: false, error: raw || 'No number available' };
}

function parseNumberResponse(data) {
    if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return parseNumberResponse(JSON.parse(trimmed));
            } catch {
                return parseV1NumberResponse(trimmed);
            }
        }
        return parseV1NumberResponse(trimmed);
    }
    if (data && typeof data === 'object') {
        if (data.activationId && data.phoneNumber) {
            return {
                success: true,
                activationId: String(data.activationId),
                phoneNumber: String(data.phoneNumber).startsWith('+')
                    ? String(data.phoneNumber)
                    : `+${String(data.phoneNumber)}`
            };
        }
    }
    return { success: false, error: 'No number available' };
}

function extractProvidersRecursive(node, bucket = [], seen = new Set()) {
    if (!node || typeof node !== 'object') return bucket;
    if (
        Object.prototype.hasOwnProperty.call(node, 'provider_id') &&
        Object.prototype.hasOwnProperty.call(node, 'price')
    ) {
        const providerId = Number(node.provider_id);
        const providerPrice = Number(node.price);
        if (!Number.isNaN(providerId) && !Number.isNaN(providerPrice)) {
            const key = `${providerId}:${providerPrice}`;
            if (!seen.has(key)) {
                seen.add(key);
                bucket.push({
                    provider_id: providerId,
                    price: providerPrice,
                    count: node.count
                });
            }
        }
    }
    for (const value of Object.values(node)) {
        if (value && typeof value === 'object') {
            extractProvidersRecursive(value, bucket, seen);
        }
    }
    return bucket;
}

async function fetchProviderTiers(countryId, serviceCode = 'wa') {
    const url = `${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=getPricesV3&service=${serviceCode}&country=${countryId}`;
    const response = await axios.get(url, { timeout: 15000 });
    const data = response.data;
    let providers = [];
    if (data && typeof data === 'object') {
        const countryNode =
            data[String(countryId)] ??
            data[countryId] ??
            (Object.keys(data).length === 1 ? Object.values(data)[0] : null);
        const serviceNode =
            countryNode?.[serviceCode] ??
            (countryNode && Object.keys(countryNode).length === 1 ? Object.values(countryNode)[0] : null);
        providers = extractProvidersRecursive(serviceNode || data);
    }
    providers = providers
        .filter((p) => Number.isFinite(p.provider_id) && Number.isFinite(p.price))
        .sort((a, b) => a.price - b.price);
    return providers;
}

async function buyNumberFromProvider(countryId, provider, serviceCode = 'wa') {
    const url =
        `${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}` +
        `&action=getNumberV2` +
        `&service=${serviceCode}` +
        `&country=${countryId}` +
        `&maxPrice=${provider.price}` +
        `&providerIds=${provider.provider_id}`;
    try {
        const response = await axios.get(url, { timeout: 15000 });
        const parsed = parseNumberResponse(response.data);
        if (parsed.success) {
            return {
                ...parsed,
                provider_id: provider.provider_id,
                provider_price: provider.price
            };
        }
        return { success: false, error: parsed.error || 'No number from provider' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function buyNumberByTierStrategy(countryId, clientMaxUsd, serviceCode = 'wa') {
    try {
        const providers = await fetchProviderTiers(countryId, serviceCode);
        const affordableProviders = providers
            .filter((p) => p.price <= clientMaxUsd + 0.000001)
            .slice(0, 5);
        if (!affordableProviders.length) {
            return {
                success: false,
                strategy: 'provider_unavailable',
                error: 'No provider tiers available in your price range'
            };
        }
        for (const provider of affordableProviders) {
            const startedAt = Date.now();
            let lastError = 'No number from provider';
            while (Date.now() - startedAt < 15000) {
                const result = await buyNumberFromProvider(countryId, provider, serviceCode);
                if (result.success) {
                    return {
                        success: true,
                        activationId: result.activationId,
                        phoneNumber: result.phoneNumber,
                        strategy: 'provider',
                        provider_id: result.provider_id,
                        provider_price: result.provider_price
                    };
                }
                lastError = result.error || lastError;
                const elapsed = Date.now() - startedAt;
                const remaining = 15000 - elapsed;
                if (remaining <= 0) break;
                await waitMs(Math.min(5000, remaining));
            }
        }
        return {
            success: false,
            strategy: 'provider_exhausted',
            error: 'No number found in lowest 5 price tiers'
        };
    } catch (err) {
        return {
            success: false,
            strategy: 'provider_unavailable',
            error: err.message
        };
    }
}

async function buyNumberWithRetry(countryId, baseUsdPrice, maxAttempts = 3, serviceCode = 'wa') {
    const priceSteps = [];
    for (let i = 0; i < maxAttempts; i++) {
        priceSteps.push((baseUsdPrice * (1 + i * 0.05)).toFixed(3));
    }
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const maxPriceUSD = priceSteps[attempt - 1];
        try {
            const url = `${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=getNumber&service=${serviceCode}&country=${countryId}&maxPrice=${maxPriceUSD}`;
            const response = await axios.get(url, { timeout: 15000 });
            const parsed = parseNumberResponse(response.data);
            if (parsed.success) {
                return {
                    success: true,
                    activationId: parsed.activationId,
                    phoneNumber: parsed.phoneNumber,
                    strategy: 'fallback'
                };
            }
            if (attempt < maxAttempts) {
                await waitMs(8000);
            }
        } catch (err) {
            if (attempt === maxAttempts) {
                return { success: false, error: err.message };
            }
            await waitMs(8000);
        }
    }
    return { success: false, error: 'No number available after all attempts' };
}

async function getBestAvailableNumber(countryId, clientMaxUsd, serviceCode = 'wa') {
    let result = await buyNumberByTierStrategy(countryId, clientMaxUsd, serviceCode);
    if (!result.success && result.strategy === 'provider_unavailable') {
        result = await buyNumberWithRetry(countryId, clientMaxUsd, 3, serviceCode);
    }
    return result;
}

async function checkSmsStatus(activationId) {
    try {
        const url = `${SMSBOWER_URL}?api_key=${SMSBOWER_API_KEY}&action=getStatus&id=${activationId}`;
        const response = await axios.get(url, { timeout: 15000 });
        const resText = String(response.data || '').trim();
        if (resText.startsWith('STATUS_OK:')) {
            return { success: true, code: resText.split(':')[1] };
        }
        if (resText === 'STATUS_WAIT_CODE') {
            return { success: true, waiting: true };
        }
        return { success: false, raw: resText };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function ensureAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).send('Login required');
    next();
}

async function ensureAdmin(req, res, next) {
    try {
        if (!req.session.userId) return res.status(401).send('Login required');
        const user = await findUserById(req.session.userId);
        if (!user || user.role !== 'admin') return res.status(403).send('Admin only');
        req.user = user;
        next();
    } catch {
        res.status(500).send('Server error');
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/countries', (req, res) => {
    res.json(whatsappCountries);
});

app.get('/api/facebook/countries', (req, res) => {
    res.json(serviceCatalog.facebook.countries);
});

app.get('/api/services/:service/countries', (req, res) => {
    const serviceConfig = getServiceConfig(req.params.service);
    if (!serviceConfig) return res.status(404).send('Service not found');
    res.json(serviceConfig.countries);
});

app.get('/api/auth/google', (req, res) => {
    return res.redirect('/auth/google');
});

app.get('/auth/google', (req, res) => {
    if (!ensureGoogleConfigured()) {
        return res.status(500).send('Google login not configured');
    }
    const state = crypto.randomBytes(16).toString('hex');
    req.session.google_oauth_state = state;
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_CALLBACK_URL,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'online',
        prompt: 'select_account'
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/auth/google/callback', async (req, res) => {
    try {
        if (!ensureGoogleConfigured()) {
            return res.status(500).send('Google login not configured');
        }
        const { code, state, error } = req.query;
        if (error) return res.redirect('/?google_error=access_denied');
        if (!code || !state || state !== req.session.google_oauth_state) {
            return res.redirect('/?google_error=invalid_state');
        }
        delete req.session.google_oauth_state;
        const tokenResponse = await axios.post(
            'https://oauth2.googleapis.com/token',
            new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: GOOGLE_CALLBACK_URL
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 15000
            }
        );
        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
            return res.redirect('/?google_error=no_access_token');
        }
        const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 15000
        });
        const profile = profileResponse.data;
        if (!profile || !profile.email) {
            return res.redirect('/?google_error=no_email');
        }
        let user = await findUser(profile.email);
        if (!user) {
            await createUser(
                profile.name || profile.email.split('@')[0],
                profile.email,
                randomPassword()
            );
            user = await findUser(profile.email);
        }
        if (!user) return res.redirect('/?google_error=user_create_failed');
        if (!user.is_active) return res.redirect('/?google_error=account_blocked');
        await updateUserLastLogin(user.id);
        await updateUserLoginAttempts(user.id, 0);
        req.session.regenerate((regenErr) => {
            if (regenErr) return res.redirect('/?google_error=session_failed');
            req.session.userId = user.id;
            req.session.save((saveErr) => {
                if (saveErr) return res.redirect('/?google_error=session_save_failed');
                return res.redirect('/');
            });
        });
    } catch {
        return res.redirect('/?google_error=oauth_failed');
    }
});

app.post('/api/forgot-password', async (req, res) => {
    try {
        if (!isMailConfigured()) {
            return res.status(503).send('Password reset email is not configured');
        }
        const email = sanitizeEmail(req.body.email);
        if (!validateEmail(email)) return res.status(400).send('Valid email is required');
        const user = await findUser(email);
        if (user) {
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString();
            await savePasswordResetToken(user.id, hashToken(token), expiresAt);
            await sendPasswordResetEmail(user, token);
        }
        res.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
    } catch (err) {
        res.status(500).send(formatSafeError(err, 'Could not send password reset email'));
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const token = String(req.body.token || '').trim();
        const newPassword = req.body.newPassword;
        if (!token) return res.status(400).send('Reset token is required');
        if (!validatePassword(newPassword)) {
            return res.status(400).send('New password must be at least 6 characters');
        }
        const user = await findUserByResetToken(token);
        if (!user) return res.status(400).send('Reset link is invalid or expired');
        await updateUserPassword(user.id, newPassword);
        await clearPasswor
