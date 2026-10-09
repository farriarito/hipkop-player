'use strict';

// Pre-fetch artwork so the first visitor does not pay for it.
//
//   node scripts/warm-media.js                 # every album + artist, 300/600/100
//   node scripts/warm-media.js --size 300      # one width only
//   node scripts/warm-media.js --limit 50      # spot check
//   node scripts/warm-media.js --dry-run       # count what would be fetched
//
// Upstream concurrency is capped by HIPKOP_MEDIA_CONCURRENCY (default 6) inside
// the media service; the worker pool here only keeps the queue from growing to
// thousands of promises. Already-cached images are skipped without an HTTP call.

const config = require('../src/config');
const media = require('../src/media');
const repo = require('../src/repo');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const sizes = String(value('size', '300,600,100'))
  .split(',')
  .map((size) => media.sizeOf(size));
const limit = Math.max(0, Number(value('limit', 0)) || 0);
const dryRun = flag('dry-run');
const workers = Math.max(1, Number(process.env.HIPKOP_WARM_WORKERS || 8));

const albums = repo.listCoverTargets(limit);
const artists = repo.listArtistArtTargets(limit);
const jobs = [
  ...albums.flatMap((row) => sizes.map((size) => ({ kind: 'cover', id: row.id, size }))),
  ...artists.flatMap((row) => sizes.filter((size) => size <= 600).map((size) => ({ kind: 'avatar', id: row.id, size })))
];

console.log(
  `warm-media: ${albums.length} albums + ${artists.length} artists, sizes ${sizes.join('/')} = ${jobs.length} images`
);
if (dryRun) process.exit(0);

const tally = { ready: 0, failed: 0, missing: 0, done: 0 };
let cursor = 0;

const worker = async () => {
  for (;;) {
    const index = cursor;
    cursor += 1;
    if (index >= jobs.length) return;
    const job = jobs[index];
    const result = await media.cacheEntity(job.kind, job.id, job.size);
    tally[result.status] = (tally[result.status] || 0) + 1;
    tally.done += 1;
    if (tally.done % 50 === 0) {
      console.log(`  ${tally.done}/${jobs.length}  ready=${tally.ready} failed=${tally.failed} missing=${tally.missing}`);
    }
  }
};

(async () => {
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, worker));
  const stats = repo.stats();
  console.log(
    `warm-media: ${tally.done} images in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
      `(ready=${tally.ready} failed=${tally.failed} missing=${tally.missing})`
  );
  console.log(`warm-media: catalog ${stats.albums} albums / ${stats.artists} artists -> ${config.mediaDir}`);
  process.exit(0);
})().catch((error) => {
  console.error('warm-media failed:', error);
  process.exit(1);
});