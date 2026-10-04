'use strict';

// Provider registry.
//
// Contract every provider implements (subset is fine):
//   search(query, opts) -> { artists[], albums[], tracks[] }
//   getArtist(id), getAlbum(id), getTrack(id)
//   getArtistAlbums(id), getArtistTracks(id)
//
// Results from all healthy providers are merged into one priority-ordered list
// so a page can show a single, de-duplicated catalog regardless of source.

const config = require('../config');
const log = require('../util/logger')('providers');
const itunes = require('./itunes');
const deezer = require('./deezer');
const musicbrainz = require('./musicbrainz');
const lastfm = require('./lastfm');

const ALL = [itunes, deezer, musicbrainz, lastfm];

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 10 * 60 * 1000;

const health = new Map();
const stateOf = (name) => {
  if (!health.has(name)) health.set(name, { failures: 0, cooldownUntil: 0, lastError: null, lastOkAt: 0 });
  return health.get(name);
};

const isConfigured = (provider) => {
  if (config.disabledProviders.includes(provider.name)) return false;
  if (provider.enabled === false) return false;
  if (provider.requiresKey && !(provider.name === 'lastfm' ? config.lastfmApiKey : true)) return false;
  return true;
};

const isAvailable = (provider) => {
  if (!isConfigured(provider)) return false;
  return Date.now() >= stateOf(provider.name).cooldownUntil;
};

const recordSuccess = (name) => {
  const state = stateOf(name);
  state.failures = 0;
  state.cooldownUntil = 0;
  state.lastError = null;
  state.lastOkAt = Date.now();
};

const recordFailure = (name, error) => {
  const state = stateOf(name);
  state.failures += 1;
  state.lastError = error?.message || String(error);
  if (state.failures >= FAILURE_THRESHOLD) {
    state.cooldownUntil = Date.now() + COOLDOWN_MS;
    log.warn(`${name} cooling down for ${COOLDOWN_MS / 60000}min after ${state.failures} failures`);
  }
};

const get = (name) => ALL.find((provider) => provider.name === name) || null;

const availableProviders = () => ALL.filter(isAvailable).map((provider) => provider.name);

const describeProviders = () =>
  ALL.map((provider) => {
    const state = stateOf(provider.name);
    return {
      name: provider.name,
      label: provider.label,
      homepage: provider.homepage,
      license: provider.license,
      requiresKey: Boolean(provider.requiresKey),
      configured: isConfigured(provider),
      available: isAvailable(provider),
      failures: state.failures,
      cooldownUntil: state.cooldownUntil ? new Date(state.cooldownUntil).toISOString() : null,
      lastError: state.lastError,
      lastOkAt: state.lastOkAt ? new Date(state.lastOkAt).toISOString() : null
    };
  });

const nameKey = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Priority-ordered merge: first provider wins, later ones only fill gaps.
const mergeBy = (orderedLists, keyOf, richFields) => {
  const map = new Map();
  for (const list of orderedLists) {
    for (const item of list || []) {
      const key = keyOf(item);
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...item });
        continue;
      }
      for (const field of richFields) {
        if ((existing[field] === undefined || existing[field] === null || existing[field] === '') && item[field]) {
          existing[field] = item[field];
        }
      }
    }
  }
  return [...map.values()];
};

const artistKey = (artist) => nameKey(artist.name);
const albumKey = (album) => `${nameKey(album.title)}|${nameKey(album.artistDisplay)}`;
const trackKey = (track) => `${nameKey(track.title)}|${nameKey(track.artistDisplay)}`;

const DEFAULT_DEADLINE_MS = 7000;

// Bounds how long a single provider may block a request. A slow or blocked
// provider is abandoned (and eventually cooled down) instead of stalling the
// whole search.
function withDeadline(promise, ms, label) {
  promise.catch(() => {});
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function callProvider(provider, method, args, fallback) {
  if (typeof provider[method] !== 'function') return { ok: false, result: fallback };
  const deadline = provider.deadlineMs || DEFAULT_DEADLINE_MS;
  try {
    const result = await withDeadline(
      Promise.resolve().then(() => provider[method](...args)),
      deadline,
      `${provider.name}_deadline`
    );
    recordSuccess(provider.name);
    return { ok: true, result };
  } catch (error) {
    recordFailure(provider.name, error);
    log.warn(`${provider.name}.${method} failed: ${error.message}`);
    return { ok: false, result: fallback };
  }
}

async function search(query, { limit = 40 } = {}) {
  const active = ALL.filter((provider) => isAvailable(provider) && typeof provider.search === 'function');
  const settled = await Promise.all(
    active.map(async (provider) => {
      const outcome = await callProvider(provider, 'search', [query, { limit }], null);
      return { provider: provider.name, result: outcome.result, ok: outcome.ok };
    })
  );

  const byProvider = new Map(settled.map((entry) => [entry.provider, entry.result]));
  const hasPrimary = ['itunes', 'deezer'].some(
    (name) => (byProvider.get(name)?.artists?.length || 0) + (byProvider.get(name)?.albums?.length || 0) > 0
  );

  const ordered = ['itunes', 'deezer', 'musicbrainz']
    .filter((name) => byProvider.get(name))
    .map((name) => byProvider.get(name));

  let artists = mergeBy(ordered.map((group) => group.artists), artistKey, [
    'avatarUrl', 'avatarSource', 'heroUrl', 'genre', 'region', 'bio', 'popularity'
  ]);
  let albums = mergeBy(ordered.map((group) => group.albums), albumKey, [
    'coverUrl', 'genre', 'releaseDate', 'trackCount', 'popularity', 'description', 'externalUrl'
  ]);
  let tracks = mergeBy(ordered.map((group) => group.tracks), trackKey, [
    'previewUrl', 'releaseDate', 'durationMs', 'genre', 'popularity'
  ]);

  // MusicBrainz has no artwork and would create duplicate entries; keep it as an
  // enrichment source and only let it stand alone when nothing else answered.
  if (hasPrimary) {
    artists = artists.filter((item) => item.provider !== 'musicbrainz');
    albums = albums.filter((item) => item.provider !== 'musicbrainz');
    tracks = tracks.filter((item) => item.provider !== 'musicbrainz');
  }

  return {
    artists,
    albums,
    tracks,
    providers: settled.filter((entry) => entry.ok).map((entry) => entry.provider),
    providerErrors: settled.filter((entry) => !entry.ok).map((entry) => entry.provider),
    usedFallbackOnly: !hasPrimary
  };
}

module.exports = {
  ALL,
  get,
  search,
  availableProviders,
  describeProviders,
  isAvailable,
  recordSuccess,
  recordFailure
};