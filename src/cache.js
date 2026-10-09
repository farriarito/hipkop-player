'use strict';

// Read cache for JSON API responses.
//
// Two backends, same TTL semantics:
//
//   memory  built-in LRU + TTL. Always available, no ops, and enough for the
//           single-process deployment the lab server runs.
//   redis   used when HIPKOP_REDIS_URL is set (docker-compose ships one), so the
//           same code survives a restart and scales past one process.
//
// Invalidation is by namespace, not by key scan: every write bumps the
// namespace generation (one INCR), so a sync run cannot leave a stale page.

const net = require('node:net');

const config = require('./config');
const log = require('./util/logger')('cache');

const MAX_ENTRIES = Math.max(16, Number(process.env.HIPKOP_CACHE_ENTRIES || 500));
const KEY_ROOT = 'hipkop:cache';
const GEN_ROOT = 'hipkop:gen';

// ---------------------------------------------------------------------------
// memory backend
// ---------------------------------------------------------------------------
const memory = new Map(); // key -> { value, expires }

const memoryStore = {
  kind: 'memory',
  async get(key) {
    const hit = memory.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      memory.delete(key);
      return undefined;
    }
    memory.delete(key);
    memory.set(key, hit); // refresh LRU position
    return hit.value;
  },
  async set(key, value, ttlMs) {
    memory.set(key, { value, expires: Date.now() + ttlMs });
    while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value);
  },
  async bump(namespace) {
    const needle = `${namespace}:`;
    for (const key of [...memory.keys()]) if (key.startsWith(needle)) memory.delete(key);
  },
  stats: () => ({ backend: 'memory', entries: memory.size, limit: MAX_ENTRIES })
};

// ---------------------------------------------------------------------------
// redis backend — minimal RESP client, because the project keeps zero deps
// ---------------------------------------------------------------------------
const encodeCommand = (args) => {
  const parts = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const value = Buffer.from(String(arg));
    parts.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from('\r\n'));
  }
  return Buffer.concat(parts);
};

// Returns [value, bytesConsumed] or null when the reply is not complete yet.
function parseReply(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const lineEnd = buffer.indexOf('\r\n', offset + 1);
  if (lineEnd < 0) return null;
  const type = String.fromCharCode(buffer[offset]);
  const line = buffer.slice(offset + 1, lineEnd).toString();
  const next = lineEnd + 2;

  if (type === '+') return [line, next];
  if (type === '-') return [{ error: line }, next];
  if (type === ':') return [Number(line), next];
  if (type === '$') {
    const size = Number(line);
    if (size === -1) return [null, next];
    const end = next + size;
    if (buffer.length < end + 2) return null;
    return [buffer.slice(next, end).toString(), end + 2];
  }
  if (type === '*') {
    const count = Number(line);
    if (count === -1) return [null, next];
    const items = [];
    let cursor = next;
    for (let index = 0; index < count; index += 1) {
      const item = parseReply(buffer, cursor);
      if (!item) return null;
      items.push(item[0]);
      cursor = item[1];
    }
    return [items, cursor];
  }
  return [null, next];
}

// Redis is optional infrastructure: if it is configured but unreachable, falling
// through to SQLite on every request is exactly the behaviour this module exists
// to prevent. These helpers reuse the in-process LRU (which shares the key shape
// so one namespace bump clears both sides) while the socket is down.
const redisFallback = {
  get: (key) => memoryStore.get(key),
  set: (key, value, ttlMs) => memoryStore.set(key, value, ttlMs),
  bump: (namespace) => memoryStore.bump(`${KEY_ROOT}:${namespace}`)
};

function redisStore(rawUrl) {
  const target = new URL(rawUrl);
  const state = { socket: null, ready: false, buffer: Buffer.alloc(0), waiting: [], queued: [], reconnectMs: 1000, closing: false, warned: false };

  // One line per outage, not one per request: a Redis blip must not flood the log.
  const warnOnce = (message) => {
    if (state.warned) return;
    state.warned = true;
    log.warn(message);
  };
  const flush = () => {
    while (state.waiting.length) {
      const parsed = parseReply(state.buffer);
      if (!parsed) break;
      state.buffer = state.buffer.slice(parsed[1]);
      const entry = state.waiting.shift();
      if (parsed[0] && typeof parsed[0] === 'object' && parsed[0].error) entry.reject(new Error(parsed[0].error));
      else entry.resolve(parsed[0]);
    }
  };

  const connect = () => {
    if (state.closing) return;
    const socket = net.createConnection({ host: target.hostname, port: Number(target.port || 6379) });
    state.socket = socket;
    socket.setNoDelay(true);
    socket.on('connect', async () => {
      state.ready = true;
      state.reconnectMs = 1000;
      state.warned = false;
      if (target.password) {
        try {
          await send(['AUTH', decodeURIComponent(target.password)]);
        } catch (error) {
          log.warn(`redis auth failed: ${error.message}`);
        }
      }
      // Anything queued while the socket was down was already rejected. Writing
      // it now would consume replies meant for the next caller.
      state.queued.length = 0;
    });
    socket.on('data', (chunk) => {
      state.buffer = Buffer.concat([state.buffer, chunk]);
      flush();
    });
    socket.on('error', (error) => {
      log.warn(`redis socket error: ${error.message}`);
    });
    socket.on('close', () => {
      state.ready = false;
      state.socket = null;
      const waiting = state.waiting.splice(0);
      waiting.forEach((entry) => entry.reject(new Error('redis_disconnected')));
      if (state.closing) return;
      setTimeout(connect, state.reconnectMs).unref?.();
      state.reconnectMs = Math.min(30000, state.reconnectMs * 2);
    });
  };

  const send = (args) =>
    new Promise((resolve, reject) => {
      if (!state.ready || !state.socket) {
        if (state.queued.length < 100) state.queued.push(args);
        reject(new Error('redis_unavailable'));
        return;
      }
      state.waiting.push({ resolve, reject });
      state.socket.write(encodeCommand(args));
    });

  connect();

  return {
    kind: 'redis',
    async get(key) {
      if (!state.ready) return redisFallback.get(key);
      try {
        const raw = await send(['GET', key]);
        return raw === null || raw === undefined ? undefined : JSON.parse(raw);
      } catch {
        return redisFallback.get(key);
      }
    },
    async set(key, value, ttlMs) {
      try {
        if (!state.ready) throw new Error('redis_unavailable');
        await send(['SET', key, JSON.stringify(value), 'PX', Math.max(1000, Math.round(ttlMs))]);
      } catch (error) {
        warnOnce(`redis set failed: ${error.message}`);
        await redisFallback.set(key, value, ttlMs);
      }
    },
    async bump(namespace) {
      // Always clear the local mirror, even when Redis is healthy: a request that
      // was served from the fallback must not outlive its namespace.
      await redisFallback.bump(namespace);
      try {
        if (!state.ready) throw new Error('redis_unavailable');
        await send(['INCR', `${GEN_ROOT}:${namespace}`]);
      } catch (error) {
        warnOnce(`redis invalidation failed: ${error.message}`);
      }
    },
    stats: () => ({ backend: 'redis', connected: state.ready, waiting: state.waiting.length, fallbackEntries: memoryStore.stats().entries }),
    close() {
      state.closing = true;
      state.queued.length = 0;
      state.socket?.destroy();
      state.socket = null;
    }
  };
}

const store = (() => {
  if (!config.redisUrl) return memoryStore;
  try {
    return redisStore(config.redisUrl);
  } catch (error) {
    log.warn(`redis unusable (${error.message}); using the in-process cache`);
    return memoryStore;
  }
})();

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------
const generations = new Map();
const inflight = new Map();

const generationOf = async (namespace) => {
  if (store.kind === 'memory') return '0';
  const cached = generations.get(namespace);
  if (cached && cached.expires > Date.now()) return cached.value;
  const raw = await store.get(`${GEN_ROOT}:${namespace}`);
  const value = String(raw ?? 0);
  generations.set(namespace, { value, expires: Date.now() + 1000 });
  return value;
};

const api = {
  backend: store.kind,
  stats: () => ({ ...store.stats(), inflight: inflight.size }),
  get: (key) => store.get(key),
  set: (key, value, ttlMs) => (Number.isFinite(ttlMs) && ttlMs > 0 ? store.set(key, value, ttlMs) : undefined),
  async bump(namespace) {
    generations.delete(namespace);
    await store.bump(namespace);
  },
  bumpMany: (namespaces) => Promise.all(namespaces.map((namespace) => api.bump(namespace))),
  /** Stop the Redis socket so the process can exit cleanly. */
  close: () => Promise.resolve(store.close?.()),
  keyFor: async (namespace, key) =>
    store.kind === 'memory'
      ? `${namespace}:${key}`
      : `${KEY_ROOT}:${namespace}:g${await generationOf(namespace)}:${key}`,
  /**
   * Read-through helper: one producer per key even when several requests miss
   * at the same time, which is exactly what a page load does.
   */
  async wrap(namespace, key, ttlMs, producer) {
    const cacheKey = await api.keyFor(namespace, key);
    const hit = await store.get(cacheKey);
    if (hit !== undefined) return hit;

    const pendingKey = cacheKey;
    const pending = inflight.get(pendingKey);
    if (pending) return pending;

    const task = (async () => {
      const value = await producer();
      await store.set(cacheKey, value, ttlMs);
      return value;
    })();
    inflight.set(pendingKey, task);
    try {
      return await task;
    } finally {
      inflight.delete(pendingKey);
    }
  }
};

module.exports = api;