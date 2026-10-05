'use strict';

// Central runtime configuration. Everything is env-overridable so the same
// build runs locally (SQLite file) and in production.

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

// Taxonomy agent wiring. Resolved before the export so agentUrl and agentModel
// can depend on whether a key exists.
//   DEEPSEEK_API_KEY          ->  https://api.deepseek.com/chat/completions
//   HIPKOP_AGENT_URL          ->  any OpenAI-compatible /chat/completions
//   HIPKOP_AGENT_KEY          ->  overrides DEEPSEEK_API_KEY when both are set
const agentKey = env.HIPKOP_AGENT_KEY || env.DEEPSEEK_API_KEY || '';
const agentUrl = env.HIPKOP_AGENT_URL || (agentKey ? 'https://api.deepseek.com/chat/completions' : '');
const agentModel =
  env.HIPKOP_AGENT_MODEL || (/deepseek\.com/i.test(agentUrl) ? 'deepseek-chat' : '');

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
  // Apple Marketing RSS is per-storefront: 'us' carries most HipHop releases
  // while 'kr' / 'jp' carry the K-POP catalogue. Merging a few storefronts is
  // what gives every chart row a real rank instead of a null popularity.
  chartStorefronts: list(env.HIPKOP_CHART_STOREFRONTS, 'us,kr,jp'),
  seedArtists: list(
    env.HIPKOP_SEED_ARTISTS,
    'aespa,BLACKPINK,G-DRAGON,法老,PACT,A$AP Rocky,Higher Brothers,Red Velvet,连麻,Kendrick Lamar,Travis Scott,NewJeans'
  ),

  // Cross-genre taxonomy. "Scene" cannot be derived from metadata alone, so it is
  // curated (and env-extendable): this is what separates mainstream rap from the
  // underground corner of the same genre.
  mainstreamArtists: list(
    env.HIPKOP_MAINSTREAM_ARTISTS,
    'Drake,Travis Scott,Kendrick Lamar,A$AP Rocky,Kanye West,J. Cole,Nicki Minaj,21 Savage,Future,' +
      'Metro Boomin,Playboi Carti,Post Malone,Doja Cat,Tyler, The Creator,Higher Brothers,GAI,' +
      'aespa,BLACKPINK,NewJeans,G-DRAGON,Red Velvet,TWICE,IVE,LE SSERAFIM,(G)I-DLE,Stray Kids,SEVENTEEN,ITZY'
  ),
  undergroundArtists: list(
    env.HIPKOP_UNDERGROUND_ARTISTS,
    '法老,派克特,PACT,连麻,连麻Swimming,SASIOVERLXRD,JinJiBeWater,隼,RICHNOMADIC,艾志恒,Asen,谢帝,' +
      '刀脚,马思唯,KnowKnow,Melo,Psy.P,Buzzy,3Bangz,鱼头,Kafe.Hu,小老虎,龙胆紫,阴三儿,贝贝,' +
      '顽童MJ116,蛋堡,ØZI,李尔新,AnsrJ,OneOne,雾都'
  ),

  // Taxonomy agent. Without a key it stays on the deterministic offline
  // heuristic; with one it upgrades low-confidence artists through an
  // OpenAI-compatible endpoint. DeepSeek is the default target, so setting
  // DEEPSEEK_API_KEY alone is enough to turn the model backend on.
  agentUrl,
  agentKey,
  agentModel,
  agentJsonMode: bool(env.HIPKOP_AGENT_JSON_MODE, true),
  agentTimeoutMs: Number(env.HIPKOP_AGENT_TIMEOUT_MS || 30000),
  agentMinConfidence: Number(env.HIPKOP_AGENT_MIN_CONFIDENCE || 0.7),
  agentBatchSize: Number(env.HIPKOP_AGENT_BATCH || 50),

  // Caching
  cacheTtlMs: Number(env.HIPKOP_CACHE_TTL_HOURS || 24) * 3600 * 1000,
  mediaMaxBytes: Number(env.HIPKOP_MEDIA_MAX_BYTES || 8 * 1024 * 1024),
  mediaRetryAttempts: Number(env.HIPKOP_MEDIA_ATTEMPTS || 3)
};