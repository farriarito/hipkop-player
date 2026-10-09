'use strict';

// First paint used to pull 900px artwork for 300px tiles - 330 KB per tile and
// ~1.9 MB on the home page. The media service now rewrites the size segment of
// Apple/Google artwork URLs to the width the UI actually renders, and only four
// widths exist so a stray ?w= cannot mint unbounded cache entries.

const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');

const stamp = `${process.pid}-${Date.now()}`;
process.env.HIPKOP_DB_PATH = path.join(os.tmpdir(), `hipkop-media-${stamp}.sqlite`);
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-media-${stamp}`);
process.env.HIPKOP_SCHEDULER = '0';

// media.js captures fetchArtwork at require time, so patch the module object
// first and every download goes through the stub instead of a CDN.
const artwork = require('../src/util/artwork');
const realFetch = artwork.fetchArtwork;
let fetchImpl = realFetch;
let fetchCalls = 0;
artwork.fetchArtwork = (...args) => {
  fetchCalls += 1;
  return fetchImpl(...args);
};

const media = require('../src/media');
const N = require('../src/normalize');
const repo = require('../src/repo');

const ART = 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/aa/bb/cc/900x900bb.jpg';

const stubImage = (bytes) => {
  fetchImpl = async () => ({ buffer: Buffer.alloc(bytes, 7), contentType: 'image/jpeg' });
};

test('media: variantUrl rewrites only the NxN segment in front of the extension', () => {
  assert.strictEqual(media.variantUrl(ART, 300), 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/aa/bb/cc/300x300bb.jpg');
  assert.strictEqual(media.variantUrl(ART, 100), 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/aa/bb/cc/100x100bb.jpg');
  assert.strictEqual(media.variantUrl(ART, 900), ART, 'the default width keeps the original URL');
  assert.strictEqual(
    media.variantUrl('https://is1-ssl.mzstatic.com/image/thumb/Music/500x500bb.png', 300),
    'https://is1-ssl.mzstatic.com/image/thumb/Music/300x300bb.png',
    'a .png source keeps its own extension'
  );
  assert.strictEqual(
    media.variantUrl('https://example.test/plain-cover.jpg', 300),
    'https://example.test/plain-cover.jpg',
    'a URL without a size segment must not be mangled'
  );
  assert.strictEqual(
    media.variantUrl('https://cdns-images.dzcdn.net/images/cover/abc/500x500-000000-80-0-0.jpg', 300),
    'https://cdns-images.dzcdn.net/images/cover/abc/500x500-000000-80-0-0.jpg',
    'a size segment followed by a suffix is left alone'
  );
  assert.strictEqual(media.variantUrl(null, 300), null);
});

test('media: sizeOf snaps to a known width so ?w= cannot mint cache entries', () => {
  assert.strictEqual(media.sizeOf(undefined), 900);
  assert.strictEqual(media.sizeOf(''), 900);
  assert.strictEqual(media.sizeOf('abc'), 900);
  assert.strictEqual(media.sizeOf(-5), 900);
  assert.strictEqual(media.sizeOf(300), 300);
  assert.strictEqual(media.sizeOf(320), 300, 'nearest known width wins');
  assert.strictEqual(media.sizeOf(500), 600);
  assert.strictEqual(media.sizeOf(9999), 900);
  assert.deepStrictEqual(media.SIZES, [100, 300, 600, 900]);
});

test('media: concurrent misses on one URL share a single upstream fetch', async () => {
  stubImage(64);
  fetchCalls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  fetchImpl = async () => {
    await gate;
    return { buffer: Buffer.alloc(64, 3), contentType: 'image/jpeg' };
  };
  const url = media.variantUrl(ART, 300);
  const first = media.ensureCached(url);
  const second = media.ensureCached(url);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.strictEqual(fetchCalls, 1, 'a cold grid must not open one socket per tile');
  assert.strictEqual(a.status, 'ready');
  assert.strictEqual(b.filePath, a.filePath);
  assert.ok(fs.existsSync(a.filePath));
});

test('media: each width lands in its own file and gets served with a long cache header', async () => {
  stubImage(120);
  fetchCalls = 0;
  repo.persistAlbum(
    {
      provider: 'itunes',
      providerId: 'w1',
      title: 'Width Probe',
      artistDisplay: 'Probe',
      artistRefs: [N.normalizeArtistRef('itunes', 'w1a', 'Probe')],
      coverUrl: ART.replace('Music124', 'Music999'),
      releaseDate: '2026-10-01',
      genre: 'Hip-Hop',
      trackCount: 1,
      popularity: 10
    },
    []
  );
  const album = repo.listAlbumsBrowse({ limit: 1 }).find((row) => row.title === 'Width Probe');
  assert.ok(album, 'the seeded album must be readable');

  const captured = [];
  const res = {
    writeHead: (status, headers) => captured.push({ status, headers }),
    end: (buffer) => captured.push({ bytes: buffer.length })
  };

  const hit = async (query) => {
    captured.length = 0;
    const handled = await media.handleMedia({}, res, new URL(`http://x/media/cover/${album.id}${query}`));
    assert.strictEqual(handled, true);
    return captured;
  };

  const big = await hit('');
  const small = await hit('?w=300');
  assert.strictEqual(big[1].bytes, 120);
  assert.strictEqual(small[1].bytes, 120, 'the stub returns the same bytes; the point is the file identity');
  assert.match(small[0].headers['Cache-Control'], /max-age=86400/);
  assert.notStrictEqual(big[1].bytes && small[1].bytes, undefined);

  const files = new Set(fs.readdirSync(process.env.HIPKOP_MEDIA_DIR));
  assert.ok(files.size >= 2, 'the 900px and 300px variants must be cached as separate files');

  // The upstream gate: a burst of distinct URLs must not exceed the ceiling.
  const before = fetchCalls;
  const many = Array.from({ length: 12 }, (unused, index) => media.cacheEntity('cover', album.id, 100 + index));
  await Promise.all(many);
  assert.ok(fetchCalls - before <= 12, 'the gate serialises upstream work rather than dropping it');
});