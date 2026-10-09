'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const { get, run } = require('./db');
const config = require('./config');
const security = require('./security');
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const cookieName = config.production ? '__Host-hipkop' : 'hipkop-session';
function current(req) {
  const token = String(req.headers?.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return get(`SELECT u.id, u.username, u.display_name AS displayName, s.csrf FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`, [digest(token), Date.now()]);
}
function cookie(token, maxAge) {
  return `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${config.production ? '; Secure' : ''}`;
}
function session(req, res, id) {
  run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
  const old = String(req.headers?.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (old) run('DELETE FROM sessions WHERE token_hash = ?', [digest(old)]);
  const token = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(24).toString('hex');
  run('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)', [digest(token), id, csrf, Date.now() + 7 * 86400000]);
  // Bound live sessions per account as well as their expiry.
  run('DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY expires_at DESC LIMIT 10)', [id, id]);
  res.setHeader('Set-Cookie', cookie(token, 7 * 86400));
  return { user: get('SELECT id, username, display_name AS displayName FROM users WHERE id = ?', [id]), csrf };
}
function requireUser(req, res) {
  const user = current(req);
  if (!user) { security.reject(res, 401, 'login_required'); return null; }
  if (!security.equal(user.csrf, req.headers?.['x-csrf-token'])) { security.reject(res, 403, 'csrf_invalid'); return null; }
  return user;
}
async function handle(req, res, url, json) {
  if (!url.pathname.startsWith('/api/auth/')) return false;
  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const user = current(req);
    json(res, { user: user ? { id: user.id, username: user.username, displayName: user.displayName } : null, csrf: user?.csrf || null, requireAccount: config.requireAccount, moderated: config.moderatePosts });
    return true;
  }
  if (req.method !== 'POST') { security.reject(res, 405, 'method_not_allowed'); return true; }
  if (!security.sameOrigin(req, res) || !security.rateLimit(req, res, 'auth', 10, 15 * 60000)) return true;
  if (url.pathname === '/api/auth/logout') {
    const user = requireUser(req, res); if (!user) return true;
    run('DELETE FROM sessions WHERE user_id = ? AND csrf = ?', [user.id, user.csrf]);
    res.setHeader('Set-Cookie', cookie('', 0)); json(res, { ok: true }); return true;
  }
  if (!['/api/auth/register', '/api/auth/login'].includes(url.pathname)) { security.reject(res, 404, 'not_found'); return true; }
  const body = await security.readJson(req);
  const username = String(body.username || '').trim().toLowerCase(), password = String(body.password || '');
  if (!/^[a-z0-9_-]{3,32}$/.test(username) || password.length < 10 || password.length > 128) {
    security.reject(res, 400, 'invalid_credentials_format'); return true;
  }
  if (url.pathname.endsWith('/register')) {
    const displayName = String(body.displayName || username).trim().slice(0, 40);
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    const id = crypto.randomUUID();
    try {
      run('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)', [id, username, displayName || username, `${salt}:${hash}`, new Date().toISOString()]);
    } catch (error) {
      if (get('SELECT id FROM users WHERE username = ?', [username])) { security.reject(res, 409, 'username_taken'); return true; }
      throw error;
    }
    json(res, session(req, res, id), 201); return true;
  }
  const user = get('SELECT id,password_hash FROM users WHERE username = ?', [username]);
  const [salt, expected] = (user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const actual = (await scrypt(password, salt, 64)).toString('hex');
  if (!user || !security.equal(actual, expected)) { security.reject(res, 401, 'invalid_credentials'); return true; }
  json(res, session(req, res, user.id)); return true;
}
module.exports = { handle, current, requireUser };
