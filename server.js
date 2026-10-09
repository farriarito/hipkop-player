'use strict';

// HIPKOP PLAYER server.
//
// Static SPA + JSON API + media cache. No external runtime dependencies: the
// catalog lives in SQLite (node:sqlite) and sync runs in-process.

const http = require('http');
const fs = require('fs');
const path = require('path');

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

function serveStatic(req, res, pathname) {
  const relative = ['/', '', '/hipkop', '/hipkop/'].includes(pathname) ? 'index.html' : `.${pathname}`;
  const filePath = path.resolve(PUBLIC, relative);
  if (!filePath.startsWith(`${PUBLIC}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300'
  });
  fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
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
    serveStatic(req, res, decodeURIComponent(pathname));
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
