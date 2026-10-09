'use strict';

// Managed hosts (Railway / Render / Fly / Heroku-style) inject PORT and expect a
// container to bind every interface, while a laptop run should stay on loopback.
// The runtime config is read once per process, so probe it in child processes.

const path = require('path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert');

const root = path.join(__dirname, '..');

const probe = (env) =>
  execFileSync(
    process.execPath,
    ['-e', "const c=require('./src/config');process.stdout.write(c.port+','+c.host)"],
    {
      cwd: root,
      env: { ...process.env, HIPKOP_PLAYER_PORT: '', PORT: '', HIPKOP_PLAYER_HOST: '', ...env },
      encoding: 'utf8'
    }
  ).split(',');

test('deploy: a plain local run keeps the loopback default', () => {
  const [port, host] = probe({});
  assert.strictEqual(Number(port), 4180);
  assert.strictEqual(host, '127.0.0.1');
});

test('deploy: an injected PORT is honoured and binds every interface', () => {
  const [port, host] = probe({ PORT: '9000' });
  assert.strictEqual(Number(port), 9000);
  assert.strictEqual(host, '0.0.0.0');
});

test('deploy: HIPKOP_PLAYER_PORT wins over PORT', () => {
  const [port, host] = probe({ PORT: '9000', HIPKOP_PLAYER_PORT: '1234' });
  assert.strictEqual(Number(port), 1234);
  assert.strictEqual(host, '127.0.0.1');
});

test('deploy: an explicit bind host always wins', () => {
  const [port, host] = probe({ PORT: '9000', HIPKOP_PLAYER_HOST: '127.0.0.1' });
  assert.strictEqual(Number(port), 9000);
  assert.strictEqual(host, '127.0.0.1');
});

test('deploy: the container contract points the catalog at the volume', () => {
  const fs = require('node:fs');
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /HIPKOP_DB_PATH=\/data\/hipkop\.sqlite/);
  assert.match(dockerfile, /HIPKOP_MEDIA_DIR=\/data\/media/);
  assert.match(dockerfile, /VOLUME \["\/data"\]/);
  assert.match(dockerfile, /EXPOSE 8080/);
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /hipkop-data:\/data/);
  assert.match(compose, /service_healthy/i);
  assert.doesNotMatch(compose, /"8080:8080"/, 'only the HTTPS ingress should expose ports');
});

test('deploy: compose wires the app to a capped, non-persistent Redis cache', () => {
  const fs = require('node:fs');
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /HIPKOP_REDIS_URL: redis:\/\/redis:6379/, 'the app must be pointed at the cache service');
  assert.match(compose, /--maxmemory", "256mb"/, 'the cache must be capped');
  assert.match(compose, /--maxmemory-policy", "allkeys-lru"/, 'and must evict instead of growing without bound');
  assert.match(compose, /--appendonly", "no"/, 'cache data is disposable: no AOF');
  assert.match(compose, /redis-cli", "ping"/, 'a cache that is up but wedged must be visible');
});

test('deploy: a Redis outage cannot block the app, only slow it down', () => {
  const fs = require('node:fs');
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  const app = compose.slice(compose.indexOf('app:'), compose.indexOf('redis:'));
  assert.doesNotMatch(app, /depends_on/, 'the app must start, and keep serving, without the cache');
});

test('deploy: the bundle ships the ops scripts a server needs, not the dev ones', () => {
  const fs = require('node:fs');
  const build = fs.readFileSync(path.join(root, 'scripts/build.js'), 'utf8');
  assert.match(build, /'warm-media\.js'/, 'a fresh host must be able to pre-fetch artwork');
  assert.match(build, /'sync-once\.js'/, 'and to force a sync without waiting for the scheduler');
  assert.doesNotMatch(build, /verify-exhibition/, 'the Playwright checks belong to development');
});

test('deploy: the redis URL is opt-in, so a laptop run stays on the in-process cache', () => {
  const fs = require('node:fs');
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.match(example, /#HIPKOP_REDIS_URL=/, 'the sample env documents the knob without enabling it');
});
