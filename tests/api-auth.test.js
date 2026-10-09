'use strict';

// Public deployments must not expose the sync routes: they write to the catalog
// and fan out to upstream providers, so an open host works as a free metadata
// proxy. HIPKOP_ADMIN_TOKEN gates them; reads and the community feed stay open.

const os = require('os');
const path = require('path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert');

const root = path.join(__dirname, '..');
const stamp = `${process.pid}-${Date.now()}`;
const dbPath = path.join(os.tmpdir(), `hipkop-auth-${stamp}.sqlite`);

process.env.HIPKOP_DB_PATH = dbPath;
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-auth-media-${stamp}`);
process.env.HIPKOP_SCHEDULER = '0';
process.env.HIPKOP_ADMIN_TOKEN = 'test-token-123-long-enough-for-admin-authorization';

const { server } = require('../server');

test('api auth: sync routes are gated, reads and the community feed are not', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const call = async (url, headers) => {
    const response = await fetch(base + url, { headers });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  assert.strictEqual((await call('/api/sync/jobs')).status, 401, 'no token means no sync');
  assert.strictEqual((await call('/api/sync/jobs', { 'x-hipkop-token': 'wrong' })).status, 401);
  assert.strictEqual((await call('/api/sync/jobs', { Authorization: `Bearer ${process.env.HIPKOP_ADMIN_TOKEN}` })).status, 200);
  assert.strictEqual((await call(`/api/sync/jobs?token=${process.env.HIPKOP_ADMIN_TOKEN}`)).status, 401, 'secrets in URLs are no longer accepted');
  // An unknown album short-circuits before any provider call, so this stays offline.
  const mutation = await fetch(base + '/api/sync/album/nope', { method: 'POST', headers: { Authorization: `Bearer ${process.env.HIPKOP_ADMIN_TOKEN}` } });
  assert.strictEqual(mutation.status, 200);
  assert.strictEqual((await call('/api/sync/album/nope')).status, 401);

  assert.strictEqual((await call('/api/health')).status, 200, 'health stays public for platform probes');
  assert.strictEqual((await call('/api/charts?limit=1')).status, 200);
  assert.strictEqual((await call('/api/community/posts?limit=1')).status, 200);

  const posted = await fetch(base + '/api/community/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: 'visitor', topic: 'chat', title: 'public host', body: 'hello from the public host' })
  });
  assert.strictEqual(posted.status, 200, 'the community feed is the product and stays open');
});

test('api auth: an unset token disables admin routes, even locally', () => {
  const script = `
    process.env.HIPKOP_DB_PATH = ${JSON.stringify(dbPath)};
    process.env.HIPKOP_SCHEDULER = '0';
    process.env.HIPKOP_ADMIN_TOKEN = '';
    const { server } = require(${JSON.stringify(path.join(root, 'server.js'))});
    server.listen(0, '127.0.0.1', async () => {
      const base = 'http://127.0.0.1:' + server.address().port;
      const response = await fetch(base + '/api/sync/jobs');
      process.stdout.write(String(response.status));
      process.exit(0);
    });
  `;
  const out = execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(out.trim(), '401', 'an unset secret must not silently open write endpoints');
});
