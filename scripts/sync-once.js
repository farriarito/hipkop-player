'use strict';

// One-shot sync: `npm run sync` (optionally `--no-charts`).
// Useful for cron/CI and for warming a fresh database.

const sync = require('../src/sync');
const repo = require('../src/repo');

(async () => {
  const withCharts = !process.argv.includes('--no-charts');
  sync.registerSources();
  const result = await sync.syncOnce({ withCharts });
  const stats = repo.stats();
  console.log(JSON.stringify({ result, stats }, null, 2));
  process.exit(0);
})().catch((error) => {
  console.error('sync failed:', error);
  process.exit(1);
});