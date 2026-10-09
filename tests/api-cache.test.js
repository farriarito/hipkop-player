'use strict';

// The read cache in front of /api/*. A page load fires a dozen catalog reads;
// with the cache warm the second visitor - and the second tab - never touches
// SQLite. This test drives the real server, so it also pins the HTTP headers a
// shared cache or a CDN will obey.

const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const stamp = `${process.pid}-${Date.now()}`;
process.env.HIPKOP_DB_PATH = path.join(os.tmpdir(), `hipkop-apicache-${stamp}.sqlite`);
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-apicache-media-${stamp}`);
process.env.HIPKOP_DISABLED_PROVIDERS = 'itunes,deezer,musicbrainz,lastfm';
process.env.HIPKOP_SCHEDULER = '0';

const N = require('../src/normalize');
const repo = require('../src/repo');
const cache = require('../src/cache');
const { server } = require('../server');

const get = async (base, url) => {
  const response = await fetch(base + url);
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
};

test('api cache: reads are cacheable, repeat reads skip the catalog, and a sync bump clears them', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const first = await get(base, '/api/categories');
  assert.strictEqual(first.status, 200);
  assert.match(first.headers.get('cache-control'), /max-age=300/, 'the browser may reuse this for five minutes');

  // A sync that lands between two requests must not change an already-served page.
  repo.persistAlbum(
    {
      provider: 'itunes',
      providerId: 'cache-1',
      title: 'Cache Probe',
      artistDisplay: 'Probe',
      artistRefs: [N.normalizeArtistRef('itunes', 'cache-artist', 'Probe')],
      coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/900x900bb.jpg',
      releaseDate: '2026-10-02',
      genre: 'Hip-Hop',
      trackCount: 1,
      popularity: 5
    },
    []
  );

  const warm = await get(base, '/api/categories');
  assert.deepStrictEqual(warm.body, first.body, 'the warm read must come from the cache, not SQLite');

  // The sync endpoints bump the namespaces they rewrote, so the next read is fresh.
  await cache.bump('categories');
  const fresh = await get(base, '/api/categories');
  assert.notDeepStrictEqual(fresh.body, first.body, 'a bump must publish the new catalogue');

  const health = await get(base, '/api/health');
  assert.match(health.headers.get('cache-control'), /max-age=5/, 'probes want a short TTL');

  // Visitor-authored content is cached server-side but never in the browser.
  const posts = await get(base, '/api/community/posts');
  assert.strictEqual(posts.headers.get('cache-control'), 'no-store');

  const sync = await get(base, '/api/sync/jobs');
  assert.strictEqual(sync.headers.get('cache-control'), 'no-store', 'writes and jobs must never be cached');

  const missing = await get(base, '/api/albums/does-not-exist');
  assert.strictEqual(missing.status, 404);
  assert.strictEqual(missing.headers.get('cache-control'), 'no-store', 'a miss must not be pinned in a shared cache');
});

test('api cache: each route declares its own TTL, and the search key includes the query', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const ttlOf = async (url) => {
    const response = await get(base, url);
    const header = response.headers.get('cache-control') || '';
    const match = /max-age=(\d+)/.exec(header);
    return match ? Number(match[1]) : 0;
  };

  assert.strictEqual(await ttlOf('/api/albums?limit=2'), 60);
  assert.strictEqual(await ttlOf('/api/charts?limit=2'), 60);
  assert.strictEqual(await ttlOf('/api/releases'), 60);
  assert.strictEqual(await ttlOf('/api/search?q=cache-probe'), 30);
  assert.strictEqual(await ttlOf('/api/sources'), 300);
});

test('api cache: a published post is visible on the very next read', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  // Warm the feed first: the publish has to invalidate what is already cached.
  const before = await get(base, '/api/community/posts?topic=all&limit=40');
  assert.strictEqual(before.status, 200);

  const created = await fetch(base + '/api/community/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: 'review', title: '缓存失效探针', body: '发帖后必须立刻可见。' })
  });
  assert.strictEqual(created.status, 200);
  const { id, status } = await created.json();
  assert.strictEqual(status, 'published');

  const after = await get(base, '/api/community/posts?topic=all&limit=40');
  assert.ok(after.body.items.some((item) => item.id === id), 'a poster must see their own post immediately');
});