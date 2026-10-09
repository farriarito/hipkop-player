'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hipkop-production-'));
process.env.NODE_ENV = 'production';
process.env.HIPKOP_ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');
process.env.HIPKOP_DB_PATH = path.join(dir, 'catalog.sqlite');
process.env.HIPKOP_MEDIA_DIR = path.join(dir, 'media');
process.env.HIPKOP_SCHEDULER = 'false';
process.env.HIPKOP_DISABLED_PROVIDERS = 'itunes,deezer,musicbrainz,lastfm';
const { server } = require('../server');
const database = require('../src/db');
const repo = require('../src/repo');
let base, cookie, csrf, postId;
const admin = () => ({ Authorization: `Bearer ${process.env.HIPKOP_ADMIN_TOKEN}` });
const write = (data, headers = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  repo.createPost({ title: '原有帖子', body: '保留既有内容', author: '原作者' });
});
test.after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  database.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test('production: missing administrator token fails closed; platform PORT is read', () => {
  const cwd = path.resolve(__dirname, '..');
  const invalid = spawnSync(process.execPath, ['-e', "require('./src/config')"], { cwd, env: { ...process.env, HIPKOP_ADMIN_TOKEN: '' } });
  assert.notEqual(invalid.status, 0);
  const valid = spawnSync(process.execPath, ['-e', "console.log(require('./src/config').port)"], { cwd, env: { ...process.env, PORT: '10000', HIPKOP_PLAYER_PORT: '' }, encoding: 'utf8' });
  assert.equal(valid.stdout.trim(), '10000');
});
test('production: H5 is the real product and sets security headers', async () => {
  const res = await fetch(`${base}/hipkop`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /HIPKOP · Culture Feed/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /object-src 'none'/);
});
test('production: public health keeps catalog counts but hides paths and diagnostics', async () => {
  const res = await fetch(`${base}/api/health`), body = await res.json();
  assert.equal(body.stats.posts, 1);
  assert.equal(body.storage.path, undefined);
  assert.equal(body.consistency, undefined);
  assert.equal(body.stats.pendingJobs, undefined);
  assert.equal(body.providers[0].lastError, undefined);
  const privateHealth = await fetch(`${base}/api/admin/health`, { headers: admin() });
  assert.equal((await privateHealth.json()).storage.path, process.env.HIPKOP_DB_PATH);
});
test('production: sync/admin APIs require token and sync mutations reject GET', async () => {
  for (const endpoint of ['/api/sync/jobs','/api/sync/releases','/api/sync/calibrate','/api/admin/posts']) {
    assert.equal((await fetch(base + endpoint)).status, 401);
  }
  assert.equal((await fetch(`${base}/api/sync/calibrate`, { headers: admin() })).status, 405);
  assert.equal((await fetch(`${base}/api/sync/calibrate`, write({}, admin()))).status, 200);
});
test('production: posting requires an account; unsupported methods and cross-site writes are blocked', async () => {
  assert.equal((await fetch(`${base}/api/community/posts`, write({ title: 'x', body: 'y' }))).status, 401);
  assert.equal((await fetch(`${base}/api/releases`, { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(`${base}/api/auth/register`, write({}, { Origin: 'https://evil.invalid' }))).status, 403);
});
test('production: account register hashes password, sets Secure HttpOnly cookie, rejects duplicate', async () => {
  const res = await fetch(`${base}/api/auth/register`, write({ username: 'listener_01', password: 'study-music-strong-123', displayName: '听众一号' }));
  assert.equal(res.status, 201);
  assert.match(res.headers.get('set-cookie'), /__Host-hipkop=.*HttpOnly.*SameSite=Lax.*Secure/);
  cookie = res.headers.get('set-cookie').split(';')[0];
  const body = await res.json(); csrf = body.csrf;
  assert.equal(body.user.displayName, '听众一号');
  assert.notEqual(database.get('SELECT password_hash FROM users WHERE username = ?', ['listener_01']).password_hash, 'study-music-strong-123');
  assert.equal((await fetch(`${base}/api/auth/register`, write({ username: 'listener_01', password: 'study-music-strong-123' }))).status, 409);
  const me = await (await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).json();
  assert.equal(me.requireAccount, true);
  assert.equal(me.user.username, 'listener_01');
});
test('production: malformed/oversized JSON produces 400/413 without leaking exceptions', async () => {
  const headers = { ...admin(), 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/api/sync/search`, { method: 'POST', headers, body: '{oops' })).status, 400);
  const res = await fetch(`${base}/api/sync/search`, { method: 'POST', headers, body: JSON.stringify({ q: 'x'.repeat(20000) }) });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: 'body_too_large' });
});
test('production: CSRF is mandatory and forged author cannot override account identity', async () => {
  const payload = { title: '真的想聊音乐', body: '这是一条待审核的音乐讨论', author: '伪造的作者', topic: 'review' };
  assert.equal((await fetch(`${base}/api/community/posts`, write(payload, { Cookie: cookie }))).status, 403);
  const res = await fetch(`${base}/api/community/posts`, write(payload, { Cookie: cookie, 'X-CSRF-Token': csrf }));
  assert.equal(res.status, 202);
  const body = await res.json(); postId = body.id;
  assert.equal(body.status, 'pending'); assert.equal(body.post, null);
  assert.equal(database.get('SELECT author FROM community_posts WHERE id = ?', [postId]).author, '听众一号');
  const list = await (await fetch(`${base}/api/community/posts`)).json();
  assert.equal(list.items.some(p => p.id === postId), false);
});
test('production: moderation publishes the real post and excludes unapproved content from public stats', async () => {
  const queue = await (await fetch(`${base}/api/admin/posts`, { headers: admin() })).json();
  assert.ok(queue.items.some(post => post.id === postId));
  assert.equal((await fetch(`${base}/api/admin/posts/${postId}`, write({ status: 'published' }, admin()))).status, 200);
  const posts = await (await fetch(`${base}/api/community/posts`)).json();
  assert.ok(posts.items.some(post => post.id === postId && post.author === '听众一号'));
});
test('production: logout invalidates session and login checks password', async () => {
  assert.equal((await fetch(`${base}/api/auth/logout`, write({}, { Cookie: cookie, 'X-CSRF-Token': csrf }))).status, 200);
  assert.equal((await (await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).json()).user, null);
  assert.equal((await fetch(`${base}/api/auth/login`, write({ username: 'listener_01', password: 'totally-wrong-password' }))).status, 401);
  const res = await fetch(`${base}/api/auth/login`, write({ username: 'listener_01', password: 'study-music-strong-123' }));
  assert.equal(res.status, 200);
});
test('production: remote artwork rejects unsafe protocols and private IP ranges', async () => {
  const { publicIp, fetchArtwork } = require('../src/util/artwork');
  for (const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.2','::1','fd00::1','::ffff:127.0.0.1']) assert.equal(Boolean(publicIp(ip)), false, ip);
  assert.equal(Boolean(publicIp('1.1.1.1')), true);
  await assert.rejects(() => fetchArtwork('http://itunes.apple.com/a', { hostAllowed: () => true, maxBytes: 1000, timeout: 1000 }), /unsafe_artwork_url/);
  assert.equal((await fetch(`${base}/media/proxy?url=${encodeURIComponent('https://127.0.0.1/image.png')}`)).status, 403);
});
test('production: search rate limit blocks excessive expensive provider requests', async () => {
  let result;
  for (let n = 0; n < 31; n++) result = await fetch(`${base}/api/search?q=empty-local-query`);
  assert.equal(result.status, 429);
  assert.ok(Number(result.headers.get('retry-after')) > 0);
});
