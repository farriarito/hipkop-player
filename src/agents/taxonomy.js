'use strict';

// Taxonomy agent: the enrichment worker for the cross-genre axis.
//
// It answers one question per artist - is this HipHop, K-POP, or other? - which
// no metadata provider exposes for artists and which the sync pipeline therefore
// leaves blank. The agent aggregates real evidence (the genres of the artist's
// own albums), decides with a confidence score, writes an auditable decision to
// artist_taxonomy, and only promotes the verdict into artists above a threshold.
//
// Idempotent by construction: promoted artists leave the candidate set, and a
// dry run writes nothing. A dry run still reports the decisions it *would* make,
// which is what `npm run agent:taxonomy` previews by default.

const repo = require('../repo');
const config = require('../config');
const log = require('../util/logger')('agent:taxonomy');
const T = require('../taxonomy');
const { classifyArtist } = require('./classify');
const model = require('./model');

// 0.7 is the point that separates "one album, unanimously Hip-Hop/Rap" (0.70,
// safe to apply) from genuinely mixed evidence such as Dance x6 + Hip-Hop/Rap x4
// (0.667, held for review).
const DEFAULT_MIN_CONFIDENCE = 0.7;

// Two artist rows are the same artist when their normalised names match, so that
// is the unit the model is asked about.
const groupKeyOf = (artist) => T.key(artist.name) || artist.id;

async function runTaxonomyAgent(options = {}) {
  const limit = Number(options.limit) > 0 ? Number(options.limit) : config.agentBatchSize;
  const dryRun = Boolean(options.dryRun);
  const minConfidence =
    Number.isFinite(Number(options.minConfidence)) && options.minConfidence !== undefined
      ? Number(options.minConfidence)
      : config.agentMinConfidence;

  const candidates = repo.listTaxonomyCandidates(limit);
  if (!candidates.length) {
    return { scanned: 0, applied: 0, suggested: 0, skipped: 0, dryRun, minConfidence, samples: [] };
  }

  const evidence = repo.listArtistGenreEvidence(candidates.map((artist) => artist.id));
  const byArtist = new Map();
  for (const row of evidence) {
    if (!byArtist.has(row.artistId)) byArtist.set(row.artistId, []);
    byArtist.get(row.artistId).push({ genre: row.genre, count: row.count });
  }

  // A name-only stub and the real provider row for the same artist can coexist
  // between two calibration passes. Asking once per distinct artist keeps the
  // verdicts consistent - two rows of one artist must never land in two buckets
  // - and halves the tokens.
  const groups = new Map();
  for (const artist of candidates) {
    const groupKey = groupKeyOf(artist);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { id: groupKey, name: artist.name, genre: artist.genre || null, members: [] });
    }
    const group = groups.get(groupKey);
    group.members.push(artist);
    if (!group.genre && artist.genre) group.genre = artist.genre;
  }
  const modelEvidence = new Map();
  for (const group of groups.values()) {
    const merged = new Map();
    for (const member of group.members) {
      for (const row of byArtist.get(member.id) || []) {
        merged.set(row.genre, (merged.get(row.genre) || 0) + row.count);
      }
    }
    modelEvidence.set(group.id, [...merged.entries()].map(([genre, count]) => ({ genre, count })));
  }

  // options.modelDeps lets a test inject the transport instead of the network.
  const modelAnswers = await model.askModel([...groups.values()], modelEvidence, options.modelDeps);

  const samples = [];
  let applied = 0;
  let suggested = 0;
  let skipped = 0;

  for (const artist of candidates) {
    const verdict =
      (modelAnswers && modelAnswers.get(groupKeyOf(artist))) ||
      classifyArtist({ name: artist.name, genre: artist.genre, albums: byArtist.get(artist.id) || [] });

    if (!verdict || verdict.genreBucket === 'unknown' || !(verdict.confidence > 0)) {
      skipped += 1;
      continue;
    }

    const shouldApply = verdict.confidence >= minConfidence;
    if (!dryRun) {
      repo.saveArtistTaxonomy({
        artistId: artist.id,
        genreBucket: verdict.genreBucket,
        genre: verdict.genre || null,
        confidence: verdict.confidence,
        reason: verdict.reason || '',
        evidence: verdict.evidence || '',
        evidenceKey: verdict.evidenceKey || '',
        backend: verdict.backend || 'heuristic',
        status: shouldApply ? 'applied' : 'suggested'
      });
      if (shouldApply) {
        repo.promoteArtistTaxonomy(artist.id, { genreBucket: verdict.genreBucket, genre: verdict.genre || null });
      }
    }

    if (shouldApply) applied += 1;
    else suggested += 1;

    if (samples.length < 12) {
      samples.push({
        id: artist.id,
        name: artist.name,
        bucket: verdict.genreBucket,
        genre: verdict.genre || null,
        confidence: verdict.confidence,
        applied: shouldApply
      });
    }
  }

  const summary = { scanned: candidates.length, applied, suggested, skipped, dryRun, minConfidence, samples };
  if (!dryRun) {
    log.info('taxonomy agent ' + JSON.stringify({ scanned: summary.scanned, applied, suggested, skipped }));
  }
  return summary;
}

module.exports = { runTaxonomyAgent, DEFAULT_MIN_CONFIDENCE };