#!/usr/bin/env node
'use strict';

// Manual entry point for the taxonomy agent.
//
//   npm run agent:taxonomy                              # dry run, 50 artists
//   npm run agent:taxonomy -- --apply                   # persist decisions
//   npm run agent:taxonomy -- --apply --limit 200 --min-confidence 0.8
//   npm run agent:taxonomy -- --probe                   # test the model backend
//
// The model backend is optional: without a key everything runs on the offline
// heuristic. Setting DEEPSEEK_API_KEY (or HIPKOP_AGENT_KEY + HIPKOP_AGENT_URL)
// switches the low-confidence cases over to the endpoint.

const { runTaxonomyAgent } = require('../src/agents/taxonomy');
const { classifyArtist } = require('../src/agents/classify');
const model = require('../src/agents/model');
const repo = require('../src/repo');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};

const backendLine = () => {
  const info = model.describe();
  if (!info.enabled) return 'model backend: off (heuristic only) - set DEEPSEEK_API_KEY to enable';
  return (
    'model backend: ' + (info.model || '(no model set)') + ' @ ' + info.endpoint +
    ' | key ' + (info.keyPresent ? 'set' : 'MISSING') +
    ' | json mode ' + (info.jsonMode ? 'on' : 'off')
  );
};

// Sends a couple of real candidates through the endpoint so a bad key, an empty
// balance or a wrong model name shows up before touching the catalogue.
async function probe(limit) {
  console.log(backendLine());
  const info = model.describe();
  if (!info.enabled) return;

  const candidates = repo.listTaxonomyCandidates(limit);
  if (!candidates.length) {
    console.log('no candidates left to classify');
    return;
  }
  const evidence = repo.listArtistGenreEvidence(candidates.map((artist) => artist.id));
  const byArtist = new Map();
  for (const row of evidence) {
    if (!byArtist.has(row.artistId)) byArtist.set(row.artistId, []);
    byArtist.get(row.artistId).push({ genre: row.genre, count: row.count });
  }

  const answers = await model.askModel(candidates, byArtist);
  if (!answers) {
    console.log('model backend did not answer - see the warning above; the agent will use the heuristic');
    return;
  }
  for (const artist of candidates) {
    const mine = answers.get(artist.id);
    const heuristic = classifyArtist({ name: artist.name, genre: artist.genre, albums: byArtist.get(artist.id) || [] });
    console.log(
      '  ' + String(artist.name).padEnd(28) +
      ' model=' + (mine ? mine.genreBucket + ' ' + mine.confidence : '(none)').padEnd(14) +
      ' heuristic=' + heuristic.genreBucket + ' ' + heuristic.confidence
    );
  }
}

(async () => {
  const limit = Number(valueOf('--limit', 50));
  if (has('--probe')) return probe(Math.min(limit, 5));

  const dryRun = !has('--apply');
  const minConfidence = Number(valueOf('--min-confidence', 0.7));

  console.log(backendLine());
  const summary = await runTaxonomyAgent({ limit, dryRun, minConfidence });

  console.log('taxonomy agent ' + (dryRun ? '(dry run - nothing is written)' : '(applied)'));
  console.log('  scanned=' + summary.scanned + ' applied=' + summary.applied + ' suggested=' + summary.suggested + ' skipped=' + summary.skipped);
  console.log('  promote threshold=' + summary.minConfidence);
  for (const sample of summary.samples) {
    const mark = sample.applied ? 'APPLY' : 'hold ';
    console.log('  ' + mark + ' ' + String(sample.bucket).padEnd(7) + ' ' + String(sample.confidence).padEnd(6) + ' ' + sample.name + ' -> ' + (sample.genre || '(no album genre)'));
  }
  console.log('  catalogue:', JSON.stringify(repo.taxonomySummary()));
  if (dryRun) console.log('\nRe-run with --apply to persist these decisions.');
})().catch((error) => {
  console.error('taxonomy agent failed:', error.message);
  process.exitCode = 1;
});
