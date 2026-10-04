'use strict';

// All database reads/writes for the catalog. The API layer never writes SQL
// directly, which keeps the provider -> normalize -> persist pipeline auditable.

const { run, get, all, transaction, nowIso, json } = require('./db');
const N = require('./normalize');

const n = (value) => (value === undefined ? null : value);

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function setSource(provider) {
  run(
    `INSERT INTO metadata_sources (id, name, homepage, license, requires_key, enabled, note, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, homepage = excluded.homepage, license = excluded.license,
       requires_key = excluded.requires_key, updated_at = excluded.updated_at`,
    [
      provider.name,
      provider.label || provider.name,
      n(provider.homepage),
      n(provider.license),
      provider.requiresKey ? 1 : 0,
      n(provider.note),
      nowIso()
    ]
  );
}

const listSources = () =>
  all(`SELECT id, name, homepage, license, requires_key AS requiresKey, enabled, updated_at AS updatedAt
       FROM metadata_sources ORDER BY name`);

// ---------------------------------------------------------------------------
// Artists
// ---------------------------------------------------------------------------

function artistRow(entity) {
  const now = nowIso();
  const providerId =
    entity.providerId !== undefined && entity.providerId !== null && entity.providerId !== ''
      ? String(entity.providerId)
      : `name:${N.slugify(entity.name)}`;
  return {
    id: entity.id || N.artistId(entity.provider, providerId, entity.name),
    provider: entity.provider,
    providerArtistId: providerId,
    name: N.cleanText(entity.name, 200) || 'Unknown Artist',
    sortName: n(entity.sortName),
    genre: n(entity.genre),
    region: n(entity.region),
    bio: n(entity.bio),
    avatarUrl: n(entity.avatarUrl),
    avatarSource: n(entity.avatarSource),
    heroUrl: n(entity.heroUrl),
    externalUrl: n(entity.externalUrl),
    popularity: n(entity.popularity),
    syncedAt: n(entity.syncedAt) || now,
    now
  };
}

function upsertArtist(entity) {
  const a = artistRow(entity);
  run(
    `INSERT INTO artists (id, provider, provider_artist_id, name, sort_name, genre, region, bio,
        avatar_url, avatar_source, hero_url, external_url, popularity, synced_at, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       sort_name = COALESCE(excluded.sort_name, artists.sort_name),
       genre = COALESCE(excluded.genre, artists.genre),
       region = COALESCE(excluded.region, artists.region),
       bio = COALESCE(excluded.bio, artists.bio),
       avatar_url = COALESCE(excluded.avatar_url, artists.avatar_url),
       avatar_source = COALESCE(excluded.avatar_source, artists.avatar_source),
       hero_url = COALESCE(excluded.hero_url, artists.hero_url),
       external_url = COALESCE(excluded.external_url, artists.external_url),
       popularity = COALESCE(excluded.popularity, artists.popularity),
       synced_at = excluded.synced_at,
       sync_status = 'ok',
       sync_error = NULL,
       updated_at = excluded.updated_at`,
    [
      a.id, a.provider, a.providerArtistId, a.name, a.sortName, a.genre, a.region, a.bio,
      a.avatarUrl, a.avatarSource, a.heroUrl, a.externalUrl, a.popularity, a.syncedAt, a.now, a.now
    ]
  );
  return a.id;
}

// Referenced artist that we only know by { provider, providerId, name }.
function ensureArtistRef(ref) {
  if (!ref || (!ref.providerId && !ref.name)) return null;
  const providerId =
    ref.providerId !== undefined && ref.providerId !== null && ref.providerId !== ''
      ? String(ref.providerId)
      : `name:${N.slugify(ref.name)}`;
  const id = N.artistId(ref.provider, providerId, ref.name);
  const exists = get(`SELECT id FROM artists WHERE id = ?`, [id]);
  if (!exists) {
    upsertArtist({
      id,
      provider: ref.provider,
      providerId,
      name: ref.name,
      popularity: null
    });
  }
  return id;
}

const setArtistSyncError = (id, message) =>
  run(`UPDATE artists SET sync_status = 'error', sync_error = ?, updated_at = ? WHERE id = ?`, [
    N.cleanText(message, 300), nowIso(), id
  ]);

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

function albumRow(entity) {
  const now = nowIso();
  const providerId =
    entity.providerId !== undefined && entity.providerId !== null && entity.providerId !== ''
      ? String(entity.providerId)
      : `title:${N.slugify(entity.title)}`;
  const id = entity.id || N.albumId(entity.provider, providerId, entity.title);
  return {
    id,
    provider: entity.provider,
    providerAlbumId: providerId,
    kind: entity.kind === 'single' ? 'single' : 'album',
    title: N.cleanText(entity.title, 300) || 'Untitled',
    artistDisplay: n(entity.artistDisplay),
    coverUrl: n(entity.coverUrl),
    releaseDate: n(entity.releaseDate),
    genre: n(entity.genre),
    trackCount: n(entity.trackCount),
    score: n(entity.score) ?? N.editorialScore(id),
    popularity: n(entity.popularity),
    comments: n(entity.comments) ?? 0,
    description: n(entity.description),
    externalUrl: n(entity.externalUrl),
    chartSource: n(entity.chartSource),
    syncedAt: n(entity.syncedAt) || now,
    now
  };
}

function upsertAlbum(entity) {
  const a = albumRow(entity);
  run(
    `INSERT INTO albums (id, provider, provider_album_id, kind, title, artist_display, cover_url,
        release_date, genre, track_count, score, popularity, comments, description, external_url,
        chart_source, synced_at, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       title = excluded.title,
       artist_display = COALESCE(excluded.artist_display, albums.artist_display),
       cover_url = COALESCE(excluded.cover_url, albums.cover_url),
       release_date = COALESCE(excluded.release_date, albums.release_date),
       genre = COALESCE(excluded.genre, albums.genre),
       track_count = COALESCE(excluded.track_count, albums.track_count),
       score = COALESCE(excluded.score, albums.score),
       popularity = COALESCE(excluded.popularity, albums.popularity),
       description = COALESCE(excluded.description, albums.description),
       external_url = COALESCE(excluded.external_url, albums.external_url),
       chart_source = COALESCE(excluded.chart_source, albums.chart_source),
       synced_at = excluded.synced_at,
       sync_status = 'ok',
       sync_error = NULL,
       updated_at = excluded.updated_at`,
    [
      a.id, a.provider, a.providerAlbumId, a.kind, a.title, a.artistDisplay, a.coverUrl,
      a.releaseDate, a.genre, a.trackCount, a.score, a.popularity, a.comments, a.description,
      a.externalUrl, a.chartSource, a.syncedAt, a.now, a.now
    ]
  );
  return a.id;
}

function ensureAlbumRef(ref) {
  if (!ref || (!ref.providerId && !ref.title)) return null;
  const providerId =
    ref.providerId !== undefined && ref.providerId !== null && ref.providerId !== ''
      ? String(ref.providerId)
      : `title:${N.slugify(ref.title)}`;
  const id = N.albumId(ref.provider, providerId, ref.title);
  const exists = get(`SELECT id FROM albums WHERE id = ?`, [id]);
  if (!exists) {
    upsertAlbum({
      id,
      provider: ref.provider,
      providerId,
      title: ref.title,
      kind: N.kindForAlbum(null, ref.title),
      coverUrl: ref.coverUrl || null,
      releaseDate: ref.releaseDate || null,
      genre: ref.genre || null
    });
  }
  return id;
}

const setAlbumSyncError = (id, message) =>
  run(`UPDATE albums SET sync_status = 'error', sync_error = ?, updated_at = ? WHERE id = ?`, [
    N.cleanText(message, 300), nowIso(), id
  ]);

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

function upsertTrack(entity) {
  const now = nowIso();
  const providerId =
    entity.providerId !== undefined && entity.providerId !== null && entity.providerId !== ''
      ? String(entity.providerId)
      : `title:${N.slugify(entity.title)}`;
  const id = entity.id || N.trackId(entity.provider, providerId, entity.title);
  let albumId = entity.albumId || null;
  if (!albumId && entity.albumRef) albumId = ensureAlbumRef(entity.albumRef);

  run(
    `INSERT INTO tracks (id, provider, provider_track_id, title, album_id, artist_display,
        track_number, disc_number, duration_ms, preview_url, release_date, genre, popularity,
        synced_at, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       album_id = COALESCE(excluded.album_id, tracks.album_id),
       artist_display = COALESCE(excluded.artist_display, tracks.artist_display),
       track_number = COALESCE(excluded.track_number, tracks.track_number),
       disc_number = COALESCE(excluded.disc_number, tracks.disc_number),
       duration_ms = COALESCE(excluded.duration_ms, tracks.duration_ms),
       preview_url = COALESCE(excluded.preview_url, tracks.preview_url),
       release_date = COALESCE(excluded.release_date, tracks.release_date),
       genre = COALESCE(excluded.genre, tracks.genre),
       popularity = COALESCE(excluded.popularity, tracks.popularity),
       synced_at = excluded.synced_at,
       sync_status = 'ok',
       sync_error = NULL,
       updated_at = excluded.updated_at`,
    [
      id, entity.provider, providerId, N.cleanText(entity.title, 300) || 'Untitled', albumId,
      n(entity.artistDisplay), n(entity.trackNumber), n(entity.discNumber), n(entity.durationMs),
      n(entity.previewUrl), n(entity.releaseDate), n(entity.genre), n(entity.popularity), now, now, now
    ]
  );

  for (const ref of entity.artistRefs || []) {
    const artistId = ensureArtistRef(ref);
    if (artistId) linkTrackArtist(id, artistId, ref.role || 'main', ref.position || 0);
  }
  return id;
}

function linkAlbumArtist(albumId, artistId, role = 'main', position = 0) {
  run(
    `INSERT INTO album_artists (album_id, artist_id, role, position) VALUES (?, ?, ?, ?)
     ON CONFLICT(album_id, artist_id, role) DO UPDATE SET position = excluded.position`,
    [albumId, artistId, role, position]
  );
}

function linkTrackArtist(trackId, artistId, role = 'main', position = 0) {
  run(
    `INSERT INTO track_artists (track_id, artist_id, role, position) VALUES (?, ?, ?, ?)
     ON CONFLICT(track_id, artist_id, role) DO UPDATE SET position = excluded.position`,
    [trackId, artistId, role, position]
  );
}

// Persist a fully-normalised album payload (optionally with its tracks).
function persistAlbum(entity, tracks = []) {
  return transaction(() => {
    const albumId = upsertAlbum(entity);
    (entity.artistRefs || []).forEach((ref) => {
      const artistId = ensureArtistRef(ref);
      if (artistId) linkAlbumArtist(albumId, artistId, ref.role || 'main', ref.position || 0);
    });
    for (const track of tracks) {
      upsertTrack({ ...track, albumId, albumRef: null });
    }
    if (tracks.length && !entity.trackCount) {
      run(`UPDATE albums SET track_count = ? WHERE id = ? AND (track_count IS NULL OR track_count = 0)`, [
        tracks.length, albumId
      ]);
    }
    return albumId;
  });
}

const persistArtist = (entity) => upsertArtist(entity);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const ARTIST_COLUMNS = `id, provider, provider_artist_id AS providerId, name, sort_name AS sortName,
  genre, region, bio, avatar_url AS avatarUrl, avatar_source AS avatarSource, hero_url AS heroUrl,
  external_url AS externalUrl, popularity, synced_at AS syncedAt, sync_status AS syncStatus,
  sync_error AS syncError, created_at AS createdAt, updated_at AS updatedAt`;

const ALBUM_COLUMNS = `al.id, al.provider, al.provider_album_id AS providerId, al.kind, al.title,
  al.artist_display AS artistDisplay, al.cover_url AS coverUrl, al.release_date AS releaseDate,
  al.genre, al.track_count AS trackCount, al.score, al.popularity, al.comments,
  al.description, al.external_url AS externalUrl, al.synced_at AS syncedAt,
  al.sync_status AS syncStatus, al.sync_error AS syncError,
  (SELECT ar.id FROM album_artists aa JOIN artists ar ON ar.id = aa.artist_id
     WHERE aa.album_id = al.id ORDER BY aa.position, ar.name LIMIT 1) AS primaryArtistId,
  (SELECT ar.name FROM album_artists aa JOIN artists ar ON ar.id = aa.artist_id
     WHERE aa.album_id = al.id ORDER BY aa.position, ar.name LIMIT 1) AS primaryArtistName`;

const TRACK_COLUMNS = `t.id, t.provider, t.provider_track_id AS providerId, t.title,
  t.album_id AS albumId, t.artist_display AS artistDisplay, t.track_number AS trackNumber,
  t.disc_number AS discNumber, t.duration_ms AS durationMs, t.preview_url AS previewUrl,
  t.release_date AS releaseDate, t.genre, t.popularity, t.synced_at AS syncedAt,
  t.sync_status AS syncStatus, t.sync_error AS syncError`;

const getArtistRow = (id) => get(`SELECT ${ARTIST_COLUMNS} FROM artists WHERE id = ?`, [id]);
const getAlbumRow = (id) => get(`SELECT ${ALBUM_COLUMNS} FROM albums al WHERE al.id = ?`, [id]);
const getTrackRow = (id) => get(`SELECT ${TRACK_COLUMNS} FROM tracks t WHERE t.id = ?`, [id]);

const albumArtists = (albumId) =>
  all(
    `SELECT ar.id, ar.name, aa.role, aa.position FROM album_artists aa
     JOIN artists ar ON ar.id = aa.artist_id WHERE aa.album_id = ? ORDER BY aa.position, ar.name`,
    [albumId]
  );

const trackArtists = (trackId) =>
  all(
    `SELECT ar.id, ar.name, ta.role, ta.position FROM track_artists ta
     JOIN artists ar ON ar.id = ta.artist_id WHERE ta.track_id = ? ORDER BY ta.position, ar.name`,
    [trackId]
  );

const albumTracks = (albumId) =>
  all(`SELECT ${TRACK_COLUMNS} FROM tracks t WHERE t.album_id = ? ORDER BY t.disc_number, t.track_number, t.title`, [
    albumId
  ]);

const artistAlbums = (artistId, limit = 100) =>
  all(
    `SELECT ${ALBUM_COLUMNS} FROM albums al
     JOIN album_artists aa ON aa.album_id = al.id
     WHERE aa.artist_id = ?
     GROUP BY al.id
     ORDER BY al.release_date DESC NULLS LAST, al.score DESC
     LIMIT ?`,
    [artistId, limit]
  );

const artistTracks = (artistId, limit = 100) =>
  all(
    `SELECT ${TRACK_COLUMNS} FROM tracks t
     JOIN track_artists ta ON ta.track_id = t.id
     WHERE ta.artist_id = ?
     GROUP BY t.id
     ORDER BY t.release_date DESC NULLS LAST, t.title
     LIMIT ?`,
    [artistId, limit]
  );

function getArtistBundle(id) {
  const artist = getArtistRow(id);
  if (!artist) return null;
  return { artist, albums: artistAlbums(id), tracks: artistTracks(id) };
}

function getAlbumBundle(id) {
  const album = getAlbumRow(id);
  if (!album) return null;
  const tracks = albumTracks(id).map((track) => ({
    ...track,
    artists: trackArtists(track.id)
  }));
  return { album, artists: albumArtists(id), tracks };
}

function getTrackBundle(id) {
  const track = getTrackRow(id);
  if (!track) return null;
  return {
    track,
    artists: trackArtists(id),
    album: track.albumId ? getAlbumRow(track.albumId) : null
  };
}

const escapeLike = (value) => String(value).replace(/[\\%_]/g, (match) => `\\${match}`);

function searchLocal(query, { limit = 20 } = {}) {
  const like = `%${escapeLike(query)}%`;
  const artists = all(
    `SELECT ${ARTIST_COLUMNS} FROM artists
     WHERE name LIKE ? ESCAPE '\\' OR sort_name LIKE ? ESCAPE '\\'
     ORDER BY COALESCE(popularity, 0) DESC, name LIMIT ?`,
    [like, like, limit]
  );
  const albums = all(
    `SELECT ${ALBUM_COLUMNS} FROM albums al
     WHERE al.title LIKE ? ESCAPE '\\' OR al.artist_display LIKE ? ESCAPE '\\'
     ORDER BY al.release_date DESC NULLS LAST LIMIT ?`,
    [like, like, limit]
  );
  const tracks = all(
    `SELECT ${TRACK_COLUMNS} FROM tracks t
     WHERE t.title LIKE ? ESCAPE '\\' OR t.artist_display LIKE ? ESCAPE '\\'
     ORDER BY COALESCE(t.popularity, 0) DESC, t.title LIMIT ?`,
    [like, like, limit]
  );
  return { artists, albums, tracks };
}

const GENRE_FILTERS = {
  rap: `(al.genre LIKE '%rap%' OR al.genre LIKE '%hip-hop%' OR al.genre LIKE '%hip hop%')`,
  kpop: `(al.genre LIKE '%k-pop%' OR al.genre LIKE '%kpop%')`,
  hiphop: `(al.genre LIKE '%rap%' OR al.genre LIKE '%hip-hop%')`
};

function listReleases({ from = null, to = null, limit = 30 } = {}) {
  const clauses = [];
  const params = [];
  if (from) { clauses.push('al.release_date >= ?'); params.push(from); }
  if (to) { clauses.push('al.release_date <= ?'); params.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);
  return all(
    `SELECT ${ALBUM_COLUMNS} FROM albums al ${where}
     ORDER BY al.release_date DESC NULLS LAST, al.score DESC LIMIT ?`,
    params
  );
}

function listCharts({ genre = 'all', sort = 'popularity', limit = 50 } = {}) {
  const params = [];
  let where = '';
  const filter = GENRE_FILTERS[genre];
  if (filter) {
    where = `WHERE ${filter}`;
  }
  const order =
    sort === 'score'
      ? 'al.score DESC, al.release_date DESC'
      : sort === 'date'
        ? 'al.release_date DESC NULLS LAST'
        : 'COALESCE(al.popularity, -1) DESC, al.score DESC, al.release_date DESC';
  params.push(limit);
  return all(`SELECT ${ALBUM_COLUMNS} FROM albums al ${where} ORDER BY ${order} LIMIT ?`, params);
}

const staleArtists = (sinceIso, limit = 25) =>
  all(
    `SELECT ${ARTIST_COLUMNS} FROM artists
     WHERE synced_at IS NULL OR synced_at < ?
     ORDER BY COALESCE(popularity, 0) DESC LIMIT ?`,
    [sinceIso, limit]
  );

const stats = () => ({
  artists: get(`SELECT COUNT(*) AS c FROM artists`).c,
  albums: get(`SELECT COUNT(*) AS c FROM albums`).c,
  tracks: get(`SELECT COUNT(*) AS c FROM tracks`).c,
  sources: get(`SELECT COUNT(*) AS c FROM metadata_sources`).c,
  pendingJobs: get(`SELECT COUNT(*) AS c FROM sync_jobs WHERE status IN ('pending','running')`).c,
  cachedCovers: get(`SELECT COUNT(*) AS c FROM cover_cache WHERE status = 'ready'`).c
});

// ---------------------------------------------------------------------------
// Cover cache
// ---------------------------------------------------------------------------

const getCover = (sourceUrl) =>
  get(`SELECT id, source_url AS sourceUrl, local_path AS localPath, content_type AS contentType,
       bytes, status, attempts, last_error AS lastError, updated_at AS updatedAt
       FROM cover_cache WHERE source_url = ?`, [sourceUrl]);

function beginCover(sourceUrl) {
  run(
    `INSERT INTO cover_cache (source_url, status, attempts, created_at, updated_at)
     VALUES (?, 'pending', 1, ?, ?)
     ON CONFLICT(source_url) DO UPDATE SET attempts = cover_cache.attempts + 1, updated_at = excluded.updated_at`,
    [sourceUrl, nowIso(), nowIso()]
  );
  return getCover(sourceUrl);
}

const completeCover = (sourceUrl, { localPath, contentType, bytes }) =>
  run(
    `UPDATE cover_cache SET local_path = ?, content_type = ?, bytes = ?, status = 'ready',
       last_error = NULL, updated_at = ? WHERE source_url = ?`,
    [localPath, contentType || null, bytes || null, nowIso(), sourceUrl]
  );

const failCover = (sourceUrl, message) =>
  run(`UPDATE cover_cache SET status = 'failed', last_error = ?, updated_at = ? WHERE source_url = ?`, [
    N.cleanText(message, 300), nowIso(), sourceUrl
  ]);

// ---------------------------------------------------------------------------
// Sync jobs
// ---------------------------------------------------------------------------

function enqueueJob({ type, target = null, payload = null, priority = 0, maxAttempts = 5, runAt = Date.now() }) {
  const now = nowIso();
  const info = run(
    `INSERT INTO sync_jobs (type, target, status, attempts, max_attempts, priority, payload, next_run_at, created_at, updated_at)
     VALUES (?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (type, IFNULL(target, '')) WHERE status IN ('pending','running')
     DO UPDATE SET next_run_at = MIN(sync_jobs.next_run_at, excluded.next_run_at), updated_at = excluded.updated_at`,
    [type, target, maxAttempts, priority, json(payload), runAt, now, now]
  );
  return Number(info.lastInsertRowid || 0);
}

const dueJobs = (limit = 10) =>
  all(
    `SELECT id, type, target, status, attempts, max_attempts AS maxAttempts, payload,
       next_run_at AS nextRunAt FROM sync_jobs
     WHERE status = 'pending' AND next_run_at <= ?
     ORDER BY priority DESC, next_run_at ASC LIMIT ?`,
    [Date.now(), limit]
  );

const claimJob = (id) =>
  run(`UPDATE sync_jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'pending'`, [
    nowIso(), id
  ]);

const completeJob = (id) =>
  run(`UPDATE sync_jobs SET status = 'done', finished_at = ?, updated_at = ? WHERE id = ?`, [
    nowIso(), nowIso(), id
  ]);

function failJob(id, message, { attempts, maxAttempts }) {
  const willRetry = attempts < maxAttempts;
  const delay = Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts - 1));
  run(
    `UPDATE sync_jobs SET status = ?, attempts = ?, last_error = ?, next_run_at = ?, updated_at = ? WHERE id = ?`,
    [
      willRetry ? 'pending' : 'failed',
      attempts,
      N.cleanText(message, 300),
      willRetry ? Date.now() + delay : 0,
      nowIso(),
      id
    ]
  );
  return willRetry;
}

const listJobs = (limit = 50) =>
  all(
    `SELECT id, type, target, status, attempts, max_attempts AS maxAttempts, last_error AS lastError,
       next_run_at AS nextRunAt, created_at AS createdAt, finished_at AS finishedAt
     FROM sync_jobs ORDER BY id DESC LIMIT ?`,
    [limit]
  );

module.exports = {
  setSource,
  listSources,
  upsertArtist,
  ensureArtistRef,
  setArtistSyncError,
  persistArtist,
  upsertAlbum,
  ensureAlbumRef,
  persistAlbum,
  setAlbumSyncError,
  upsertTrack,
  linkAlbumArtist,
  linkTrackArtist,
  getArtistRow,
  getAlbumRow,
  getTrackRow,
  getArtistBundle,
  getAlbumBundle,
  getTrackBundle,
  albumArtists,
  trackArtists,
  albumTracks,
  artistAlbums,
  artistTracks,
  searchLocal,
  listReleases,
  listCharts,
  staleArtists,
  stats,
  getCover,
  beginCover,
  completeCover,
  failCover,
  enqueueJob,
  dueJobs,
  claimJob,
  completeJob,
  failJob,
  listJobs
};