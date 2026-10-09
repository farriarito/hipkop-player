'use strict';

// Apple publishes no artist portrait, so without an enrichment step every avatar
// in the product is really an album cover. sync.fillArtistArt() closes that gap
// through Last.fm - the key-gated provider that exists for exactly this. The tests
// below pin the two failure modes that matter: it must be a fast no-op when no key
// is configured, and it must never attach a different artist's face.

const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const stamp = `${process.pid}-${Date.now()}`;
process.env.HIPKOP_DB_PATH = path.join(os.tmpdir(), `hipkop-art-${stamp}.sqlite`);
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-art-media-${stamp}`);
process.env.HIPKOP_DISABLED_PROVIDERS = 'itunes,deezer,musicbrainz';
process.env.HIPKOP_SCHEDULER = '0';
process.env.LASTFM_API_KEY = '';

const N = require('../src/normalize');
const repo = require('../src/repo');
const providers = require('../src/providers');
const sync = require('../src/sync');

const seedArtist = () => {
  repo.persistArtist({ provider: 'itunes', providerId: 'art-1', name: 'aespa' });
  return repo.getArtistRow(N.artistId('itunes', 'art-1', 'aespa'));
};

test('artist art: without LASTFM_API_KEY the lookup is a no-op, not a timeout', async () => {
  const row = seedArtist();
  const started = Date.now();
  const result = await sync.fillArtistArt(row.id);
  assert.deepStrictEqual(result, { filled: false, reason: 'art_source_unavailable' });
  assert.ok(Date.now() - started < 250, 'a missing key must not cost a network round trip');
  assert.strictEqual(repo.getArtistRow(row.id).avatarUrl, null);
});

test('artist art: a confident match becomes the avatar and the hero image', async (t) => {
  const row = seedArtist();
  const realGet = providers.get;
  const realAvailable = providers.isAvailable;
  t.after(() => {
    providers.get = realGet;
    providers.isAvailable = realAvailable;
  });

  providers.isAvailable = (provider) => provider.name === 'lastfm';
  providers.get = (name) => (name === 'lastfm' ? realGet('lastfm') : realGet(name));
  realGet('lastfm').getArtistInfo = async () => ({
    name: 'AESPA',
    avatarUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/portrait.jpg',
    heroUrl: 'https://lastfm.freetls.fastly.net/i/u/600x600/portrait.jpg',
    bio: 'K-pop group'
  });

  const result = await sync.fillArtistArt(row.id);
  assert.strictEqual(result.filled, true, 'punctuation and case must not block a real match');
  assert.match(result.avatarUrl, /portrait\.jpg/);

  const updated = repo.getArtistRow(row.id);
  assert.strictEqual(updated.avatarUrl, 'https://lastfm.freetls.fastly.net/i/u/300x300/portrait.jpg');
  assert.strictEqual(updated.heroUrl, 'https://lastfm.freetls.fastly.net/i/u/600x600/portrait.jpg');
  assert.strictEqual(updated.bio, 'K-pop group');

  // It must not overwrite its own work on the next refresh.
  assert.deepStrictEqual(await sync.fillArtistArt(row.id), { filled: false, reason: 'already_has_art' });
});

test('artist art: a fuzzy Last.fm answer is refused', async (t) => {
  repo.persistArtist({ provider: 'itunes', providerId: 'art-2', name: '$NOT' });
  const row = repo.getArtistRow(N.artistId('itunes', 'art-2', '$NOT'));

  const realGet = providers.get;
  const realAvailable = providers.isAvailable;
  t.after(() => {
    providers.get = realGet;
    providers.isAvailable = realAvailable;
  });
  providers.isAvailable = (provider) => provider.name === 'lastfm';
  realGet('lastfm').getArtistInfo = async () => ({
    name: 'A$AP Rocky',
    avatarUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/someone-else.jpg'
  });

  const result = await sync.fillArtistArt(row.id);
  assert.deepStrictEqual(result, { filled: false, reason: 'no_confident_match' });
  assert.strictEqual(repo.getArtistRow(row.id).avatarUrl, null, 'another artist portrait must never be pinned here');
});