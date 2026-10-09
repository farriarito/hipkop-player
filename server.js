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
  res.end(fs.readFileSync(filePath));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/media/')) {
      await media.handleMedia(req, res, url);
      return;
    }
    if (pathname.startsWith('/api/')) {
      const handled = await api.handleApi(req, res, url);
      if (!handled) {
        api.json(res, { error: 'not_found' }, 404);
      }
      return;
    }
    serveStatic(req, res, decodeURIComponent(pathname));
  } catch (error) {
    log.error(`${req.method} ${pathname} failed:`, error.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'internal_error', message: error.message }));
  }
});

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
