'use strict';

// Sync engine.
//
// Three recurring sources plus on-demand jobs:
//   releases       — daily: scan seed artists for recently released albums
//   charts         — weekly: Apple Marketing RSS top albums (real chart ranks)
//   artist-refresh — daily: refresh stale artist profiles + related works
//   taxonomy       — daily: classify unlabelled artists (HipHop / K-POP / other)
//   artist / album / search — on demand from the API
// Failed jobs are retried with exponential backoff and recorded in sync_jobs.

const config = require('./config');
const repo = require('./repo');
const providers = require('./providers');
const media = require('./media');
const search = require('./search');
const { calibrate } = require('./calibrate');
const { runTaxonomyAgent } = require('./agents/taxonomy');
const N = require('./normalize');
const { fetchJson } = require('./util/http');
const log = require('./util/logger')('sync');
const itunes = require('./providers/itunes');

// Reconciliation is cheap relative to a sync and keeps the catalog honest.
function runCalibration() {
  try {
    const report = calibrate();
    log.info(
      `calibration: merged ${report.mergedArtists} artist(s) / ${report.mergedAlbums} album(s), ` +
        `${report.artwork} artwork, ${report.coverJobs} cover job(s)`
    );
    return report;
  } catch (error) {
    log.warn(`calibration failed: ${error.message}`);
    return null;
  }
}

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

// Apple Marketing RSS is published per storefront. A US-only feed leaves most
// K-POP rows without a real rank, so we merge the configured storefronts and
// keep each album's best (highest) rank. One dead storefront never blocks the
// rest of the snapshot.
function chartFeedUrl(country) {
  return `https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/100/albums.json`;
}

function chartEntry(item, index, total, country) {
  const popularity = Math.round(((total - index) / total) * 1000) / 10;
  return {
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
}

// Maps one storefront feed to entries: index 0 is the #1 album, so the top of
// the feed scores 100 and the tail of a 100-row feed scores 1.
function chartEntriesForFeed(storefront, results) {
  const total = results.length || 1;
  return results.filter((item) => item && item.id).map((item, index) => chartEntry(item, index, total, storefront));
}

// Pure merge of several storefront feeds. Duplicates keep the better (higher)
// rank, which is what makes a cross-storefront chart possible.
function mergeChartFeeds(feeds) {
  const merged = new Map();
  for (const feed of feeds || []) {
    for (const entry of chartEntriesForFeed(feed.storefront, feed.results || [])) {
      const seen = merged.get(entry.providerId);
      if (!seen || entry.popularity > seen.popularity) merged.set(entry.providerId, entry);
    }
  }
  return merged;
}

async function syncCharts({ country, countries } = {}) {
  const requested = countries && countries.length ? countries : country ? [country] : config.chartStorefronts;
  const storefronts = requested.map((code) => String(code).trim().toLowerCase()).filter(Boolean);
  const merged = new Map();
  const failed = [];

  for (const storefront of storefronts) {
    try {
      const feed = await fetchJson(chartFeedUrl(storefront), { attempts: 2 });
      const results = (feed.feed && feed.feed.results) || [];
      for (const entry of chartEntriesForFeed(storefront, results)) {
        const seen = merged.get(entry.providerId);
        if (!seen || entry.popularity > seen.popularity) merged.set(entry.providerId, entry);
      }
    } catch (error) {
      failed.push(storefront);
      log.warn(`chart storefront ${storefront} failed: ${error.message}`);
    }
  }

  let persisted = 0;
  for (const album of merged.values()) {
    try {
      repo.persistAlbum(album, []);
      precache(album.coverUrl);
      persisted += 1;
    } catch (error) {
      log.warn(`chart album persist failed: ${error.message}`);
    }
  }
  drainWarmQueue();
  return { storefronts, failed, fetched: merged.size, persisted };
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
    case 'calibrate':
      return runCalibration();
    case 'taxonomy':
      return runTaxonomyAgent(payload);
    default:
      throw new Error(`unknown_job_type:${job.type}`);
  }
}

async function afterJob(job) {
  if (job.type === 'releases') {
    scheduleRecurring('releases', DAY, { bootstrapDelayMs: nextDailyAt(config.dailySyncHour) - Date.now() });
    runCalibration();
  }
  if (job.type === 'charts') {
    scheduleRecurring('charts', 7 * DAY, { bootstrapDelayMs: 7 * DAY });
    runCalibration();
  }
  if (job.type === 'artist-refresh') runCalibration();
  if (job.type === 'calibrate') scheduleRecurring('calibrate', DAY, { bootstrapDelayMs: 12 * HOUR });
  if (job.type === 'taxonomy') scheduleRecurring('taxonomy', DAY, { bootstrapDelayMs: 12 * HOUR });
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
  scheduleRecurring('calibrate', DAY, { bootstrapDelayMs: 40 * 1000 });
  scheduleRecurring('taxonomy', DAY, { bootstrapDelayMs: 60 * 1000 });
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
  runCalibration,
  scheduleRecurring,
  bootstrapSchedule,
  processDueJobs,
  runJob,
  executeJob,
  syncCharts,
  chartFeedUrl,
  chartEntry,
  chartEntriesForFeed,
  mergeChartFeeds,
  syncReleases,
  syncArtistProfile,
  syncAlbum,
  syncSearch,
  refreshStaleArtists,
  runTaxonomyAgent,
  precache,
  drainWarmQueue,
  syncOnce,
  enqueueJob
};