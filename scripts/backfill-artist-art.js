'use strict';

// Apple publishes artist rows without portraits; Deezer publishes portraits
// without a key. This fills the gap for artists that were catalogued before that
// enrichment existed (syncArtistProfile now does it on every refresh):
//
//   node scripts/backfill-artist-art.js --limit 20
//   node scripts/backfill-artist-art.js --concurrency 3
//
// Exact name matches only - a fuzzy hit would attach somebody else's face - so a
// "no_confident_match" line here is the correct outcome, not a bug.

const repo = require('../src/repo');
const sync = require('../src/sync');

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const limit = Math.max(0, Number(value('limit', 0)) || 0);
const concurrency = Math.max(1, Number(value('concurrency', 3)) || 3);
const targets = repo.listArtistsMissingArt(limit);
const tally = { filled: 0, missed: 0 };

console.log(`backfill-artist-art: ${targets.length} artists without artwork, concurrency ${concurrency}`);
if (args.includes('--dry-run') || targets.length === 0) process.exit(0);

let cursor = 0;
const worker = async () => {
  for (;;) {
    const index = cursor;
    cursor += 1;
    if (index >= targets.length) return;
    const artist = targets[index];
    let result;
    try {
      result = await sync.fillArtistArt(artist.id);
    } catch (error) {
      result = { filled: false, reason: error.message };
    }
    if (result.filled) {
      tally.filled += 1;
      console.log(`  + ${artist.name}  <- ${result.avatarUrl}`);
    } else {
      tally.missed += 1;
      if (result.reason !== 'no_confident_match') console.log(`  - ${artist.name}  (${result.reason})`);
    }
  }
};

(async () => {
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  console.log(
    `backfill-artist-art: filled ${tally.filled}/${targets.length} in ${((Date.now() - started) / 1000).toFixed(1)}s` +
      ` (${tally.missed} without a confident match)`
  );
  process.exit(0);
})().catch((error) => {
  console.error('backfill-artist-art failed:', error);
  process.exit(1);
});