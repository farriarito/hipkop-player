'use strict';

// Optional judgement backend for the taxonomy agent.
//
// The agent works fully offline with the deterministic heuristic. Pointing
// HIPKOP_AGENT_URL at an OpenAI-compatible endpoint upgrades the hard cases
// (artists whose albums are all tagged "Pop"/"Dance" but are actually K-POP).
// The model must answer with strict JSON; any failure degrades to null so the
// caller falls back to the heuristic and a sync job never breaks.

const config = require('../config');
const log = require('../util/logger')('agent:model');

const SYSTEM_PROMPT = [
  'You classify music artists for a Hip-Hop / K-POP catalogue.',
  'Allowed genreBucket values: "hiphop", "kpop", "other".',
  'The album genre evidence is the primary signal; never invent facts.',
  'Reply with JSON only: {"results":[{"id":"...","genreBucket":"hiphop","confidence":0.9,"reason":"..."}]}'
].join(' ');

const isEnabled = () => Boolean(config.agentUrl);

const parseResults = (data) => {
  const rows = Array.isArray(data) ? data : data && Array.isArray(data.results) ? data.results : [];
  const out = [];
  for (const row of rows) {
    if (!row || !row.id) continue;
    const bucket = String(row.genreBucket || '').toLowerCase();
    if (bucket !== 'hiphop' && bucket !== 'kpop' && bucket !== 'other') continue;
    const confidence = Number(row.confidence);
    if (!Number.isFinite(confidence)) continue;
    out.push({
      id: String(row.id),
      genreBucket: bucket,
      confidence: Math.max(0, Math.min(1, confidence)),
      genre: null,
      reason: String(row.reason || 'model').slice(0, 200),
      evidence: '',
      evidenceKey: ''
    });
  }
  return out;
};

async function askModel(candidates, evidenceByArtist) {
  if (!isEnabled() || !candidates.length) return null;
  const answers = new Map();
  const batchSize = Math.max(1, config.agentBatchSize);
  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const slice = candidates.slice(offset, offset + batchSize);
    try {
      const input = slice.map((artist) => ({
        id: artist.id,
        name: artist.name,
        artistGenre: artist.genre || null,
        albumGenres: (evidenceByArtist.get(artist.id) || []).map((row) => row.genre + ' x' + row.count)
      }));
      const response = await fetch(config.agentUrl, {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          config.agentKey ? { Authorization: 'Bearer ' + config.agentKey } : {}
        ),
        body: JSON.stringify({ model: config.agentModel, system: SYSTEM_PROMPT, input })
      });
      if (!response.ok) throw new Error('agent_http_' + response.status);
      const data = await response.json();
      for (const row of parseResults(data)) {
        answers.set(row.id, Object.assign(row, { backend: config.agentModel || 'model' }));
      }
    } catch (error) {
      log.warn('model backend unavailable, falling back to heuristic: ' + error.message);
      return null;
    }
  }
  return answers.size ? answers : null;
}

module.exports = { askModel, isEnabled, parseResults, SYSTEM_PROMPT };