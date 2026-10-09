'use strict';

// The read cache behind /api/*. Without HIPKOP_REDIS_URL it is a plain LRU in
// the server process, which is what the single-process deployment uses. These
// tests pin the two behaviours a page load depends on: concurrent misses on one
// key run the producer once, and a namespace bump drops every key in it.

const test = require('node:test');
const assert = require('node:assert');

const cache = require('../src/cache');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('cache: memory backend is the default and reports itself', () => {
  assert.strictEqual(cache.backend, 'memory');
  const stats = cache.stats();
  assert.strictEqual(stats.backend, 'memory');
  assert.ok(stats.limit >= 16);
});

test('cache: keyFor namespaces keys so one bump cannot leak into another', async () => {
  assert.strictEqual(await cache.keyFor('albums', 'limit=10'), 'albums:limit=10');
  assert.strictEqual(await cache.keyFor('charts', 'us'), 'charts:us');
});

test('cache: wrap runs the producer once, then serves the stored value', async () => {
  let runs = 0;
  const producer = async () => {
    runs += 1;
    return { runs };
  };
  const first = await cache.wrap('albums', 'once', 60000, producer);
  const second = await cache.wrap('albums', 'once', 60000, producer);
  assert.deepStrictEqual(first, { runs: 1 });
  assert.deepStrictEqual(second, { runs: 1 });
  assert.strictEqual(runs, 1, 'the second read must not touch the database');
});

test('cache: concurrent misses on one key share a single producer', async () => {
  let runs = 0;
  const producer = async () => {
    runs += 1;
    await sleep(20);
    return 'payload';
  };
  const values = await Promise.all([
    cache.wrap('search', 'q=aiko', 60000, producer),
    cache.wrap('search', 'q=aiko', 60000, producer),
    cache.wrap('search', 'q=aiko', 60000, producer)
  ]);
  assert.deepStrictEqual(values, ['payload', 'payload', 'payload']);
  assert.strictEqual(runs, 1, 'three parallel tiles must not run the query three times');
});

test('cache: an entry expires and is rebuilt once the TTL passes', async () => {
  let runs = 0;
  const producer = async () => {
    runs += 1;
    return runs;
  };
  assert.strictEqual(await cache.wrap('health', 'ttl', 25, producer), 1);
  assert.strictEqual(await cache.wrap('health', 'ttl', 25, producer), 1);
  await sleep(60);
  assert.strictEqual(await cache.wrap('health', 'ttl', 25, producer), 2);
});

test('cache: bump drops one namespace and leaves the others alone', async () => {
  await cache.wrap('posts', 'page', 60000, async () => 'old posts');
  assert.strictEqual(await cache.wrap('charts', 'us', 60000, async () => 'charts'), 'charts');
  await cache.bump('posts');
  assert.strictEqual(await cache.wrap('posts', 'page', 60000, async () => 'new posts'), 'new posts');
  let chartRuns = 0;
  assert.strictEqual(await cache.wrap('charts', 'us', 60000, async () => { chartRuns += 1; return 'recomputed'; }), 'charts');
  assert.strictEqual(chartRuns, 0, 'an unrelated namespace must survive the bump');
});

test('cache: bumpMany clears a whole sync fan-out', async () => {
  await cache.wrap('albums', 'a', 60000, async () => 1);
  await cache.wrap('releases', 'b', 60000, async () => 1);
  await cache.bumpMany(['albums', 'releases']);
  assert.strictEqual(await cache.wrap('albums', 'a', 60000, async () => 2), 2);
  assert.strictEqual(await cache.wrap('releases', 'b', 60000, async () => 2), 2);
});

test('cache: set refuses a non-positive TTL instead of storing forever', async () => {
  await cache.set('misc:forever', 'value', 0);
  assert.strictEqual(await cache.get('misc:forever'), undefined);
  await cache.set('misc:short', 'value', 5000);
  assert.strictEqual(await cache.get('misc:short'), 'value');
});

test('cache: the memory backend stays bounded', async () => {
  const limit = cache.stats().limit;
  for (let index = 0; index < limit + 25; index += 1) {
    await cache.set(`bulk:${index}`, index, 60000);
  }
  assert.ok(cache.stats().entries <= limit, 'an unbounded cache eventually eats the container');
});