'use strict';

// Central runtime configuration. Everything is env-overridable so the same
// build runs locally (SQLite file) and in production (SQLite file on a volume
// or PostgreSQL via HIPKOP_DB_URL once a driver is provided).

const path = require('path');

const root = path.join(__dirname, '..');
const env = process.env;

const bool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

const list = (value, fallback) => {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  return String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

module.exports = {
  root,
  port: Number(env.HIPKOP_PLAYER_PORT || 4180),
  host: env.HIPKOP_PLAYER_HOST || '127.0.0.1',
  publicDir: path.join(root, 'public'),
  dbPath: env.HIPKOP_DB_PATH || path.join(root, 'data', 'hipkop.sqlite'),
  dbUrl: env.HIPKOP_DB_URL || '',
  mediaDir: env.HIPKOP_MEDIA_DIR || path.join(root, 'data', 'media'),

  // Networking
  httpTimeoutMs: Number(env.HIPKOP_HTTP_TIMEOUT || 9000),
  httpAttempts: Number(env.HIPKOP_HTTP_ATTEMPTS || 3),

  // Providers
  itunesCountries: list(env.ITUNES_COUNTRIES, 'US,KR,CN'),
  disabledProviders: list(env.HIPKOP_DISABLED_PROVIDERS, ''),
  lastfmApiKey: env.LASTFM_API_KEY || '',
  musicbrainzUserAgent:
    env.MUSICBRAINZ_USER_AGENT ||
    'HIPKOP-PLAYER/1.0 ( https://github.com/hipkop-player )',

  // Scheduler / sync
  schedulerEnabled: bool(env.HIPKOP_SCHEDULER, true),
  dailySyncHour: Math.min(23, Math.max(0, Number(env.HIPKOP_DAILY_SYNC_HOUR || 4))),
  chartGenres: list(env.HIPKOP_CHART_GENRES, 'rap,kpop'),
  seedArtists: list(
    env.HIPKOP_SEED_ARTISTS,
    'aespa,BLACKPINK,G-DRAGON,法老,PACT,A$AP Rocky,Higher Brothers,Red Velvet,连麻,Kendrick Lamar,Travis Scott,NewJeans'
  ),

  // Caching
  cacheTtlMs: Number(env.HIPKOP_CACHE_TTL_HOURS || 24) * 3600 * 1000,
  mediaMaxBytes: Number(env.HIPKOP_MEDIA_MAX_BYTES || 8 * 1024 * 1024),
  mediaRetryAttempts: Number(env.HIPKOP_MEDIA_ATTEMPTS || 3)
};