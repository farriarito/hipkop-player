'use strict';

// The shared fetch helper is used by every provider, and a silent option drop
// once turned every POST into a GET (DeepSeek answered 405). These tests pin the
// options down against a loopback server, so they need no network.

const http = require('http');
const test = require('node:test');
const assert = require('node:assert');

const { fetchWithRetry, fetchJson } = require('../src/util/http');

const startServer = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

const urlOf = (server) => 'http://127.0.0.1:' + server.address().port + '/';

test('http: post method, body and headers reach the server', async () => {
  const seen = {};
  const server = await startServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      seen.method = req.method;
      seen.body = body;
      seen.auth = req.headers.authorization;
      seen.contentType = req.headers['content-type'];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  try {
    const data = await fetchJson(urlOf(server), {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' }
    });
    assert.deepStrictEqual(data, { ok: true });
    assert.strictEqual(seen.method, 'POST', 'the method must survive the helper');
    assert.strictEqual(seen.body, JSON.stringify({ hello: 'world' }), 'the body must survive the helper');
    assert.strictEqual(seen.auth, 'Bearer test');
    assert.strictEqual(seen.contentType, 'application/json');
  } finally {
    server.close();
  }
});

test('http: get still works and defaults to GET', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ method: req.method }));
  });
  try {
    const data = await fetchJson(urlOf(server));
    assert.strictEqual(data.method, 'GET');
  } finally {
    server.close();
  }
});

test('http: a retryable status is retried, then succeeds', async () => {
  let hits = 0;
  const server = await startServer((req, res) => {
    hits += 1;
    if (hits === 1) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hits }));
  });
  try {
    const data = await fetchJson(urlOf(server), { attempts: 3, backoffMs: 1 });
    assert.strictEqual(data.hits, 2);
    assert.strictEqual(hits, 2);
  } finally {
    server.close();
  }
});

test('http: a non-retryable status fails fast', async () => {
  let hits = 0;
  const server = await startServer((req, res) => {
    hits += 1;
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  try {
    await assert.rejects(
      () => fetchWithRetry(urlOf(server), { attempts: 3, backoffMs: 1 }),
      (error) => error.status === 401
    );
    assert.strictEqual(hits, 1, '401 must not be retried');
  } finally {
    server.close();
  }
});
