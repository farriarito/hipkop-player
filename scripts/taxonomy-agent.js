#!/usr/bin/env node
'use strict';

// Manual entry point for the taxonomy agent.
//
//   npm run agent:taxonomy                                  # dry run, 50 artists
//   npm run agent:taxonomy -- --apply                       # persist decisions
//   npm run agent:taxonomy -- --apply --limit 200 --min-confidence 0.8

const { runTaxonomyAgent } = require('../src/agents/taxonomy');
const repo = require('../src/repo');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};

(async () => {
  const dryRun = !has('--apply');
  const limit = Number(valueOf('--limit', 50));
  const minConfidence = Number(valueOf('--min-confidence', 0.7));

  const summary = await runTaxonomyAgent({ limit, dryRun, minConfidence });

  console.log(`taxonomy agent ${dryRun ? '(dry run - nothing is written)' : '(applied)'}`);
  console.log(`  scanned=${summary.scanned} applied=${summary.applied} suggested=${summary.suggested} skipped=${summary.skipped}`);
  console.log(`  promote threshold=${summary.minConfidence}`);
  for (const sample of summary.samples) {
    const mark = sample.applied ? 'APPLY' : 'hold ';
    console.log(`  ${mark} ${String(sample.bucket).padEnd(7)} ${String(sample.confidence).padEnd(6)} ${sample.name} -> ${sample.genre || '(no album genre)'}`);
  }
  console.log('  catalogue:', JSON.stringify(repo.taxonomySummary()));
  if (dryRun) console.log('\nRe-run with --apply to persist these decisions.');
})().catch((error) => {
  console.error('taxonomy agent failed:', error.message);
  process.exitCode = 1;
});