'use strict';

// Network-free tests for the optional model backend. The request/response mapping
// is what has to be right for DeepSeek (or any OpenAI-compatible endpoint) to be
// usable, and every failure has to degrade to the offline heuristic.

const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const stamp = `${process.pid}-${Date.now()}`;
process.env.HIPKOP_DB_PATH = path.join(os.tmpdir(), `hipkop-agent-${stamp}.sqlite`);
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-agent-media-${stamp}`);
process.env.HIPKOP_DISABLED_PROVIDERS = 'itunes,deezer,musicbrainz,lastfm';
process.env.HIPKOP_SCHEDULER = '0';
process.env.HIPKOP_AGENT_URL = 'https://api.deepseek.com';
process.env.HIPKOP_AGENT_KEY = 'test-key';
process.env.HIPKOP_AGENT_MODEL = 'deepseek-chat';

const config = require('../src/config');
const model = require('../src/agents/model');

const candidates = [
  { id: 'a1', name: 'Test Idol', genre: null },
  { id: 'a2', name: 'Test Rapper', genre: 'Hip-Hop/Rap' }
];
const evidence = new Map([
  ['a1', [{ genre: 'Dance', count: 3 }]],
  ['a2', [{ genre: 'Hip-Hop/Rap', count: 2 }]]
]);

const chatReply = (content) => ({ choices: [{ message: { role: 'assistant', content } }] });

test('agent model: the endpoint accepts a base url or a full url', () => {
  assert.strictEqual(model.resolveChatEndpoint('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
  assert.strictEqual(model.resolveChatEndpoint('https://api.deepseek.com/'), 'https://api.deepseek.com/chat/completions');
  assert.strictEqual(model.resolveChatEndpoint('https://api.deepseek.com/v1'), 'https://api.deepseek.com/v1/chat/completions');
  assert.strictEqual(
    model.resolveChatEndpoint('https://api.deepseek.com/chat/completions'),
    'https://api.deepseek.com/chat/completions'
  );
  assert.strictEqual(model.resolveChatEndpoint(''), '');
});

test('agent model: the request is a standard chat completion', () => {
  const { endpoint, body } = model.buildChatBody(candidates, evidence, 'https://api.deepseek.com/v1');
  assert.strictEqual(endpoint, 'https://api.deepseek.com/v1/chat/completions');
  assert.strictEqual(body.model, 'deepseek-chat');
  assert.strictEqual(body.temperature, 0);
  assert.strictEqual(body.messages.length, 2);
  assert.strictEqual(body.messages[0].role, 'system');
  assert.strictEqual(body.messages[1].role, 'user');
  if (config.agentJsonMode) assert.strictEqual(body.response_format.type, 'json_object');
  else assert.strictEqual(body.response_format, undefined);

  const roster = JSON.parse(body.messages[1].content);
  assert.deepStrictEqual(roster[1], { id: 'a2', name: 'Test Rapper', artistGenre: 'Hip-Hop/Rap', albumGenres: ['Hip-Hop/Rap x2'] });
  assert.deepStrictEqual(roster[0].albumGenres, ['Dance x3']);
});

test('agent model: reads the chat envelope, fenced json, and bare shapes', () => {
  const rows = [{ id: 'a1', genreBucket: 'kpop', confidence: 0.92, reason: 'idol group' }];
  const payload = JSON.stringify({ results: rows });

  assert.strictEqual(model.parseResults(chatReply(payload)).length, 1, 'plain json content');
  assert.strictEqual(model.parseResults(chatReply('```json\n' + payload + '\n```')).length, 1, 'fenced json');
  assert.strictEqual(model.parseResults({ results: rows }).length, 1, 'bare results object');
  assert.strictEqual(model.parseResults(rows).length, 1, 'bare array');
  assert.strictEqual(model.parseResults(chatReply('I think it is K-Pop.')).length, 0, 'prose is rejected');
  assert.strictEqual(model.parseResults(chatReply('{not json')).length, 0, 'broken json is rejected');
  assert.strictEqual(model.parseResults(null).length, 0);
});

test('agent model: drops rows with an unknown bucket or no confidence', () => {
  const rows = [
    { id: 'a1', genreBucket: 'kpop', confidence: 0.9 },
    { id: 'a2', genreBucket: 'polka', confidence: 0.9 },
    { id: 'a3', genreBucket: 'hiphop' },
    { genreBucket: 'hiphop', confidence: 0.9 }
  ];
  assert.deepStrictEqual(model.parseResults(rows).map((row) => row.id), ['a1']);
});

test('agent model: the outgoing request is JSON, not text/plain', () => {
  const headers = model.buildChatHeaders();
  // Without this header undici labels the body text/plain and the API answers 415.
  assert.strictEqual(headers['Content-Type'], 'application/json');
  assert.strictEqual(headers.Authorization, 'Bearer test-key');
});

test('agent model: a good answer becomes a verdict map', async () => {
  const seen = [];
  const request = async (payload) => {
    seen.push(payload);
    return chatReply(JSON.stringify({ results: [
      { id: 'a1', genreBucket: 'kpop', confidence: 0.88, reason: 'idol' },
      { id: 'a2', genreBucket: 'hiphop', confidence: 0.95, reason: 'rap' }
    ] }));
  };
  const answers = await model.askModel(candidates, evidence, { request });
  assert.strictEqual(answers.size, 2);
  assert.strictEqual(answers.get('a1').genreBucket, 'kpop');
  assert.strictEqual(answers.get('a1').backend, 'deepseek-chat');
  assert.strictEqual(answers.get('a2').genreBucket, 'hiphop');
  assert.strictEqual(seen[0].endpoint, 'https://api.deepseek.com/chat/completions');
  assert.strictEqual(seen[0].timeoutMs, config.agentTimeoutMs);
});

test('agent model: every failure falls back instead of throwing', async () => {
  const fail = (status) => async () => {
    const error = new Error('upstream_http_' + status);
    error.status = status;
    throw error;
  };
  assert.strictEqual(await model.askModel(candidates, evidence, { request: fail(401) }), null);
  assert.strictEqual(await model.askModel(candidates, evidence, { request: fail(402) }), null);
  assert.strictEqual(await model.askModel(candidates, evidence, { request: async () => { throw new Error('upstream_timeout'); } }), null);
  assert.strictEqual(await model.askModel(candidates, evidence, { request: async () => chatReply('sorry, no idea') }), null);
  assert.strictEqual(await model.askModel(candidates, evidence, { request: async () => chatReply(JSON.stringify({ results: [] })) }), null);
});

test('agent model: the descriptor never leaks the key', () => {
  const info = model.describe();
  assert.strictEqual(info.enabled, true);
  assert.strictEqual(info.model, 'deepseek-chat');
  assert.strictEqual(info.keyPresent, true);
  assert.ok(!JSON.stringify(info).includes('test-key'));
});
