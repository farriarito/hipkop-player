'use strict';

// JSON API.
//
//   GET  /api/health
//   GET  /api/providers            /api/sources
//   GET  /api/search?q=&type=&page=&pageSize=
//   GET  /api/albums?bucket=&scene=&year=&sort=&limit=
//   GET  /api/artists/:id          /api/albums/:id          /api/tracks/:id
//   GET  /api/releases?from=&to=&bucket=&scene=&limit=
//   GET  /api/charts?genre=&scene=&sort=&limit=
//   GET  /api/categories
//   GET  /api/community/posts?topic=&limit=
//   POST /api/community/posts
//   GET  /api/sync/jobs
//   POST /api/sync/search | /api/sync/album/:id | /api/sync/artist/:id
//   POST /api/sync/releases | /api/sync/charts | /api/sync/calibrate
//
// Albums and tracks carry `listen.platforms` (QQ Music / NetEase / Apple Music)
// so the client can jump straight to the full song instead of a 30s preview.
// Images are always exposed through /media/... so the browser never hotlinks a
// third-party host.

const repo = require('./repo');
const providers = require('./providers');
const search = require('./search');
const sync = require('./sync');
const config = require('./config');
const { buildListenLinks } = require('./listen');
const { calibrate } = require('./calibrate');
const log = require('./util/logger')('api');

const mediaUrl = (kind, id) => `/media/${kind}/${encodeURIComponent(id)}`;

const serializeArtist = (artist, extra = {}) => ({
  id: artist.id,
  name: artist.name,
  genre: artist.genre || '',
  genreBucket: artist.genreBucket || null,
  scene: artist.scene || 'unknown',
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

const serializeAlbum = (album, extra = {}) => {
  const payload = {
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
    genreBucket: album.genreBucket || null,
    scene: album.scene || 'unknown',
    trackCount: album.trackCount ?? null,
    score: album.score ?? null,
    popularity: album.popularity ?? null,
    searchHeat: album.popularity ?? null,
    heatSource: album.popularity == null ? null : album.chartSource || 'provider',
    comments: album.comments ?? 0,
    desc: album.description || '',
    externalUrl: album.externalUrl || null,
    provider: album.provider,
    syncedAt: album.syncedAt || null,
    ...extra
  };
  payload.listen = buildListenLinks(album, 'album');
  return payload;
};

const serializeTrack = (track, extra = {}) => {
  const payload = {
    id: track.id,
    kind: 'single',
    title: track.title,
    artist: track.artistDisplay || track.primaryArtistName || '',
    artistId: track.primaryArtistId || (track.artists && track.artists[0] && track.artists[0].id) || null,
    albumId: track.albumId || null,
    albumTitle: (track.album && track.album.title) || track.albumTitle || '',
    coverUrl: track.albumId ? mediaUrl('cover', track.albumId) : null,
    trackNumber: track.trackNumber ?? null,
    durationMs: track.durationMs ?? null,
    previewUrl: track.previewUrl || null,
    releaseDate: track.releaseDate || null,
    year: track.releaseDate ? String(track.releaseDate).slice(0, 4) : '',
    genre: track.genre || '',
    genreBucket: track.genreBucket || null,
    provider: track.provider,
    syncedAt: track.syncedAt || null,
    ...extra
  };
  payload.listen = buildListenLinks({ ...track, albumTitle: payload.albumTitle || (extra && extra.albumTitle) }, 'song');
  return payload;
};

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
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });

const clampInt = (value, fallback, min, max) => {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

const text = (value, max) => {
  const out = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return out.slice(0, max);
};

const COMMUNITY_TOPICS = [
  { key: 'all', label: '全部' },
  { key: 'release', label: '新作' },
  { key: 'recommend', label: '安利' },
  { key: 'performance', label: '演出' },
  { key: 'review', label: '乐评' },
  { key: 'general', label: '闲聊' }
];
const TOPIC_KEYS = new Set(COMMUNITY_TOPICS.map((topic) => topic.key));

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
  json(res, {
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
  });
}

async function handleArtist(id, res) {
  let bundle = repo.getArtistBundle(id);
  if (!bundle) return fail(res, 404, 'artist_not_found', `No artist with id ${id}`);

  // No discography yet: pull the artist's albums (and their real covers) from
  // the provider on first view. Albums already imply we synced before.
  const needsWorks = !bundle.albums.length;
  if (needsWorks && providers.isAvailable(providers.get(bundle.artist.provider) || { name: '' })) {
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
    tracks: bundle.tracks.map((track) => serializeTrack(track)),
    error: null
  });
}

async function handleAlbum(id, res) {
  let bundle = repo.getAlbumBundle(id);
  if (!bundle) return fail(res, 404, 'album_not_found', `No album with id ${id}`);

  if (!bundle.tracks.length && bundle.album.syncStatus !== 'error') {
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
      serializeTrack(track, {
        artists: track.artists,
        artistId: track.artists[0] && track.artists[0].id,
        albumTitle: bundle.album.title
      })
    ),
    error: null
  });
}

async function handleTrack(id, res) {
  const bundle = repo.getTrackBundle(id);
  if (!bundle) return fail(res, 404, 'track_not_found', `No track with id ${id}`);
  json(res, {
    track: serializeTrack(bundle.track, { artists: bundle.artists, album: bundle.album }),
    artists: bundle.artists.map((artist) =>
      serializeArtist(repo.getArtistRow(artist.id) || { id: artist.id, name: artist.name, provider: 'unknown' })
    ),
    album: bundle.album ? serializeAlbum(bundle.album) : null,
    error: null
  });
}

const browseOptions = (url) => ({
  bucket: url.searchParams.get('bucket') || null,
  scene: url.searchParams.get('scene') || null,
  year: url.searchParams.get('year') || null,
  sort: url.searchParams.get('sort') || 'date',
  limit: clampInt(url.searchParams.get('limit'), 40, 1, 100)
});

const handleBrowse = (url, res) => {
  const options = browseOptions(url);
  json(res, { ...options, items: repo.listAlbumsBrowse(options).map((a) => serializeAlbum(a)), error: null });
};

const handleReleases = (url, res) =>
  json(res, {
    from: url.searchParams.get('from') || null,
    to: url.searchParams.get('to') || null,
    items: repo
      .listReleases({
        from: url.searchParams.get('from') || null,
        to: url.searchParams.get('to') || null,
        bucket: url.searchParams.get('bucket') || null,
        scene: url.searchParams.get('scene') || null,
        limit: clampInt(url.searchParams.get('limit'), 30, 1, 100)
      })
      .map((a) => serializeAlbum(a)),
    error: null
  });

const handleCharts = (url, res) =>
  json(res, {
    genre: url.searchParams.get('genre') || 'all',
    scene: url.searchParams.get('scene') || 'all',
    sort: url.searchParams.get('sort') || 'popularity',
    items: repo
      .listCharts({
        genre: (url.searchParams.get('genre') || 'all').toLowerCase(),
        scene: (url.searchParams.get('scene') || 'all').toLowerCase(),
        sort: url.searchParams.get('sort') || 'popularity',
        limit: clampInt(url.searchParams.get('limit'), 50, 1, 100)
      })
      .map((a) => serializeAlbum(a)),
    error: null
  });

const handleCategories = (res) => json(res, { ...repo.categoryCounts(), topics: COMMUNITY_TOPICS, error: null });

const handlePosts = (url, res) => {
  const topic = (url.searchParams.get('topic') || 'all').toLowerCase();
  json(res, {
    topic,
    topics: COMMUNITY_TOPICS,
    items: repo.listPosts({ topic, limit: clampInt(url.searchParams.get('limit'), 30, 1, 100) }),
    error: null
  });
};

async function handleCreatePost(req, res) {
  const body = await readBody(req);
  const topic = TOPIC_KEYS.has(String(body.topic)) && body.topic !== 'all' ? String(body.topic) : 'general';
  const title = text(body.title, 120);
  const content = text(body.body, 2000);
  if (!title || !content) return fail(res, 400, 'invalid_post', 'title and body are required');
  const id = repo.createPost({
    topic,
    title,
    body: content,
    author: text(body.author, 60) || 'HIPKOP 听众',
    albumId: body.albumId || null,
    artistId: body.artistId || null
  });
  json(res, { ok: true, id, post: repo.listPosts({ limit: 1 })[0] || null });
}

const handleCalibrate = (res) => {
  const report = calibrate();
  json(res, { ok: true, report });
};

const handleHealth = (res) =>
  json(res, {
    ok: true,
    version: require('../package.json').version,
    now: new Date().toISOString(),
    storage: { driver: 'node:sqlite', path: config.dbPath },
    stats: repo.stats(),
    consistency: repo.consistencyReport(),
    categories: repo.categoryCounts(),
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

  if (pathname === '/api/health') { handleHealth(res); return true; }
  if (pathname === '/api/providers') {
    json(res, { providers: providers.describeProviders(), available: providers.availableProviders() });
    return true;
  }
  if (pathname === '/api/sources') { json(res, { sources: repo.listSources() }); return true; }
  if (pathname === '/api/categories') { handleCategories(res); return true; }

  const artistId = matchId(pathname, '/api/artists/');
  const albumId = matchId(pathname, '/api/albums/');
  const trackId = matchId(pathname, '/api/tracks/');

  if (pathname === '/api/search') { await handleSearch(url, res); return true; }
  if (pathname === '/api/albums' && method === 'GET') { handleBrowse(url, res); return true; }
  if (artistId && method === 'GET') { await handleArtist(artistId, res); return true; }
  if (albumId && method === 'GET') { await handleAlbum(albumId, res); return true; }
  if (trackId && method === 'GET') { await handleTrack(trackId, res); return true; }
  if (pathname === '/api/releases') { handleReleases(url, res); return true; }
  if (pathname === '/api/charts') { handleCharts(url, res); return true; }
  if (pathname === '/api/community/posts' && method === 'GET') { handlePosts(url, res); return true; }
  if (pathname === '/api/community/posts' && method === 'POST') { await handleCreatePost(req, res); return true; }
  if (pathname === '/api/sync/jobs') {
    json(res, { jobs: repo.listJobs(clampInt(url.searchParams.get('limit'), 50, 1, 200)) });
    return true;
  }

  if (method === 'POST' || method === 'GET') {
    if (pathname === '/api/sync/search') {
      const body = method === 'POST' ? await readBody(req) : {};
      const query = (body.q || url.searchParams.get('q') || '').trim();
      if (!query) { fail(res, 400, 'missing_query', 'q is required'); return true; }
      json(res, { ok: true, ...(await sync.syncSearch(query)) });
      return true;
    }
    if (pathname === '/api/sync/releases') { json(res, { ok: true, ...(await sync.syncReleases()) }); return true; }
    if (pathname === '/api/sync/charts') {
      json(res, { ok: true, ...(await sync.syncCharts({ country: url.searchParams.get('country') || 'us' })) });
      return true;
    }
    if (pathname === '/api/sync/calibrate') { handleCalibrate(res); return true; }
    const syncAlbumId = matchId(pathname, '/api/sync/album/');
    if (syncAlbumId) { json(res, { ok: true, ...(await sync.syncAlbum(syncAlbumId)) }); return true; }
    const syncArtistId = matchId(pathname, '/api/sync/artist/');
    if (syncArtistId) { json(res, { ok: true, ...(await sync.syncArtistProfile(syncArtistId)) }); return true; }
  }

  if (pathname.startsWith('/api/')) {
    fail(res, 404, 'not_found', `No route for ${pathname}`);
    return true;
  }
  return false;
}

module.exports = { handleApi, json, serializeArtist, serializeAlbum, serializeTrack };