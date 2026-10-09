'use strict';

// Cover / avatar / hero media service.
//
// Providers hand us remote artwork URLs. The browser never hotlinks them:
//  - GET /media/cover/:albumId?w=300
//  - GET /media/avatar/:artistId?w=100
//  - GET /media/hero/:artistId?w=600
//  - GET /media/proxy?url=...   (allow-listed hosts only, for ad-hoc art)
//
// Two things make this cheap on a slow link:
//  1. ?w= asks the upstream CDN for the size actually displayed. Apple artwork
//     URLs carry a `/<size>x<size>bb.jpg` segment, so a 900px cover can be
//     re-requested as 300px - 6-8x fewer bytes per tile, per size on disk.
//  2. Upstream fetches are de-duplicated and capped, so a cold grid of 30 tiles
//     cannot open 30 sockets at once.
//
// Files are downloaded once, cached on disk, and recorded in cover_cache. When a
// download fails we keep the failure row and serve a local placeholder so the UI
// never depends on a fragile third-party image host.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const repo = require('./repo');
const { fetchArtwork } = require('./util/artwork');
const log = require('./util/logger')('media');
const pending = new Map();

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif'
};

const ALLOWED_HOST_SUFFIXES = [
  'mzstatic.com',
  'itunes.apple.com',
  'apple.com',
  'deezer.com',
  'dzcdn.net',
  'fastly.net',
  'coverartarchive.org',
  'archive.org',
  'discogs.com'
];

const hostAllowed = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
};

// Only these widths are ever fetched, so a stray ?w= cannot mint cache entries.
const SIZES = [100, 300, 600, 900];
const DEFAULT_SIZE = 900;

const sizeOf = (raw) => {
  const wanted = Math.round(Number(raw));
  if (!Number.isFinite(wanted) || wanted <= 0) return DEFAULT_SIZE;
  return SIZES.reduce((best, size) => (Math.abs(size - wanted) < Math.abs(best - wanted) ? size : best), DEFAULT_SIZE);
};

// Apple/Google-style artwork URLs end in `/<w>x<h>[bb].jpg`. Rewriting that
// segment is what turns a 330 KB tile into a 48 KB one. URLs that do not match
// (Deezer hashes, plain files) are returned untouched.
const variantUrl = (sourceUrl, size = DEFAULT_SIZE) => {
  if (!sourceUrl || size === DEFAULT_SIZE) return sourceUrl;
  return String(sourceUrl).replace(/(\d+)x(\d+)(bb)?(?=\.[a-z0-9]+$)/i, `${size}x${size}$3`);
};

// --- upstream gate ---------------------------------------------------------
// A cold grid asks for dozens of covers at once. Without a ceiling every tile
// opens its own socket; without a queue the ones over the ceiling would have to
// be dropped, which would paint placeholders on a first visit.
const MAX_UPSTREAM = Math.max(1, Number(process.env.HIPKOP_MEDIA_CONCURRENCY || 6));
let activeFetches = 0;
const waitingFetches = [];

const acquireFetchSlot = () => {
  if (activeFetches < MAX_UPSTREAM) {
    activeFetches += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitingFetches.push(resolve)).then(() => {
    activeFetches += 1;
  });
};

const releaseFetchSlot = () => {
  activeFetches -= 1;
  const next = waitingFetches.shift();
  if (next) next();
};

const keyFor = (sourceUrl) => crypto.createHash('sha1').update(sourceUrl).digest('hex');

const extFor = (sourceUrl, contentType) => {
  if (contentType && EXT_BY_TYPE[contentType.split(';')[0].trim()]) {
    return EXT_BY_TYPE[contentType.split(';')[0].trim()];
  }
  const match = /\.([a-z0-9]{3,4})(?:\?|$)/i.exec(sourceUrl);
  return match ? match[1].toLowerCase() : 'jpg';
};

const localFilePath = (sourceUrl, contentType) =>
  path.join(config.mediaDir, `${keyFor(sourceUrl)}.${extFor(sourceUrl, contentType)}`);

const CONTENT_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif'
};

/**
 * Ensure a remote image exists in the local cache.
 * Returns { status, filePath, contentType } — status is 'ready' or 'failed'.
 */
async function cacheArtwork(sourceUrl) {
  if (!sourceUrl) return { status: 'missing', filePath: null, contentType: null };

  const cached = repo.getCover(sourceUrl);
  const portableName = cached?.localPath?.split(/[\\/]/).pop();
  const cachedPath = portableName && /^[a-f0-9]{40}\.(jpg|jpeg|png|webp|gif|avif)$/.test(portableName) ? path.join(config.mediaDir, portableName) : null;
  if (cached && cached.status === 'ready' && cachedPath && fs.existsSync(cachedPath)) {
    return { status: 'ready', filePath: cachedPath, contentType: cached.contentType };
  }
  if (cached && cached.status === 'failed' && Date.now() - Date.parse(cached.updatedAt) < 5 * 60000) {
    return { status: 'failed', filePath: null, contentType: null };
  }

  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return { status: 'failed', filePath: null, contentType: null };
  }
  if (parsed.protocol !== 'https:' || !hostAllowed(parsed.hostname)) {
    log.warn(`refusing to cache non-allowlisted host: ${parsed.hostname}`);
    return { status: 'failed', filePath: null, contentType: null };
  }

  repo.beginCover(sourceUrl);
  try {
    const { buffer, contentType } = await fetchArtwork(sourceUrl, {
      hostAllowed,
      maxBytes: config.mediaMaxBytes,
      timeout: config.mediaTimeoutMs
    });
    if (buffer.length > config.mediaMaxBytes) throw new Error('image_too_large');
    const filePath = localFilePath(sourceUrl, contentType);
    fs.writeFileSync(filePath, buffer);
    repo.completeCover(sourceUrl, { localPath: path.basename(filePath), contentType, bytes: buffer.length });
    return { status: 'ready', filePath, contentType };
  } catch (error) {
    repo.failCover(sourceUrl, error.message);
    log.warn(`cover cache failed for ${sourceUrl}: ${error.message}`);
    return { status: 'failed', filePath: null, contentType: null };
  }
}

function ensureCached(sourceUrl) {
  if (!sourceUrl) return Promise.resolve({ status: 'missing', filePath: null, contentType: null });
  const inFlight = pending.get(sourceUrl);
  if (inFlight) return inFlight;
  const job = (async () => {
    await acquireFetchSlot();
    try {
      return await cacheArtwork(sourceUrl);
    } finally {
      releaseFetchSlot();
    }
  })().finally(() => pending.delete(sourceUrl));
  pending.set(sourceUrl, job);
  return job;
}

/** Cache one entity's art at one width. Used by the warm-up sweep and by routes. */
async function cacheEntity(kind, id, size) {
  const { url, label } = resolveSourceUrl(kind, id);
  if (!url) return { status: 'missing', label };
  const result = await ensureCached(variantUrl(url, sizeOf(size)));
  return { status: result.status, label };
}

const placeholderSvg = (label, tone = '#2b2b3a') => {
  const text = String(label || 'HIPKOP').slice(0, 2).toUpperCase();
  const safe = text.replace(/[<>&"']/g, '');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${tone}"/><stop offset="1" stop-color="#111119"/>
      </linearGradient></defs>
      <rect width="600" height="600" fill="url(#g)"/>
      <text x="50%" y="52%" fill="#f7f1e4" font-family="system-ui,sans-serif" font-size="180"
        font-weight="700" text-anchor="middle" dominant-baseline="middle">${safe}</text>
    </svg>`
  );
};

const sendBuffer = (res, buffer, contentType) => {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Cache-Control': 'public, max-age=86400, immutable'
  });
  res.end(buffer);
};

const sendPlaceholder = (res, label) => {
  res.writeHead(200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300'
  });
  res.end(placeholderSvg(label));
};

function resolveSourceUrl(kind, id) {
  if (kind === 'cover') {
    const album = repo.getAlbumRow(id);
    return { url: album?.coverUrl || null, label: album?.title || 'HIPKOP' };
  }
  if (kind === 'avatar' || kind === 'hero') {
    const artist = repo.getArtistRow(id);
    if (!artist) return { url: null, label: 'HIPKOP' };
    let url = kind === 'avatar' ? artist.avatarUrl || artist.heroUrl : artist.heroUrl || artist.avatarUrl;
    if (!url) {
      const top = repo.artistAlbums(id, 1)[0];
      url = top?.coverUrl || null;
    }
    return { url: url || null, label: artist.name };
  }
  return { url: null, label: 'HIPKOP' };
}

/**
 * Handle /media/* requests. Returns true when the request was handled.
 */
async function handleMedia(req, res, url) {
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/media/proxy') {
    const target = url.searchParams.get('url');
    if (!target) {
      res.writeHead(400);
      res.end('missing url');
      return true;
    }
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      res.writeHead(400);
      res.end('bad url');
      return true;
    }
    if (parsed.protocol !== 'https:' || !hostAllowed(parsed.hostname)) {
      res.writeHead(403);
      res.end('host not allowed');
      return true;
    }
    try {
      const cached = await ensureCached(target);
      if (cached.status !== 'ready') { sendPlaceholder(res, 'H'); return true; }
      sendBuffer(res, fs.readFileSync(cached.filePath), cached.contentType);
      return true;
    } catch (error) {
      log.warn(`proxy failed: ${error.message}`);
      sendPlaceholder(res, 'H');
      return true;
    }
  }

  const match = /^\/media\/(cover|avatar|hero)\/(.+)$/.exec(pathname);
  if (!match) return false;

  const kind = match[1];
  const id = match[2];
  const size = sizeOf(url.searchParams.get('w'));
  const { url: sourceUrl, label } = resolveSourceUrl(kind, id);

  if (!sourceUrl) {
    sendPlaceholder(res, label);
    return true;
  }

  const cached = await ensureCached(variantUrl(sourceUrl, size));
  if (cached.status === 'ready') {
    const buffer = fs.readFileSync(cached.filePath);
    const contentType =
      cached.contentType || CONTENT_BY_EXT[cached.filePath.split('.').pop()] || 'image/jpeg';
    sendBuffer(res, buffer, contentType);
    return true;
  }

  sendPlaceholder(res, label);
  return true;
}

module.exports = {
  handleMedia,
  ensureCached,
  cacheEntity,
  variantUrl,
  sizeOf,
  resolveSourceUrl,
  SIZES,
  DEFAULT_SIZE,
  placeholderSvg,
  hostAllowed
};