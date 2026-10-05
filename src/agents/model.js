'use strict';

// Optional judgement backend for the taxonomy agent.
//
// The agent works fully offline with the deterministic heuristic. Pointing
// HIPKOP_AGENT_URL at an OpenAI-compatible /chat/completions endpoint - DeepSeek
// is the default once a key is present - upgrades the hard cases: artists whose
// albums are all tagged "Pop"/"Dance"/"Music" but which are really K-POP.
//
// Any failure degrades to null so the caller falls back to the heuristic and a
// sync job never breaks. A missing key, a 402 with no balance, a timeout, or a
// model that answers with prose all end up in the same place.

const config = require('../config');
const log = require('../util/logger')('agent:model');
const { fetchWithRetry } = require('../util/http');

const ALLOWED_BUCKETS = ['hiphop', 'kpop', 'other'];

const SYSTEM_PROMPT = "You classify music artists for a Hip-Hop / K-POP catalogue. Allowed genreBucket values: \"hiphop\", \"kpop\", \"other\". Use the album genre evidence as the primary signal and never invent facts. A K-Pop tag wins over a generic pop tag, and a Korean or Japanese Hip-Hop/Rap tag means hiphop. Return every artist you were given, exactly once. Answer with JSON only, no prose, in this exact shape: {\"results\":[{\"id\":\"<the id you were given>\",\"genreBucket\":\"hiphop\",\"confidence\":0.9,\"reason\":\"<short>\"}]}";

// DeepSeek answers 400/401/402/429 with a body that names the real problem, and
// those are the failures a fresh setup actually hits.
const STATUS_HINTS = {
  400: 'the request was rejected - check HIPKOP_AGENT_MODEL',
  401: 'the API key was rejected - check HIPKOP_AGENT_KEY / DEEPSEEK_API_KEY',
  402: 'the account has no balance',
  403: 'this key may not call that model',
  404: 'no such endpoint - check HIPKOP_AGENT_URL',
  429: 'rate limited - lower HIPKOP_AGENT_BATCH or retry later'
};

const isEnabled = () => Boolean(config.agentUrl);

const isDeepSeek = (endpoint) => /(^|\.)deepseek\.com/i.test(String(endpoint || ''));

// Accepts a full endpoint (https://api.deepseek.com/chat/completions) or the base
// the docs print (https://api.deepseek.com, .../v1) and fills in the path.
const resolveChatEndpoint = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  const trimmed = value.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return trimmed + '/chat/completions';
};

const buildChatBody = (candidates, evidenceByArtist, endpoint) => {
  const roster = (candidates || []).map((artist) => ({
    id: String(artist.id),
    name: artist.name,
    artistGenre: artist.genre || null,
    albumGenres: (evidenceByArtist.get(artist.id) || []).map((row) => row.genre + ' x' + row.count)
  }));
  const body = {
    model: config.agentModel,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(roster) }
    ]
  };
  // Some OpenAI-compatible proxies reject response_format, so it is switchable.
  if (config.agentJsonMode) body.response_format = { type: 'json_object' };
  return { endpoint: resolveChatEndpoint(endpoint || config.agentUrl), body };
};

const stripFence = (text) => {
  const value = String(text || '').trim();
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : value;
};

// Tolerant reader for every shape an OpenAI-compatible endpoint answers with:
// the chat envelope, a bare {results:[...]}, or a bare array.
const extractResults = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  const choice = payload.choices && payload.choices[0];
  const content = choice && choice.message ? choice.message.content : null;
  if (typeof content !== 'string' || !content.trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(stripFence(content));
  } catch (error) {
    return [];
  }
  return extractResults(parsed);
};

const parseResults = (payload) => {
  const out = [];
  for (const row of extractResults(payload)) {
    if (!row || !row.id) continue;
    const bucket = String(row.genreBucket || '').toLowerCase();
    if (!ALLOWED_BUCKETS.includes(bucket)) continue;
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

const describe = () => ({
  enabled: isEnabled(),
  endpoint: isEnabled() ? resolveChatEndpoint(config.agentUrl) : '',
  model: config.agentModel,
  keyPresent: Boolean(config.agentKey),
  jsonMode: config.agentJsonMode
});

const postChat = async ({ endpoint, body, timeoutMs }) => {
  const response = await fetchWithRetry(endpoint, {
    attempts: 2,
    timeout: timeoutMs,
    headers: config.agentKey ? { Authorization: 'Bearer ' + config.agentKey } : {},
    method: 'POST',
    body: JSON.stringify(body)
  });
  return response.json();
};

// deps.request exists so the tests can exercise every branch without network.
async function askModel(candidates, evidenceByArtist, deps = {}) {
  if (!isEnabled() || !candidates || !candidates.length) return null;
  const endpoint = resolveChatEndpoint(config.agentUrl);
  if (isDeepSeek(endpoint) && !config.agentKey) {
    log.warn('DeepSeek needs a key: set HIPKOP_AGENT_KEY or DEEPSEEK_API_KEY');
    return null;
  }

  if (!config.agentModel) {
    log.warn('no model configured: set HIPKOP_AGENT_MODEL');
    return null;
  }

  const request = deps.request || postChat;
  const answers = new Map();
  const batchSize = Math.max(1, config.agentBatchSize);
  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const slice = candidates.slice(offset, offset + batchSize);
    try {
      const payload = buildChatBody(slice, evidenceByArtist, endpoint);
      const data = await request(Object.assign({}, payload, { timeoutMs: config.agentTimeoutMs }));
      const rows = parseResults(data);
      if (!rows.length) {
        log.warn('model answered without usable JSON, falling back to the heuristic');
        return null;
      }
      for (const row of rows) {
        answers.set(row.id, Object.assign(row, { backend: config.agentModel || 'model' }));
      }
    } catch (error) {
      const hint = STATUS_HINTS[error.status] ? ' (' + STATUS_HINTS[error.status] + ')' : '';
      log.warn('model backend unavailable' + hint + ', falling back to heuristic: ' + error.message);
      return null;
    }
  }
  return answers.size ? answers : null;
}

module.exports = {
  askModel,
  isEnabled,
  resolveChatEndpoint,
  buildChatBody,
  extractResults,
  parseResults,
  describe,
  SYSTEM_PROMPT
};
