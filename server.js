'use strict';

// HIPKOP PLAYER server.
//
// Static SPA + JSON API + media cache. No external runtime dependencies: the
// catalog lives in SQLite (node:sqlite) and sync runs in-process.

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const config = require('./src/config');
const repo = require('./src/repo');
const media = require('./src/media');
const api = require('./src/api');
const sync = require('./src/sync');
const scheduler = require('./src/scheduler');
const log = require('./src/util/logger')('server');
const security = require('./src/security');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const PUBLIC = path.resolve(config.publicDir);

// Compressed, hash-tagged asset delivery. Bundled JS/CSS is the difference
// between a first paint that waits on the network and one that does not: gzip
// takes the front-end payload from ~250 KB to ~70 KB, and an ETag turns every
// later visit into a 304 instead of a re-download.
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml)|image\/svg)/;
const IMMUTABLE_PATH = /^\/(vendor\/|assets\/fonts\/)/;
const assetCache = new Map();

function assetFor(filePath, ext) {
  const stat = fs.statSync(filePath);
  const hit = assetCache.get(filePath);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit;
  const raw = fs.readFileSync(filePath);
  const type = MIME[ext] || 'application/octet-stream';
  const entry = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    type,
    etag: `W/"${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 20)}"`,
    raw,
    gzip: null
  };
  if (COMPRESSIBLE.test(type)) entry.gzip = zlib.gzipSync(raw, { level: 6 });
  if (assetCache.size > 256) assetCache.clear();
  assetCache.set(filePath, entry);
  return entry;
}

function serveStatic(req, res, pathname, search) {
  const relative = ['/', '', '/hipkop', '/hipkop/'].includes(pathname) ? 'index.html' : `.${pathname}`;
  const filePath = path.resolve(PUBLIC, relative);
  if (!filePath.startsWith(`${PUBLIC}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();

  const asset = assetFor(filePath, ext);
  const versioned = new URLSearchParams(search || '').has('v');
  const headers = {
    'Content-Type': asset.type,
    ETag: asset.etag,
    // Set on every response, not just the compressed one: a shared cache must
    // know the body depends on Accept-Encoding both ways round.
    Vary: 'Accept-Encoding',
    'Cache-Control':
      ext === '.html'
        ? 'no-store'
        : versioned || IMMUTABLE_PATH.test(pathname)
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=600, must-revalidate'
  };

  if (req.headers['if-none-match'] === asset.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  if (asset.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(200, {
      ...headers,
      'Content-Encoding': 'gzip',
      'Content-Length': asset.gzip.length
    });
    res.end(asset.gzip);
    return;
  }

  res.writeHead(200, { ...headers, 'Content-Length': asset.raw.length });
  res.end(asset.raw);
}

const server = http.createServer(async (req, res) => {
  security.headers(res);
  let pathname = '';
  try {
    const url = new URL(req.url, 'http://localhost');
    pathname = url.pathname;
    if (req.url.length > 4096) { security.reject(res, 414, 'url_too_long'); return; }
    if (!security.rateLimit(req, res, 'global', 600)) return;
    if (!['GET', 'POST', 'HEAD'].includes(req.method)) { security.reject(res, 405, 'method_not_allowed'); return; }
    if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
    if (pathname.startsWith('/media/')) {
      if (req.method !== 'GET') { security.reject(res, 405, 'method_not_allowed'); return; }
      if (!security.rateLimit(req, res, 'media', 300)) return;
      const handled = await media.handleMedia(req, res, url);
      if (!handled) security.reject(res, 404, 'not_found');
      return;
    }
    if (pathname.startsWith('/api/')) {
      const handled = await api.handleApi(req, res, url);
      if (!handled) {
        api.json(res, { error: 'not_found' }, 404);
      }
      return;
    }
    if (req.method !== 'GET') { security.reject(res, 405, 'method_not_allowed'); return; }
    serveStatic(req, res, decodeURIComponent(pathname), url.search);
  } catch (error) {
    log.error(`${req.method} ${pathname} failed:`, error.message);
    if (!res.headersSent) {
      res.writeHead(error.status || (error instanceof URIError ? 400 : 500), { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: error.status ? error.message : error instanceof URIError ? 'invalid_url' : 'internal_error' }));
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;

function bootstrap() {
  sync.registerSources();

  // First boot (or an empty catalog): populate immediately instead of waiting
  // for the daily window. The unique active-job index prevents duplicates.
  const stats = repo.stats();
  if (stats.albums === 0) {
    sync.enqueueJob({ type: 'releases', priority: 2, runAt: Date.now() });
    log.info('empty catalog detected — queued an initial release scan');
  }

  scheduler.start();
}

if (require.main === module) {
  server.listen(config.port, config.host, () => {
    log.info(`HIPKOP PLAYER listening on http://${config.host}:${config.port}`);
    log.info(`db=${config.dbPath} media=${config.mediaDir}`);
    bootstrap();
  });

  const shutdown = (signal) => {
    log.info(`${signal} received, shutting down`);
    scheduler.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { server, bootstrap, serveStatic, MIME };
