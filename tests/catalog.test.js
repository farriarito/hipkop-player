'use strict';

// Network-free integration tests: a temporary SQLite catalog is seeded directly
// and exercised through the repository + API handler. Providers are disabled so
// the suite never depends on third-party availability.

const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const stamp = `${process.pid}-${Date.now()}`;
process.env.HIPKOP_DB_PATH = path.join(os.tmpdir(), `hipkop-test-${stamp}.sqlite`);
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-media-${stamp}`);
process.env.HIPKOP_DISABLED_PROVIDERS = 'itunes,deezer,musicbrainz,lastfm';
process.env.HIPKOP_SCHEDULER = '0';

const N = require('../src/normalize');
const repo = require('../src/repo');
const search = require('../src/search');
const api = require('../src/api');

const seed = () => {
  repo.persistAlbum(
    {
      provider: 'itunes',
      providerId: '1001',
      title: 'MUSE',
      artistDisplay: 'aespa',
      artistRefs: [N.normalizeArtistRef('itunes', '900', 'aespa')],
      coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg',
      releaseDate: '2026-09-21',
      genre: 'K-Pop',
      trackCount: 3,
      popularity: 88
    },
    [
      { provider: 'itunes', providerId: 't1', title: 'Supernova', artistDisplay: 'aespa', artistRefs: [N.normalizeArtistRef('itunes', '900', 'aespa')], trackNumber: 1 },
      { provider: 'itunes', providerId: 't2', title: 'Armageddon', artistDisplay: 'aespa', artistRefs: [N.normalizeArtistRef('itunes', '900', 'aespa')], trackNumber: 2 },
      { provider: 'itunes', providerId: 't3', title: 'Drama', artistDisplay: 'aespa', artistRefs: [N.normalizeArtistRef('itunes', '900', 'aespa')], trackNumber: 3 }
    ]
  );
  repo.persistAlbum({
    provider: 'itunes',
    providerId: '2002',
    title: '生于未来',
    artistDisplay: '法老',
    artistRefs: [N.normalizeArtistRef('itunes', '901', '法老')],
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg',
    releaseDate: '2025-12-08',
    genre: 'Hip-Hop/Rap',
    trackCount: 10,
    popularity: 40
  });
};

const makeRes = () => {
  const res = { status: 0, headers: null, raw: '' };
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {}; };
  res.end = (body) => { res.raw = body || ''; };
  res.json = () => JSON.parse(res.raw);
  return res;
};

const call = async (method, target) => {
  const url = new URL(target, 'http://localhost');
  const res = makeRes();
  await api.handleApi({ method, url, on() {} }, res, url);
  return res;
};

test.before(seed);

test('normalize: deterministic editorial score and album kind', () => {
  const a = N.editorialScore('itunes-album-1');
  const b = N.editorialScore('itunes-album-1');
  assert.strictEqual(a, b);
  assert.ok(a >= 7.4 && a <= 9.7, `score in range, got ${a}`);
  assert.strictEqual(N.kindForAlbum(2, 'Foo'), 'single');
  assert.strictEqual(N.kindForAlbum(12, 'Foo'), 'album');
  assert.strictEqual(N.albumId('itunes', 42, 'X'), 'itunes-album-42');
});

test('repo: album persists with artists and tracks', () => {
  const bundle = repo.getAlbumBundle('itunes-album-1001');
  assert.ok(bundle, 'album exists');
  assert.strictEqual(bundle.album.title, 'MUSE');
  assert.strictEqual(bundle.album.primaryArtistName, 'aespa');
  assert.strictEqual(bundle.tracks.length, 3);
  assert.strictEqual(bundle.artists[0].name, 'aespa');
});

test('repo: artist bundle exposes related works', () => {
  const bundle = repo.getArtistBundle('itunes-artist-900');
  assert.ok(bundle, 'artist exists');
  assert.strictEqual(bundle.artist.name, 'aespa');
  assert.strictEqual(bundle.albums.length, 1);
  assert.strictEqual(bundle.tracks.length, 3);
});

test('repo: charts honour genre filters', () => {
  const all = repo.listCharts({ genre: 'all', sort: 'popularity', limit: 10 });
  assert.ok(all.length >= 2);
  assert.strictEqual(all[0].title, 'MUSE', 'highest popularity first');
  const rap = repo.listCharts({ genre: 'rap', limit: 10 });
  assert.ok(rap.every((album) => /rap|hip-hop/i.test(album.genre || '')));
  assert.strictEqual(rap.length, 1);
  const kpop = repo.listCharts({ genre: 'kpop', limit: 10 });
  assert.strictEqual(kpop.length, 1);
});

test('search: local-first returns grouped results without providers', async () => {
  const result = await search.search('aespa');
  assert.strictEqual(result.artists.length, 1);
  assert.strictEqual(result.artists[0].name, 'aespa');
  assert.strictEqual(result.albums.length, 1);
  assert.strictEqual(result.tracks.length, 3);
});

test('api: /api/albums/:id returns album, artists and tracks', async () => {
  const res = await call('GET', '/api/albums/itunes-album-1001');
  assert.strictEqual(res.status, 200);
  const body = res.json();
  assert.strictEqual(body.album.title, 'MUSE');
  assert.strictEqual(body.tracks.length, 3);
  assert.strictEqual(body.album.coverUrl, '/media/cover/itunes-album-1001');
});

test('api: /api/artists/:id returns related works', async () => {
  const res = await call('GET', '/api/artists/itunes-artist-900');
  assert.strictEqual(res.status, 200);
  const body = res.json();
  assert.strictEqual(body.artist.name, 'aespa');
  assert.strictEqual(body.albums.length, 1);
});

test('api: /api/search groups artists, albums and tracks', async () => {
  const res = await call('GET', '/api/search?q=aespa');
  const body = res.json();
  assert.strictEqual(body.results.artists.length, 1);
  assert.strictEqual(body.results.albums.length, 1);
  assert.strictEqual(body.results.tracks.length, 3);
});

test('api: missing resources return 404', async () => {
  const res = await call('GET', '/api/albums/does-not-exist');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.json().error, 'album_not_found');
});

test('api: unknown /api route returns 404', async () => {
  const res = await call('GET', '/api/nope');
  assert.strictEqual(res.status, 404);
});