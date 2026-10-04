'use strict';

// JSON API.
//
//   GET  /api/health
//   GET  /api/providers
//   GET  /api/sources
//   GET  /api/search?q=&type=&page=&pageSize=
//   GET  /api/artists/:id
//   GET  /api/albums/:id
//   GET  /api/tracks/:id
//   GET  /api/releases?from=&to=&limit=
//   GET  /api/charts?genre=&sort=&limit=
//   GET  /api/sync/jobs
//   POST /api/sync/search            { q }
//   POST /api/sync/album/:id
//   POST /api/sync/artist/:id
//   POST /api/sync/releases
//   POST /api/sync/charts
//
// Images are always exposed through /media/... so the browser never hotlinks a
// third-party host.

const repo = require('./repo');
const providers = require('./providers');
const search = require('./search');
const sync = require('./sync');
const config = require('./config');
const log = require('./util/logger')('api');

const mediaUrl = (kind, id) => `/media/${kind}/${encodeURIComponent(id)}`;

const serializeArtist = (artist, extra = {}) => ({
  id: artist.id,
  name: artist.name,
  genre: artist.genre || '',
  region: artist.region || '',
  bio: artist.bio || '',
  avatarUrl: mediaUrl('avatar', artist.id),
  heroUrl: mediaUrl('hero', artist.id),
  avatarSource: artist.avatarSource || (artist.avatarUrl ? 'provider' : 'derived'),
  externalUrl: artist.externalUrl || null,
  provider: artist.provider,
  providerId: artist.providerId,
  popularity: artist.popularity ?? null,
  syncedAt: artist.syncedAt || null,
  syncStatus: artist.syncStatus || 'ok',
  ...extra
});

const serializeAlbum = (album, extra = {}) => ({
  id: album.id,
  kind: album.kind || 'album',
  title: album.title,
  artist: album.artistDisplay || album.primaryArtistName || '',
  artistId: album.primaryArtistId || null,
  region: album.primaryArtistRegion || '',
  coverUrl: mediaUrl('cover', album.id),
  coverSourceUrl: album.coverUrl || null,
  releaseDate: album.releaseDate || null,
  year: album.releaseDate ? String(album.releaseDate).slice(0, 4) : '',
  genre: album.genre || '',
  trackCount: album.trackCount ?? null,
  score: album.score ?? null,
  popularity: album.popularity ?? null,
  searchHeat: album.popularity ?? null,
  comments: album.comments ?? 0,
  desc: album.description || '',
  externalUrl: album.externalUrl || null,
  provider: album.provider,
  syncedAt: album.syncedAt || null,
  ...extra
});

const serializeTrack = (track, extra = {}) => ({
  id: track.id,
  kind: 'single',
  title: track.title,
  artist: track.artistDisplay || track.primaryArtistName || '',
  artistId: track.primaryArtistId || (track.artists && track.artists[0] && track.artists[0].id) || null,
  albumId: track.albumId || null,
  albumTitle: track.album ? track.album.title : track.albumTitle || '',
  coverUrl: track.albumId ? mediaUrl('cover', track.albumId) : null,
  trackNumber: track.trackNumber ?? null,
  durationMs: track.durationMs ?? null,
  previewUrl: track.previewUrl || null,
  releaseDate: track.releaseDate || null,
  year: track.releaseDate ? String(track.releaseDate).slice(0, 4) : '',
  genre: track.genre || '',
  provider: track.provider,
  syncedAt: track.syncedAt || null,
  ...extra
});

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

const json = (res, data, status = 200) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
};

const fail = (res, status, code, message) => json(res, { error: code, message: message || code }, status);

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });

const clampInt = (value, fallback, min, max) => {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSearch(url, res) {
  const query = (url.searchParams.get('q') || '').trim();
  const type = url.searchParams.get('type') || 'all';
  const page = clampInt(url.searchParams.get('page'), 1, 1, 50);
  const pageSize = clampInt(url.searchParams.get('pageSize'), 20, 1, 50);
  const force = url.searchParams.get('refresh') === '1';

  const result = await search.search(query, { page, pageSize, forceRemote: force });
  const payload = {
    query: result.query,
    page: result.page,
    pageSize: result.pageSize,
    cached: result.cached,
    providers: result.providers,
    counts: result.counts,
    error: result.error || null,
    results: {
      artists: type === 'all' || type === 'artist' ? result.artists.map((a) => serializeArtist(a)) : [],
      albums: type === 'all' || type === 'album' ? result.albums.map((a) => serializeAlbum(a)) : [],
      tracks: type === 'all' || type === 'track' ? result.tracks.map((t) => serializeTrack(t)) : []
    }
  };
  json(res, payload);
}

async function handleArtist(id, res, { refresh = false } = {}) {
  let bundle = repo.getArtistBundle(id);
  if (!bundle) return fail(res, 404, 'artist_not_found', `No artist with id ${id}`);

  const needsWorks = !bundle.albums.length && !bundle.tracks.length;
  if ((refresh || needsWorks) && providers.isAvailable(providers.get(bundle.artist.provider) || { name: '' })) {
    try {
      await sync.syncArtistProfile(id);
      bundle = repo.getArtistBundle(id) || bundle;
    } catch (error) {
      log.warn(`on-demand artist sync failed for ${id}: ${error.message}`);
    }
  }

  json(res, {
    artist: serializeArtist(bundle.artist, {
      albumsCount: bundle.albums.length,
      tracksCount: bundle.tracks.length
    }),
    albums: bundle.albums.map((album) => serializeAlbum(album)),
    tracks: bundle.tracks.map((track) => serializeTrack(track, { artists: undefined })),
    error: null
  });
}

async function handleAlbum(id, res, { refresh = false } = {}) {
  let bundle = repo.getAlbumBundle(id);
  if (!bundle) return fail(res, 404, 'album_not_found', `No album with id ${id}`);

  if ((refresh || !bundle.tracks.length) && bundle.album.syncStatus !== 'error') {
    try {
      await sync.syncAlbum(id);
      bundle = repo.getAlbumBundle(id) || bundle;
    } catch (error) {
      log.warn(`on-demand album sync failed for ${id}: ${error.message}`);
    }
  }

  json(res, {
    album: serializeAlbum(bundle.album, { trackCount: bundle.tracks.length || bundle.album.trackCount }),
    artists: bundle.artists.map((artist) =>
      serializeArtist(repo.getArtistRow(artist.id) || { id: artist.id, name: artist.name, provider: 'unknown' })
    ),
    tracks: bundle.tracks.map((track) =>
      serializeTrack(track, { artists: track.artists, artistId: track.artists[0] && track.artists[0].id })
    ),
    error: null
  });
}

async function handleTrack(id, res, { refresh = false } = {}) {
  let bundle = repo.getTrackBundle(id);
  if (!bundle) return fail(res, 404, 'track_not_found', `No track with id ${id}`);
  json(res, {
    track: serializeTrack(bundle.track, { artists: bundle.artists }),
    artists: bundle.artists.map((artist) =>
      serializeArtist(repo.getArtistRow(artist.id) || { id: artist.id, name: artist.name, provider: 'unknown' })
    ),
    album: bundle.album ? serializeAlbum(bundle.album) : null,
    error: null
  });
}

const handleReleases = (url, res) =>
  json(res, {
    from: url.searchParams.get('from') || null,
    to: url.searchParams.get('to') || null,
    items: repo
      .listReleases({
        from: url.searchParams.get('from') || null,
        to: url.searchParams.get('to') || null,
        limit: clampInt(url.searchParams.get('limit'), 30, 1, 100)
      })
      .map((album) => serializeAlbum(album)),
    error: null
  });

const handleCharts = (url, res) =>
  json(res, {
    genre: url.searchParams.get('genre') || 'all',
    sort: url.searchParams.get('sort') || 'popularity',
    items: repo
      .listCharts({
        genre: (url.searchParams.get('genre') || 'all').toLowerCase(),
        sort: url.searchParams.get('sort') || 'popularity',
        limit: clampInt(url.searchParams.get('limit'), 50, 1, 100)
      })
      .map((album) => serializeAlbum(album)),
    error: null
  });

const handleHealth = (res) =>
  json(res, {
    ok: true,
    version: require('../package.json').version,
    now: new Date().toISOString(),
    storage: { driver: 'node:sqlite', path: config.dbPath },
    stats: repo.stats(),
    providers: providers.describeProviders()
  });

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const matchId = (pathname, prefix) => {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  if (!rest || rest.includes('/')) return null;
  return decodeURIComponent(rest);
};

async function handleApi(req, res, url) {
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method || 'GET';

  if (pathname === '/api/health') {
    handleHealth(res);
    return true;
  }
  if (pathname === '/api/providers') {
    json(res, { providers: providers.describeProviders(), available: providers.availableProviders() });
    return true;
  }
  if (pathname === '/api/sources') {
    json(res, { sources: repo.listSources() });
    return true;
  }

  const artistId = matchId(pathname, '/api/artists/');
  const albumId = matchId(pathname, '/api/albums/');
  const trackId = matchId(pathname, '/api/tracks/');

  if (pathname === '/api/search') { await handleSearch(url, res); return true; }
  if (artistId && method === 'GET') { await handleArtist(artistId, res); return true; }
  if (albumId && method === 'GET') { await handleAlbum(albumId, res); return true; }
  if (trackId && method === 'GET') { await handleTrack(trackId, res); return true; }
  if (pathname === '/api/releases') { handleReleases(url, res); return true; }
  if (pathname === '/api/charts') { handleCharts(url, res); return true; }
  if (pathname === '/api/sync/jobs') {
    json(res, { jobs: repo.listJobs(clampInt(url.searchParams.get('limit'), 50, 1, 200)) });
    return true;
  }

  // POST /api/sync/*
  if (method === 'POST' || method === 'GET') {
    if (pathname === '/api/sync/search') {
      const body = method === 'POST' ? await readBody(req) : {};
      const query = (body.q || url.searchParams.get('q') || '').trim();
      if (!query) { fail(res, 400, 'missing_query', 'q is required'); return true; }
      const result = await sync.syncSearch(query);
      json(res, { ok: true, ...result });
      return true;
    }
    if (pathname === '/api/sync/releases') {
      const result = await sync.syncReleases();
      json(res, { ok: true, ...result });
      return true;
    }
    if (pathname === '/api/sync/charts') {
      const result = await sync.syncCharts({ country: url.searchParams.get('country') || 'us' });
      json(res, { ok: true, ...result });
      return true;
    }
    const syncAlbumId = matchId(pathname, '/api/sync/album/');
    if (syncAlbumId) {
      const result = await sync.syncAlbum(syncAlbumId);
      json(res, { ok: true, ...result });
      return true;
    }
    const syncArtistId = matchId(pathname, '/api/sync/artist/');
    if (syncArtistId) {
      const result = await sync.syncArtistProfile(syncArtistId);
      json(res, { ok: true, ...result });
      return true;
    }
  }

  if (pathname.startsWith('/api/')) {
    fail(res, 404, 'not_found', `No route for ${pathname}`);
    return true;
  }
  return false;
}

module.exports = { handleApi, json, serializeArtist, serializeAlbum, serializeTrack };
