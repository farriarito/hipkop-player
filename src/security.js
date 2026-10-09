'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const buckets = new Map();

function reject(res, status, error) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error }));
  return false;
}
function equal(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function isAdmin(req) {
  return equal(req.headers?.authorization, `Bearer ${config.adminToken}`) && config.adminToken.length >= 32;
}
function clientIp(req) {
  // Enable only behind an ingress that overwrites/appends X-Forwarded-For.
  // The rightmost address is the immediate client seen by that trusted ingress.
  const forwarded = req.headers?.['x-forwarded-for'];
  return config.trustProxy && forwarded ? String(forwarded).split(',').pop().trim() : req.socket?.remoteAddress || 'unknown';
}
function rateLimit(req, res, group, limit, windowMs = 60000) {
  const now = Date.now();
  for (const [key, entry] of buckets) if (entry.until <= now) buckets.delete(key);
  const key = `${group}:${clientIp(req)}`;
  let entry = buckets.get(key);
  if (!entry) {
    if (buckets.size >= 10000) return reject(res, 503, 'busy_try_later');
    entry = { count: 0, until: now + windowMs }; buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count <= limit) return true;
  res.setHeader('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
  return reject(res, 429, 'rate_limited');
}
function sameOrigin(req, res) {
  const origin = req.headers?.origin;
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return reject(res, 403, 'cross_site_request');
  if (!origin) return true; // API clients still require a session + CSRF or admin token.
  const expected = config.publicOrigin || `${config.production ? 'https' : 'http'}://${req.headers.host}`;
  return origin === expected || reject(res, 403, 'origin_not_allowed');
}
function headers(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Existing UI uses inline event handlers/style. Do not claim a strict script CSP.
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' https:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if (config.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
function readJson(req, max = 16384) {
  return new Promise((resolve, rejectPromise) => {
    if (req.headers?.['content-type'] && !req.headers['content-type'].startsWith('application/json')) {
      return rejectPromise(Object.assign(new Error('json_required'), { status: 415 }));
    }
    let size = 0, chunks = [], finished = false;
    const fail = (error) => { if (!finished) { finished = true; rejectPromise(error); } };
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > max) { chunks = []; fail(Object.assign(new Error('body_too_large'), { status: 413 })); return; }
      if (!finished) chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      if (finished) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
        finished = true; resolve(value);
      } catch { fail(Object.assign(new Error('invalid_json'), { status: 400 })); }
    });
    req.on('aborted', () => fail(Object.assign(new Error('request_aborted'), { status: 400 })));
    req.on('error', fail);
  });
}
module.exports = { reject, equal, isAdmin, clientIp, rateLimit, sameOrigin, headers, readJson };
