'use strict';

// First paint is dominated by the bundled JS/CSS. Shipping them gzipped with an
// ETag and an immutable URL is what turns a cold reload into a few tens of KB and
// a warm reload into a 304. The HTML shell must stay uncached so a new deploy is
// visible immediately.
//
// Requests go through node:http rather than fetch: fetch transparently gunzips,
// which would hide the very thing this test exists to prove.

const http = require('node:http');
const os = require('os');
const path = require('path');
const zlib = require('node:zlib');
const test = require('node:test');
const assert = require('node:assert');

const stamp = `${process.pid}-${Date.now()}`;
process.env.HIPKOP_DB_PATH = path.join(os.tmpdir(), `hipkop-static-${stamp}.sqlite`);
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-static-media-${stamp}`);
process.env.HIPKOP_DISABLED_PROVIDERS = 'itunes,deezer,musicbrainz,lastfm';
process.env.HIPKOP_SCHEDULER = '0';

const { server } = require('../server');

const rawGet = (port, urlPath, headers = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: urlPath, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) })
      );
    });
    request.on('error', reject);
    request.end();
  });

test('static assets: versioned files are immutable, gzipped, and revalidate to 304', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const first = await rawGet(port, '/app.js?v=test');
  assert.strictEqual(first.status, 200);
  assert.match(first.headers['cache-control'], /max-age=31536000, immutable/);
  assert.ok(first.headers.etag, 'an ETag is what makes the second load cheap');
  assert.strictEqual(first.headers.vary, 'Accept-Encoding', 'a shared cache must know the body varies by encoding');

  const gzipped = await rawGet(port, '/app.js?v=test', { 'Accept-Encoding': 'gzip' });
  assert.strictEqual(gzipped.headers['content-encoding'], 'gzip');
  assert.ok(gzipped.body.length < first.body.length * 0.5, 'gzip must roughly halve the bundle');
  assert.deepStrictEqual(zlib.gunzipSync(gzipped.body), first.body, 'the compressed body must round-trip');

  const revalidated = await rawGet(port, '/app.js?v=test', { 'If-None-Match': first.headers.etag });
  assert.strictEqual(revalidated.status, 304);
  assert.strictEqual(revalidated.body.length, 0, 'a 304 carries no body');

  // An unversioned asset still revalidates often enough that a deploy lands.
  const unversioned = await rawGet(port, '/app.js');
  assert.match(unversioned.headers['cache-control'], /max-age=600, must-revalidate/);

  // The shell must never be cached, or a deploy would be invisible.
  const shell = await rawGet(port, '/');
  assert.strictEqual(shell.headers['cache-control'], 'no-store');
  assert.match(shell.headers['content-type'], /text\/html/);
});

test('static assets: traversal and unknown paths stay out of the public dir', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  assert.strictEqual((await rawGet(port, '/no-such-file.js')).status, 404);
  assert.strictEqual((await rawGet(port, '/../server.js')).status, 404, 'a traversal attempt must not leak the source tree');
});