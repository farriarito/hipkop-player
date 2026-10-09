'use strict';

// HIPKOP_REDIS_URL switches the read cache to Redis so a restart or a second
// replica shares one generation counter. The client is hand-written (the project
// keeps zero npm dependencies), so it is pinned against a socket-level fake that
// speaks just enough RESP: AUTH, GET, SET ... PX, INCR.
//
// Replies are optionally split across two TCP writes to prove the incremental
// parser does not assume one packet per reply.

const net = require('node:net');
const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One RESP frame reader for the fake server: *N then N bulk strings.
const readCommand = (buffer, offset = 0) => {
  if (buffer.length <= offset || String.fromCharCode(buffer[offset]) !== '*') return null;
  const head = buffer.indexOf('\r\n', offset);
  if (head < 0) return null;
  const count = Number(buffer.slice(offset + 1, head).toString());
  const args = [];
  let cursor = head + 2;
  for (let index = 0; index < count; index += 1) {
    if (cursor >= buffer.length || String.fromCharCode(buffer[cursor]) !== '$') return null;
    const sizeEnd = buffer.indexOf('\r\n', cursor);
    if (sizeEnd < 0) return null;
    const size = Number(buffer.slice(cursor + 1, sizeEnd).toString());
    const start = sizeEnd + 2;
    if (buffer.length < start + size + 2) return null;
    args.push(buffer.slice(start, start + size).toString());
    cursor = start + size + 2;
  }
  return [{ args }, cursor];
};

function startFakeRedis() {
  const store = new Map();
  const commands = [];
  const clients = new Set();
  let resolveConnect;
  const onConnect = new Promise((resolve) => { resolveConnect = resolve; });
  let split = false;

  const write = (socket, text) => {
    if (!split) {
      socket.write(text);
      return;
    }
    const middle = Math.max(1, Math.floor(text.length / 2));
    socket.write(text.slice(0, middle));
    setTimeout(() => socket.write(text.slice(middle)), 1);
  };

  const execute = (args) => {
    const name = String(args[0] || '').toUpperCase();
    if (name === 'AUTH') return '+OK\r\n';
    if (name === 'GET') {
      if (!store.has(args[1])) return '$-1\r\n';
      const value = String(store.get(args[1]));
      return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
    }
    if (name === 'SET') {
      store.set(args[1], args[2]);
      const px = args.indexOf('PX');
      if (px > 0) setTimeout(() => store.delete(args[1]), Number(args[px + 1])).unref();
      return '+OK\r\n';
    }
    if (name === 'INCR') {
      const value = (Number(store.get(args[1])) || 0) + 1;
      store.set(args[1], String(value));
      return `:${value}\r\n`;
    }
    return `-ERR unknown command '${name}'\r\n`;
  };

  const server = net.createServer((socket) => {
    clients.add(socket);
    resolveConnect();
    socket.on('close', () => clients.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const parsed = readCommand(buffer);
        if (!parsed) break;
        buffer = buffer.slice(parsed[1]);
        commands.push(parsed[0].args);
        write(socket, execute(parsed[0].args));
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        store,
        commands,
        onConnect,
        setSplit: (value) => { split = value; },
        close: () => {
          for (const socket of clients) socket.destroy();
          return new Promise((done) => server.close(done));
        }
      });
    });
  });
}

// The store is bound to the port present when src/cache.js is first required, so
// every test in this file shares one fake server.
let fake = null;
let cache = null;

const connect = async () => {
  if (!fake) {
    fake = await startFakeRedis();
    process.env.HIPKOP_REDIS_URL = `redis://127.0.0.1:${fake.port}`;
    cache = require('../src/cache');
  }
  await fake.onConnect;
  await sleep(30);
  return { fake, cache };
};

after(async () => {
  await cache?.close();
  await fake?.close();
});

test('redis: the cache talks RESP and keeps generations in the server', async () => {
  const { fake: redis, cache: store } = await connect();

  assert.strictEqual(store.backend, 'redis', 'HIPKOP_REDIS_URL must select the Redis backend');
  assert.ok(store.stats().connected, 'the socket must be up');
  assert.strictEqual(await store.keyFor('albums', 'limit=10'), 'hipkop:cache:albums:g0:limit=10');

  let runs = 0;
  const producer = async () => {
    runs += 1;
    return { page: runs };
  };

  assert.deepStrictEqual(await store.wrap('albums', 'limit=10', 60000, producer), { page: 1 });
  assert.deepStrictEqual(await store.wrap('albums', 'limit=10', 60000, producer), { page: 1 });
  assert.strictEqual(runs, 1, 'a warm key must not run the producer again');

  const set = redis.commands.find((args) => args[0] === 'SET');
  assert.ok(set, 'the payload must be written to Redis');
  assert.strictEqual(set[1], 'hipkop:cache:albums:g0:limit=10');
  assert.deepStrictEqual(set.slice(3), ['PX', '60000'], 'the TTL must reach Redis, not just the client');

  // A bump is one INCR: every process in the pool sees g1 and misses the old keys.
  await store.bump('albums');
  assert.ok(redis.commands.some((args) => args[0] === 'INCR' && args[1] === 'hipkop:gen:albums'));
  assert.strictEqual(await store.keyFor('albums', 'limit=10'), 'hipkop:cache:albums:g1:limit=10');
  assert.deepStrictEqual(await store.wrap('albums', 'limit=10', 60000, producer), { page: 2 }, 'the old payload is unreachable');

  assert.strictEqual(await store.keyFor('charts', 'us'), 'hipkop:cache:charts:g0:us', 'another namespace keeps its generation');
});

test('redis: replies split across packets are still parsed', async () => {
  const { fake: redis, cache: store } = await connect();
  redis.setSplit(true);

  const value = { title: 'split-frame', nested: { ok: true }, rows: [1, 2, 3] };
  await store.set('misc:split', value, 60000);
  assert.deepStrictEqual(await store.get('misc:split'), value);
  redis.setSplit(false);
});

test('cache: a dead Redis falls back to the in-process mirror instead of failing', async () => {
  const { fake: redis, cache: store } = await connect();
  await redis.close();
  await sleep(60);

  const produced = async () => ({ ok: 'fresh' });
  assert.deepStrictEqual(await store.wrap('releases', 'daily', 60000, produced), { ok: 'fresh' });
  assert.ok(store.stats().fallbackEntries > 0, 'the request must still end up cached somewhere');

  const key = await store.keyFor('releases', 'daily');
  assert.deepStrictEqual(await store.get(key), { ok: 'fresh' }, 'the mirror serves the next visitor');

  await store.bump('releases');
  assert.strictEqual(await store.get(key), undefined, 'a bump must clear the mirror too');
});