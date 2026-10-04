'use strict';

// Sync engine.
//
// Three recurring sources plus on-demand jobs:
//   releases       — daily: scan seed artists for recently released albums
//   charts         — weekly: Apple Marketing RSS top albums (real chart ranks)
//   artist-refresh — daily: refresh stale artist profiles + related works
//   artist / album / search — on demand from the API
// Failed jobs are retried with exponential backoff and recorded in sync_jobs.

const config = require('./config');
const repo = require('./repo');
const providers = require('./providers');
const media = require('./media');
const search = require('./search');
const N = require('./normalize');
const { fetchJson } = require('./util/http');
const log = require('./util/logger')('sync');
const itunes = require('./providers/itunes');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const isRealProviderId = (value) => value && !String(value).startsWith('name:') && !String(value).startsWith('title:');

// ---------------------------------------------------------------------------
// Background cover warming (fire-and-forget, bounded queue)
// ---------------------------------------------------------------------------

const warmQueue = [];
let warming = false;

function precache(url) {
  if (!url || warmQueue.length >= 300) return;
  if (!warmQueue.includes(url)) warmQueue.push(url);
}

async function drainWarmQueue() {
  if (warming) return;
  warming = true;
  try {
    while (warmQueue.length) {
      const url = warmQueue.shift();
      try {
        await media.ensureCached(url);
      } catch {
        /* failures are recorded by media.ensureCached */
      }
    }
  } finally {
    warming = false;
  }
}

// ---------------------------------------------------------------------------
// Job creators
// ---------------------------------------------------------------------------

const nextDailyAt = (hour) => {
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= Date.now()) next.setTime(next.getTime() + DAY);
  return next.getTime();
};

const enqueueJob = (options) => repo.enqueueJob(options);

function scheduleRecurring(type, intervalMs, { bootstrapDelayMs = 2000, maxAttempts = 5 } = {}) {
  const jobs = repo.listJobs(200).filter((job) => job.type === type);
  if (jobs.some((job) => job.status === 'pending' || job.status === 'running')) return;
  const lastDone = jobs
    .filter((job) => job.status === 'done' && job.finishedAt)
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))[0];
  const lastAt = lastDone ? Date.parse(lastDone.finishedAt) : 0;
  const runAt = Math.max(Date.now() + bootstrapDelayMs, lastAt + intervalMs);
  enqueueJob({ type, runAt, maxAttempts });
  log.info(`scheduled ${type} at ${new Date(runAt).toISOString()}`);
}

function registerSources() {
  for (const provider of providers.ALL) repo.setSource(provider);
}

// ---------------------------------------------------------------------------
// Sync operations
// ---------------------------------------------------------------------------

async function syncCharts({ country = 'us' } = {}) {
  const url = `https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/100/albums.json`;
  const feed = await fetchJson(url, { attempts: 2 });
  const results = (feed.feed && feed.feed.results) || [];
  const total = results.length || 1;
  let persisted = 0;

  for (let index = 0; index < results.length; index += 1) {
    const item = results[index];
    if (!item.id) continue;
    const popularity = Math.round(((total - index) / total) * 1000) / 10;
    const album = {
      provider: 'itunes',
      providerId: String(item.id),
      title: item.name,
      artistDisplay: item.artistName,
      artistRefs: item.artistId
        ? [N.normalizeArtistRef('itunes', item.artistId, item.artistName)]
        : [],
      kind: N.kindForAlbum(null, item.name),
      coverUrl: itunes.artworkAt(item.artworkUrl100, 900),
      releaseDate: item.releaseDate || null,
      genre: item.genres && item.genres[0] ? item.genres[0].name : null,
      trackCount: null,
      popularity,
      chartSource: `apple-rss:${country}`,
      externalUrl: item.url || null,
      description: null
    };
    try {
      repo.persistAlbum(album, []);
      precache(album.coverUrl);
      persisted += 1;
    } catch (error) {
      log.warn(`chart album persist failed: ${error.message}`);
    }
  }
  drainWarmQueue();
  return { country, fetched: results.length, persisted };
}

async function syncReleases({ windowDays = 90, perSeed = 20 } = {}) {
  const primary = providers.get('itunes');
  const cutoff = new Date(Date.now() - windowDays * DAY).toISOString().slice(0, 10);
  let artists = 0;
  let albums = 0;
  let fresh = 0;

  for (const seed of config.seedArtists) {
    try {
      const remote = await primary.search(seed, { limit: perSeed });
      for (const artist of remote.artists || []) {
        repo.persistArtist(artist);
        artists += 1;
      }
      for (const album of remote.albums || []) {
        repo.persistAlbum(album, []);
        precache(album.coverUrl);
        albums += 1;
        if (album.releaseDate && album.releaseDate >= cutoff) fresh += 1;
      }
      const head = (remote.artists || [])[0];
      if (head && isRealProviderId(head.providerId)) {
        enqueueJob({ type: 'artist', target: head.id, priority: 1 });
      }
    } catch (error) {
      log.warn(`release scan failed for "${seed}": ${error.message}`);
      providers.recordFailure(primary.name, error);
    }
  }
  drainWarmQueue();
  return { cutoff, artists, albums, fresh };
}

async function syncArtistProfile(artistId) {
  const row = repo.getArtistRow(artistId);
  if (!row) return { skipped: 'artist_not_found' };
  const provider = providers.get(row.provider);
  if (!provider) throw new Error(`provider_missing:${row.provider}`);

  let refreshed = false;
  if (typeof provider.getArtist === 'function' && isRealProviderId(row.providerId)) {
    const artist = await provider.getArtist(row.providerId);
    if (artist) {
      repo.persistArtist({ ...artist, id: row.id });
      refreshed = true;
    }
  }

  if (typeof provider.getArtistAlbums === 'function' && isRealProviderId(row.providerId)) {
    const albums = await provider.getArtistAlbums(row.providerId, { limit: 100 });
    for (const album of albums) {
      repo.persistAlbum(album, []);
      precache(album.coverUrl);
    }
  }

  if (typeof provider.getArtistTracks === 'function' && isRealProviderId(row.providerId)) {
    const tracks = await provider.getArtistTracks(row.providerId, { limit: 50 });
    for (const track of tracks) repo.upsertTrack(track);
  }

  drainWarmQueue();
  return { artistId, refreshed };
}

async function syncAlbum(albumId) {
  const row = repo.getAlbumRow(albumId);
  if (!row) return { skipped: 'album_not_found' };
  const provider = providers.get(row.provider);
  if (!provider || typeof provider.getAlbum !== 'function' || !isRealProviderId(row.providerId)) {
    return { skipped: 'provider_unsupported' };
  }
  const { album, tracks } = await provider.getAlbum(row.providerId);
  if (album) {
    repo.persistAlbum({ ...album, id: row.id }, tracks || []);
    precache(album.coverUrl || row.coverUrl);
  }
  drainWarmQueue();
  return { albumId, tracks: (tracks || []).length };
}

async function syncSearch(query) {
  const remote = await providers.search(query, { limit: 40 });
  search.persistResults(remote);
  for (const album of remote.albums || []) precache(album.coverUrl);
  drainWarmQueue();
  return {
    query,
    artists: (remote.artists || []).length,
    albums: (remote.albums || []).length,
    tracks: (remote.tracks || []).length,
    providers: remote.providers || []
  };
}

async function refreshStaleArtists({ ageDays = 7, limit = 25 } = {}) {
  const since = new Date(Date.now() - ageDays * DAY).toISOString();
  const stale = repo.staleArtists(since, limit);
  let queued = 0;
  for (const artist of stale) {
    if (!isRealProviderId(artist.providerId)) continue;
    enqueueJob({ type: 'artist', target: artist.id });
    queued += 1;
  }
  return { scanned: stale.length, queued };
}

// ---------------------------------------------------------------------------
// Job execution
// ---------------------------------------------------------------------------

async function runJob(job) {
  const payload = job.payload ? JSON.parse(job.payload) || {} : {};
  switch (job.type) {
    case 'releases':
      return syncReleases(payload);
    case 'charts':
      return syncCharts(payload);
    case 'artist':
      return syncArtistProfile(job.target);
    case 'album':
      return syncAlbum(job.target);
    case 'search':
      return syncSearch(job.target);
    case 'artist-refresh':
      return refreshStaleArtists(payload);
    default:
      throw new Error(`unknown_job_type:${job.type}`);
  }
}

async function afterJob(job) {
  if (job.type === 'releases') scheduleRecurring('releases', DAY, { bootstrapDelayMs: nextDailyAt(config.dailySyncHour) - Date.now() });
  if (job.type === 'charts') scheduleRecurring('charts', 7 * DAY, { bootstrapDelayMs: 7 * DAY });
}

async function executeJob(job) {
  const attempts = job.attempts + 1;
  try {
    const result = await runJob(job);
    repo.completeJob(job.id);
    log.info(`job ${job.type}${job.target ? `:${job.target}` : ''} ok`, JSON.stringify(result).slice(0, 200));
    await afterJob(job);
    return result;
  } catch (error) {
    const willRetry = repo.failJob(job.id, error.message, { attempts, maxAttempts: job.maxAttempts });
    log.warn(`job ${job.type}${job.target ? `:${job.target}` : ''} failed (attempt ${attempts}/${job.maxAttempts}): ${error.message}${willRetry ? ' — retrying' : ''}`);
    return { error: error.message, willRetry };
  }
}

let processing = false;

async function processDueJobs(limit = 5) {
  if (processing) return { skipped: 'busy' };
  processing = true;
  const results = [];
  try {
    const jobs = repo.dueJobs(limit);
    for (const job of jobs) {
      const claim = repo.claimJob(job.id);
      if (!claim || !claim.changes) continue;
      results.push(await executeJob(job));
    }
  } finally {
    processing = false;
  }
  return { processed: results.length };
}

// ---------------------------------------------------------------------------
// Bootstrap + one-shot
// ---------------------------------------------------------------------------

function bootstrapSchedule() {
  scheduleRecurring('releases', DAY, { bootstrapDelayMs: Math.max(1500, nextDailyAt(config.dailySyncHour) - Date.now()) });
  scheduleRecurring('charts', 7 * DAY, { bootstrapDelayMs: 1500 });
  scheduleRecurring('artist-refresh', DAY, { bootstrapDelayMs: 20 * 1000 });
}

async function syncOnce({ withCharts = true } = {}) {
  registerSources();
  const out = {};
  if (withCharts) out.charts = await syncCharts();
  out.releases = await syncReleases();
  await processDueJobs(10);
  return out;
}

module.exports = {
  registerSources,
  scheduleRecurring,
  bootstrapSchedule,
  processDueJobs,
  runJob,
  executeJob,
  syncCharts,
  syncReleases,
  syncArtistProfile,
  syncAlbum,
  syncSearch,
  refreshStaleArtists,
  precache,
  drainWarmQueue,
  syncOnce,
  enqueueJob
};