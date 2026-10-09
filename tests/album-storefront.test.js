'use strict';

// An Apple collection id only resolves in the storefront that published it, and
// chart syncing pulls US + KR + JP. Looking a KR album up in the US catalog
// returns zero results, which left 266 chart albums playing nothing.

const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const stamp = `${process.pid}-${Date.now()}`;
process.env.HIPKOP_DB_PATH = path.join(os.tmpdir(), `hipkop-store-${stamp}.sqlite`);
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-store-media-${stamp}`);
process.env.HIPKOP_DISABLED_PROVIDERS = 'itunes,deezer,musicbrainz,lastfm';
process.env.HIPKOP_SCHEDULER = '0';

const sync = require('../src/sync');
const repo = require('../src/repo');
const providers = require('../src/providers');

const albumFixture = (providerId, chartSource) => ({
  provider: 'itunes',
  providerId,
  title: 'CRASH - EP',
  artistDisplay: 'Test Act',
  artistRefs: [],
  kind: 'single',
  coverUrl: 'https://example.test/crash.jpg',
  releaseDate: '2026-10-01',
  genre: 'Hip-Hop/Rap',
  chartSource
});

const track = (n) => ({
  provider: 'itunes',
  providerId: 'track-' + n,
  title: 'Track ' + n,
  artistDisplay: 'Test Act',
  previewUrl: 'https://audio.example.test/' + n + '.m4a',
  trackNumber: n,
  durationMs: 30000
});

// Stand-in for the iTunes provider: only one storefront knows the album.
const fakeProvider = (knownCountry, trackCount = 2) => ({
  name: 'itunes',
  calls: [],
  async getAlbum(providerId, { country } = {}) {
    this.calls.push(country);
    if (country !== knownCountry) return { album: null, tracks: [] };
    return { album: null, tracks: Array.from({ length: trackCount }, (_, i) => track(i + 1)) };
  }
});

const withProvider = async (fake, work) => {
  const original = providers.get;
  providers.get = () => fake;
  try { return await work(); } finally { providers.get = original; }
};

test('album sync: the chart storefront is tried first', () => {
  const listed = sync.storefrontsFor({ chartSource: 'apple-rss:kr' });
  assert.strictEqual(listed[0], 'kr', 'the storefront the album charted in comes first');
  assert.strictEqual(new Set(listed).size, listed.length, 'no duplicates');
  assert.ok(listed.every((code) => code === code.toLowerCase()));
  assert.ok(listed.includes('us'), 'configured storefronts remain as fallbacks');

  const plain = sync.storefrontsFor({ chartSource: null });
  assert.ok(!plain.includes(null) && !plain.includes(''), 'search-synced albums fall back cleanly');
  assert.strictEqual(plain[0], sync.storefrontsFor({ chartSource: '' })[0]);
});

test('album sync: a KR album is fetched from KR, not US', async () => {
  const id = repo.persistAlbum(albumFixture('6813395912', 'apple-rss:kr'), []);
  assert.strictEqual(repo.getAlbumBundle(id).tracks.length, 0, 'starts silent');

  const fake = fakeProvider('kr');
  const result = await withProvider(fake, () => sync.syncAlbum(id));

  assert.deepStrictEqual(fake.calls, ['kr'], 'US is never even asked once KR answers');
  assert.strictEqual(result.country, 'kr');
  assert.strictEqual(result.tracks, 2);
  const bundle = repo.getAlbumBundle(id);
  assert.strictEqual(bundle.tracks.length, 2, 'the previews are persisted');
  assert.ok(bundle.tracks.every((t) => /^https:\/\//.test(t.previewUrl)));
  assert.strictEqual(bundle.album.chartSource, 'apple-rss:kr', 'the chart row is not degraded');
});

test('album sync: falls back through the storefronts when the first is empty', async () => {
  const id = repo.persistAlbum(albumFixture('555000111', 'apple-rss:us'), []);
  const fake = fakeProvider('jp');
  const result = await withProvider(fake, () => sync.syncAlbum(id));

  assert.strictEqual(fake.calls[0], 'us', 'the album storefront is tried first');
  assert.ok(fake.calls.length > 1, 'an empty storefront is not the end of the search');
  assert.strictEqual(result.country, 'jp');
  assert.strictEqual(repo.getAlbumBundle(id).tracks.length, 2);
});

test('album sync: an album nobody knows stays silent without throwing', async () => {
  const id = repo.persistAlbum(albumFixture('999000777', 'apple-rss:us'), []);
  const fake = fakeProvider('none');
  const result = await withProvider(fake, () => sync.syncAlbum(id));
  assert.strictEqual(result.tracks, 0);
  assert.ok(Array.isArray(result.tried) && result.tried.length > 1);
  assert.strictEqual(repo.getAlbumBundle(id).tracks.length, 0);
});

test('album sync: a provider that throws does not abort the sweep', async () => {
  const id = repo.persistAlbum(albumFixture('123123123', 'apple-rss:kr'), []);
  const calls = [];
  const flaky = {
    name: 'itunes',
    async getAlbum(providerId, { country } = {}) {
      calls.push(country);
      if (country === 'kr') throw new Error('upstream_http_502');
      return country === 'us' ? { album: null, tracks: [track(1)] } : { album: null, tracks: [] };
    }
  };
  const result = await withProvider(flaky, () => sync.syncAlbum(id));
  assert.deepStrictEqual(calls.slice(0, 2), ['kr', 'us']);
  assert.strictEqual(result.country, 'us');
  assert.strictEqual(repo.getAlbumBundle(id).tracks.length, 1);
});

// Mirrors the shape the real iTunes provider returns: a complete entity, not a
// patch. syncAlbum spreads it over the chart row, so partial objects are not
// part of the contract.
const albumEntity = (providerId, overrides = {}) => ({
  provider: 'itunes',
  providerId,
  kind: 'album',
  title: 'Blonde',
  artistDisplay: 'Frank Ocean',
  artistRefs: [],
  coverUrl: 'https://example.test/us.jpg',
  releaseDate: '2016-08-20',
  genre: 'Hip-Hop/Rap',
  trackCount: 17,
  score: null,
  popularity: null,
  description: null,
  externalUrl: null,
  ...overrides
});

test('album sync: a storefront with no previews keeps sweeping for clips', async () => {
  const id = repo.persistAlbum(albumFixture('424242424', 'apple-rss:kr'), []);
  const calls = [];
  const splitProvider = {
    name: 'itunes',
    async getAlbum(providerId, { country } = {}) {
      calls.push(country);
      if (country === 'kr') return { album: albumEntity(providerId, { title: 'KR edition', coverUrl: 'https://example.test/kr.jpg' }), tracks: [] };
      if (country === 'us') return { album: albumEntity(providerId), tracks: [track(1), track(2)] };
      return { album: null, tracks: [] };
    }
  };
  const result = await withProvider(splitProvider, () => sync.syncAlbum(id));
  assert.deepStrictEqual(calls.slice(0, 2), ['kr', 'us'], 'the empty KR collection does not end the sweep');
  assert.strictEqual(result.country, 'us');
  assert.strictEqual(result.tracks, 2);
  assert.strictEqual(repo.getAlbumBundle(id).tracks.length, 2);
});

test('album sync: a previewless release still lands its verified metadata', async () => {
  const id = repo.persistAlbum(
    { ...albumFixture('777888999', 'apple-rss:jp'), title: 'stale title', coverUrl: null },
    []
  );
  const onlyAlbum = {
    name: 'itunes',
    async getAlbum(providerId, { country } = {}) {
      if (country !== 'jp') return { album: null, tracks: [] };
      return {
        album: albumEntity(providerId, {
          title: 'Love Story', artistDisplay: 'back number',
          coverUrl: 'https://example.test/love.jpg', releaseDate: '2014-03-26'
        }),
        tracks: []
      };
    }
  };
  const result = await withProvider(onlyAlbum, () => sync.syncAlbum(id));
  assert.strictEqual(result.tracks, 0);
  assert.strictEqual(result.albumOnly, true);
  assert.strictEqual(result.country, 'jp');
  const album = repo.getAlbumBundle(id).album;
  assert.strictEqual(album.coverUrl, 'https://example.test/love.jpg');
  assert.strictEqual(album.title, 'Love Story');
  assert.strictEqual(album.chartSource, 'apple-rss:jp', 'the chart row survives the metadata write');
});
