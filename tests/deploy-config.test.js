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
  assert.match(compose, /\/api\/health|healthcheck/i);
});