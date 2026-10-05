'use strict';

// Network-free tests for the calibration pass, the cross-genre taxonomy, the
// listening deep links and the newer API surface (browse/categories/community).

const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const stamp = `${process.pid}-${Date.now()}`;
process.env.HIPKOP_DB_PATH = path.join(os.tmpdir(), `hipkop-cal-${stamp}.sqlite`);
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-cal-media-${stamp}`);
process.env.HIPKOP_DISABLED_PROVIDERS = 'itunes,deezer,musicbrainz,lastfm';
process.env.HIPKOP_SCHEDULER = '0';

const N = require('../src/normalize');
const repo = require('../src/repo');
const api = require('../src/api');
const T = require('../src/taxonomy');
const { buildListenLinks } = require('../src/listen');
const { calibrate } = require('../src/calibrate');

const makeRes = () => {
  const res = { status: 0, headers: null, raw: '' };
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {}; };
  res.end = (body) => { res.raw = body || ''; };
  res.json = () => JSON.parse(res.raw);
  return res;
};

const call = async (method, target, body) => {
  const url = new URL(target, 'http://localhost');
  const req = { method, url, on(event, handler) {
    if (event === 'data' && body) handler(JSON.stringify(body));
    if (event === 'end') handler();
  } };
  const res = makeRes();
  await api.handleApi(req, res, url);
  return res;
};

test('taxonomy: genre buckets and curated scenes', () => {
  assert.strictEqual(T.genreBucket('K-Pop'), 'kpop');
  assert.strictEqual(T.genreBucket('Hip-Hop/Rap'), 'hiphop');
  assert.strictEqual(T.genreBucket('J-Pop'), 'other');
  assert.strictEqual(T.genreBucket(''), 'unknown');
  assert.strictEqual(T.sceneFor('法老', 'hiphop'), 'underground');
  assert.strictEqual(T.sceneFor('aespa', 'kpop'), 'mainstream');
  assert.strictEqual(T.sceneFor('Nobody At All', 'hiphop'), 'unknown');
});

test('listen: exact ids produce detail links, otherwise search deep links', () => {
  const exact = buildListenLinks({ title: 'HYAENA', artistDisplay: 'Travis Scott', qqSongMid: 'abc123', provider: 'itunes', externalUrl: 'https://music.apple.com/x' }, 'song');
  assert.strictEqual(exact.primary, 'qq');
  const qq = exact.platforms.find((platform) => platform.key === 'qq');
  assert.strictEqual(qq.exact, true);
  assert.strictEqual(qq.url, 'https://y.qq.com/n/ryqq/songDetail/abc123');
  assert.ok(exact.platforms.some((platform) => platform.key === 'apple' && platform.exact));

  const fuzzy = buildListenLinks({ title: 'UTOPIA', artistDisplay: 'Travis Scott', provider: 'itunes' }, 'album');
  const search = fuzzy.platforms.find((platform) => platform.key === 'qq');
  assert.strictEqual(search.exact, false);
  assert.ok(search.url.startsWith('https://y.qq.com/n/ryqq/search?w='));
  assert.ok(fuzzy.platforms.find((platform) => platform.key === 'netease').url.startsWith('https://music.163.com/#/search/m/'));
});

const albumFixture = (providerId, cover, extra = {}) => ({
  provider: 'itunes',
  providerId,
  title: 'UTOPIA',
  artistDisplay: 'Travis Scott',
  artistRefs: [N.normalizeArtistRef('itunes', '77', 'Travis Scott')],
  kind: 'album',
  coverUrl: cover,
  releaseDate: '2023-07-28',
  genre: 'Hip-Hop/Rap',
  trackCount: 2,
  ...extra
});

const trackFixture = (providerId) => ({
  provider: 'itunes',
  providerId,
  title: 'HYAENA',
  artistDisplay: 'Travis Scott',
  artistRefs: [N.normalizeArtistRef('itunes', '77', 'Travis Scott')],
  trackNumber: 1
});

test('calibrate: storefront duplicates merge into one canonical album', () => {
  repo.persistAlbum(
    albumFixture('us-1', 'https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg'),
    [trackFixture('us-t1')]
  );
  repo.persistAlbum(
    albumFixture('kr-1', 'https://is1-ssl.mzstatic.com/image/thumb/Music/900x900bb.jpg', { description: 'richer copy' }),
    [trackFixture('kr-t1')]
  );
  assert.strictEqual(repo.consistencyReport().duplicateAlbums, 1, 'duplicate detected before calibration');

  const report = calibrate();
  assert.ok(report.mergedAlbums >= 1);
  assert.strictEqual(repo.consistencyReport().duplicateAlbums, 0);
  assert.strictEqual(repo.consistencyReport().duplicateTracks, 0);
  assert.strictEqual(repo.listAlbumsBrowse({ limit: 10 }).length, 1, 'one album after merge');

  const kept = repo.listAlbumsBrowse({ limit: 10 })[0];
  assert.strictEqual(kept.coverUrl, 'https://is1-ssl.mzstatic.com/image/thumb/Music/900x900bb.jpg', 'keeps richest cover');
  assert.strictEqual(repo.albumArtists(kept.id).length, 1);
  assert.strictEqual(repo.albumTracks(kept.id).length, 1);

  // The merged-away provider id is aliased, so a later sync of the US storefront
  // updates the canonical row instead of recreating a duplicate.
  assert.strictEqual(repo.albumAlias('itunes', 'us-1').albumId, kept.id);
  repo.persistAlbum(albumFixture('us-1', null), []);
  assert.strictEqual(repo.listAlbumsBrowse({ limit: 10 }).length, 1, 'alias prevents resurrection');
});

test('calibrate is idempotent once the catalog is consistent', () => {
  const before = repo.consistencyReport();
  const report = calibrate();
  assert.strictEqual(report.mergedAlbums, 0);
  assert.strictEqual(report.mergedTracks, 0);
  assert.deepStrictEqual(repo.consistencyReport(), before);
});

test('api: browse filters by bucket and scene, plus category counts', async () => {
  const hiphop = await call('GET', '/api/albums?bucket=hiphop&sort=date');
  const body = hiphop.json();
  assert.strictEqual(hiphop.status, 200);
  assert.ok(body.items.length >= 1);
  assert.ok(body.items.every((album) => album.genreBucket === 'hiphop' || album.genreBucket === null || album.genreBucket === undefined));

  const underground = await call('GET', '/api/albums?scene=underground');
  assert.strictEqual(underground.status, 200);
  assert.ok(underground.json().items.every((album) => album.scene === 'underground'));

  const categories = await call('GET', '/api/categories');
  const counts = categories.json();
  assert.ok(counts.buckets.some((row) => row.bucket === 'hiphop' && row.count >= 1));
  assert.ok(counts.topics.some((topic) => topic.key === 'recommend'));
});

test('api: album payload carries listen platforms and a stable cover url', async () => {
  const album = repo.listAlbumsBrowse({ limit: 1 })[0];
  const res = await call('GET', `/api/albums/${album.id}`);
  const body = res.json();
  assert.strictEqual(body.album.coverUrl, `/media/cover/${album.id}`);
  assert.strictEqual(body.album.listen.primary, 'qq');
  assert.ok(body.album.listen.platforms.length >= 2);
  assert.ok(body.album.releaseDate, 'release date is exposed');
  assert.ok(body.album.genreBucket, 'genre bucket is exposed');
  assert.strictEqual(body.album.artist, 'Travis Scott');
  assert.ok(body.tracks[0].listen.platforms.length >= 2);
});

test('api: community posts can be listed, created and filtered by topic', async () => {
  const created = await call('POST', '/api/community/posts', {
    topic: 'recommend',
    title: '宝藏地下说唱',
    body: '把法老和连麻安利给所有人。',
    author: '测试用户'
  });
  assert.strictEqual(created.status, 200);
  assert.strictEqual(created.json().ok, true);

  const list = await call('GET', '/api/community/posts?topic=recommend');
  const body = list.json();
  assert.ok(body.items.some((post) => post.title === '宝藏地下说唱'));
  assert.ok(body.topics.some((topic) => topic.key === 'general'));

  const invalid = await call('POST', '/api/community/posts', { topic: 'recommend', title: '', body: '' });
  assert.strictEqual(invalid.status, 400);
});

test('api: health exposes stats, consistency and categories', async () => {
  const res = await call('GET', '/api/health');
  const body = res.json();
  assert.ok(body.stats.albums >= 1);
  assert.strictEqual(body.consistency.duplicateAlbums, 0);
  assert.ok(Array.isArray(body.categories.buckets));
});