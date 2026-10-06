'use strict';

// Network-free tests for the taxonomy agent: pure policy cases plus an
// end-to-end run against a temporary catalogue.

const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const stamp = `${process.pid}-${Date.now()}`;
process.env.HIPKOP_DB_PATH = path.join(os.tmpdir(), `hipkop-taxonomy-${stamp}.sqlite`);
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-taxonomy-media-${stamp}`);
process.env.HIPKOP_DISABLED_PROVIDERS = 'itunes,deezer,musicbrainz,lastfm';
process.env.HIPKOP_SCHEDULER = '0';
delete process.env.HIPKOP_AGENT_URL;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.HIPKOP_AGENT_KEY;

const N = require('../src/normalize');
const repo = require('../src/repo');
const { all } = require('../src/db');
const { classifyArtist } = require('../src/agents/classify');
const { runTaxonomyAgent, DEFAULT_MIN_CONFIDENCE } = require('../src/agents/taxonomy');

const seedAlbum = (providerId, title, artistRef, genre) =>
  repo.persistAlbum(
    {
      provider: 'itunes',
      providerId,
      title,
      artistDisplay: artistRef.name,
      artistRefs: [artistRef],
      coverUrl: `https://example.test/${providerId}.jpg`,
      releaseDate: '2026-01-01',
      genre
    },
    []
  );

// Three albums, unanimously rap -> confident, must be applied.
const hiphopRef = N.normalizeArtistRef('itunes', '7001', 'Test Rapper');
// Two albums, unanimously K-Pop -> confident, must be applied.
const kpopRef = N.normalizeArtistRef('itunes', '7002', 'Test Idol Group');
// One Dance album plus one rap album -> genuinely mixed, must be held.
const mixedRef = N.normalizeArtistRef('itunes', '7003', 'Mixed Evidence Artist');
// No album genre at all -> nothing to decide, must be skipped.
const blankRef = N.normalizeArtistRef('itunes', '7004', 'No Evidence Artist');

seedAlbum('a1', 'Rap One', hiphopRef, 'Hip-Hop/Rap');
seedAlbum('a2', 'Rap Two', hiphopRef, 'Hip-Hop/Rap');
seedAlbum('a3', 'Rap Three', hiphopRef, 'Chinese Hip-Hop');
seedAlbum('b1', 'Idol One', kpopRef, 'K-Pop');
seedAlbum('b2', 'Idol Two', kpopRef, 'K-Pop');
seedAlbum('c1', 'Dance One', mixedRef, 'Dance');
seedAlbum('c2', 'Dance Two', mixedRef, 'Hip-Hop/Rap');
seedAlbum('d1', 'Untagged', blankRef, null);

test('classify: pure policy maps genres to buckets', () => {
  assert.strictEqual(classifyArtist({ albums: [{ genre: 'Hip-Hop/Rap', count: 5 }] }).genreBucket, 'hiphop');
  assert.strictEqual(classifyArtist({ albums: [{ genre: 'Chinese Hip-Hop', count: 2 }] }).genreBucket, 'hiphop');
  assert.strictEqual(classifyArtist({ albums: [{ genre: 'K-Pop', count: 4 }] }).genreBucket, 'kpop');
  assert.strictEqual(classifyArtist({ albums: [{ genre: 'Death Metal/Black Metal', count: 2 }] }).genreBucket, 'other');
  assert.strictEqual(classifyArtist({ albums: [] }).genreBucket, 'unknown');
});

test('classify: K-Pop wins over the generic pop fallback', () => {
  // "K-Pop" contains "pop"; rule order must not let /pop/ take it.
  const kpop = classifyArtist({ albums: [{ genre: 'K-Pop', count: 1 }, { genre: 'Pop', count: 1 }] });
  assert.strictEqual(kpop.genreBucket, 'kpop');
});

test('classify: confidence separates unanimous from mixed evidence', () => {
  // One album, one genre: exactly at the default promotion threshold.
  const unanimous = classifyArtist({ albums: [{ genre: 'Pop', count: 1 }] });
  assert.strictEqual(unanimous.confidence, DEFAULT_MIN_CONFIDENCE);

  // Dance x1 + rap x1: the winning bucket only holds 75% of the weight.
  const mixed = classifyArtist({ albums: [{ genre: 'Dance', count: 1 }, { genre: 'Hip-Hop/Rap', count: 1 }] });
  assert.ok(mixed.confidence < DEFAULT_MIN_CONFIDENCE, `expected below threshold, got ${mixed.confidence}`);

  // More unanimous albums only add confidence.
  const solid = classifyArtist({ albums: [{ genre: 'Hip-Hop/Rap', count: 3 }] });
  assert.ok(solid.confidence > unanimous.confidence);
});

test('classify: is deterministic', () => {
  const a = classifyArtist({ albums: [{ genre: 'Hip-Hop/Rap', count: 2 }, { genre: 'Pop', count: 1 }] });
  const b = classifyArtist({ albums: [{ genre: 'Hip-Hop/Rap', count: 2 }, { genre: 'Pop', count: 1 }] });
  assert.deepStrictEqual(a, b);
});

test('agent: dry run reports decisions but writes nothing', async () => {
  const before = repo.taxonomySummary();
  const summary = await runTaxonomyAgent({ dryRun: true, limit: 20 });

  assert.ok(summary.scanned >= 4, `expected candidates, got ${summary.scanned}`);
  // A dry run still reports what it *would* apply - that is the point of a preview.
  assert.ok(summary.applied >= 2, `expected a preview of >=2 applies, got ${summary.applied}`);

  // ...but the catalogue and the audit table must be untouched.
  assert.strictEqual(all('SELECT COUNT(*) AS c FROM artist_taxonomy')[0].c, 0);
  assert.strictEqual(JSON.stringify(repo.taxonomySummary()), JSON.stringify(before));
  assert.strictEqual(repo.getArtistRow('itunes-artist-7001').genreBucket, null);
});

test('agent: applies confident verdicts and holds mixed or empty evidence', async () => {
  const summary = await runTaxonomyAgent({ dryRun: false, limit: 20 });

  assert.strictEqual(repo.getArtistRow('itunes-artist-7001').genreBucket, 'hiphop');
  assert.strictEqual(repo.getArtistRow('itunes-artist-7002').genreBucket, 'kpop');

  // Mixed evidence stays a suggestion and never reaches the artist row.
  const mixed = repo.getArtistRow('itunes-artist-7003');
  assert.strictEqual(mixed.genreBucket, null);
  const audit = all('SELECT status, confidence FROM artist_taxonomy WHERE artist_id = ?', ['itunes-artist-7003']);
  assert.strictEqual(audit.length, 1);
  assert.strictEqual(audit[0].status, 'suggested');

  // No genre anywhere -> skipped, not even a suggestion.
  assert.strictEqual(repo.getArtistRow('itunes-artist-7004').genreBucket, null);
  assert.strictEqual(all('SELECT COUNT(*) AS c FROM artist_taxonomy WHERE artist_id = ?', ['itunes-artist-7004'])[0].c, 0);

  assert.ok(summary.applied >= 2, `expected >=2 applied, got ${summary.applied}`);
  assert.ok(summary.suggested >= 1, `expected >=1 held, got ${summary.suggested}`);
  assert.ok(summary.skipped >= 1, `expected >=1 skipped, got ${summary.skipped}`);
});

test('agent: classifies K-Pop without leaking the generic pop rule', () => {
  assert.strictEqual(repo.getArtistRow('itunes-artist-7002').genreBucket, 'kpop');
});

test('agent: promoted artists leave the candidate set (idempotent)', async () => {
  const remaining = repo.listTaxonomyCandidates(50).map((artist) => artist.id);
  assert.ok(!remaining.includes('itunes-artist-7001'));
  assert.ok(!remaining.includes('itunes-artist-7002'));
  assert.ok(remaining.includes('itunes-artist-7003'));

  const second = await runTaxonomyAgent({ dryRun: false, limit: 20 });
  assert.ok(!second.samples.some((sample) => sample.id === 'itunes-artist-7001'));
});

test('agent: promotion never overwrites an existing bucket', () => {
  repo.promoteArtistTaxonomy('itunes-artist-7001', { genreBucket: 'kpop', genre: 'K-Pop' });
  assert.strictEqual(repo.getArtistRow('itunes-artist-7001').genreBucket, 'hiphop');
});

// Two artist rows can exist for one artist - a name-only stub plus the real
// provider row - until calibration merges them. They must never end up in two
// different buckets, and the model must only be asked once.
test('agent: rows sharing an artist name get one verdict and one model call', async () => {
  const first = N.normalizeArtistRef('itunes', '8001', 'Twin Act');
  const second = N.normalizeArtistRef('itunes', '8002', 'Twin Act');
  seedAlbum('e1', 'Twin One', first, 'Hip-Hop/Rap');
  seedAlbum('e2', 'Twin Two', second, 'Hip-Hop/Rap');
  const before = repo.listTaxonomyCandidates(500).filter((artist) => artist.name === 'Twin Act');
  assert.strictEqual(before.length, 2, 'two rows for one artist');

  // The rest of this file runs offline on purpose; enable the model for this test
  // only by flipping the resolved config (askModel reads it at call time).
  const config = require('../src/config');
  const restore = { url: config.agentUrl, key: config.agentKey, model: config.agentModel };
  config.agentUrl = 'https://example.test/chat/completions';
  config.agentKey = 'test-key';
  config.agentModel = 'test-model';

  let calls = 0;
  let twinsInRoster = 0;
  let rosterSize = 0;
  const modelDeps = {
    request: async ({ body }) => {
      calls += 1;
      const roster = JSON.parse(body.messages[1].content);
      rosterSize = roster.length;
      twinsInRoster = roster.filter((row) => row.name === 'Twin Act').length;
      return {
        choices: [{ message: { content: JSON.stringify({ results: roster.map((row) => ({ id: row.id, genreBucket: 'hiphop', confidence: 0.95, reason: 'twin' })) }) } }]
      };
    }
  };

  const summary = await runTaxonomyAgent({ limit: 500, dryRun: true, modelDeps });
  assert.ok(summary.scanned >= 2);
  assert.strictEqual(calls, 1, 'one batch for the whole run');
  assert.strictEqual(before.length, 2, 'sanity: two rows for the twin');
  assert.strictEqual(twinsInRoster, 1, 'the twin is asked about once');
  assert.ok(rosterSize < 6, 'the roster only holds the distinct artists');

  await runTaxonomyAgent({ limit: 500, dryRun: false, modelDeps });
  const after = repo.listTaxonomyCandidates(500).filter((artist) => artist.name === 'Twin Act');
  assert.strictEqual(after.length, 0, 'both rows left the candidate set');
  const rows = all(`SELECT genre_bucket AS bucket FROM artists WHERE name = 'Twin Act'`);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual([...new Set(rows.map((row) => row.bucket))], ['hiphop'], 'one bucket for both rows');
  config.agentUrl = restore.url;
  config.agentKey = restore.key;
  config.agentModel = restore.model;
});
