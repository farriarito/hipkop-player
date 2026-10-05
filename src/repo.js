'use strict';

// All database reads/writes for the catalog. The API layer never writes SQL
// directly, which keeps the provider -> normalize -> persist pipeline auditable.

const { run, get, all, transaction, nowIso, json } = require('./db');
const N = require('./normalize');
const T = require('./taxonomy');

const n = (value) => (value === undefined ? null : value);

// 'unknown' is the taxonomy's "we don't know" value. Store it as NULL so that
// COALESCE/upsert can never let an unknown overwrite a real value.
const storeBucket = (bucket) => (bucket && bucket !== 'unknown' ? bucket : null);
const storeScene = (scene) => (scene && scene !== 'unknown' ? scene : null);

// Provider ids that were synthesised locally (name:/title: prefixes) are not
// real upstream identifiers and must never be written to album_aliases.
const providerIdLooksReal = (value) =>
  Boolean(value) && !String(value).startsWith('name:') && !String(value).startsWith('title:');

// iTunes exposes one album under several storefront ids (US/KR/CN ...). An alias
// row records "this provider id folded into that canonical album" so a later
// sync updates the canonical row instead of resurrecting a duplicate.
const albumAlias = (provider, providerAlbumId) =>
  providerAlbumId
    ? get(`SELECT album_id AS albumId FROM album_aliases WHERE provider = ? AND provider_album_id = ?`, [
        provider, String(providerAlbumId)
      ])
    : null;

const setAlbumAlias = (provider, providerAlbumId, albumId) =>
  run(
    `INSERT INTO album_aliases (provider, provider_album_id, album_id, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(provider, provider_album_id) DO UPDATE SET album_id = excluded.album_id`,
    [provider, String(providerAlbumId), albumId, nowIso()]
  );

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
  const name = N.cleanText(entity.name, 200) || 'Unknown Artist';
  const genreBucket = storeBucket(entity.genreBucket || T.genreBucket(entity.genre));
  return {
    id: entity.id || N.artistId(entity.provider, providerId, entity.name),
    provider: entity.provider,
    providerArtistId: providerId,
    name,
    sortName: n(entity.sortName),
    genre: n(entity.genre),
    genreBucket,
    scene: storeScene(n(entity.scene) || T.sceneFor(name, entity.genreBucket || T.genreBucket(entity.genre))),
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
    `INSERT INTO artists (id, provider, provider_artist_id, name, sort_name, genre, genre_bucket, scene,
        region, bio, avatar_url, avatar_source, hero_url, external_url, popularity,
        synced_at, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       sort_name = COALESCE(excluded.sort_name, artists.sort_name),
       genre = COALESCE(excluded.genre, artists.genre),
       genre_bucket = COALESCE(excluded.genre_bucket, artists.genre_bucket),
       scene = COALESCE(excluded.scene, artists.scene),
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
      a.id, a.provider, a.providerArtistId, a.name, a.sortName, a.genre, a.genreBucket, a.scene,
      a.region, a.bio, a.avatarUrl, a.avatarSource, a.heroUrl, a.externalUrl, a.popularity,
      a.syncedAt, a.now, a.now
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
    upsertArtist({ id, provider: ref.provider, providerId, name: ref.name, popularity: null });
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
  const alias = entity.id ? null : albumAlias(entity.provider, providerId);
  const id = entity.id || (alias && alias.albumId) || N.albumId(entity.provider, providerId, entity.title);
  const genreBucket = storeBucket(entity.genreBucket || T.genreBucket(entity.genre));
  const artistDisplay = n(entity.artistDisplay);
  return {
    id,
    provider: entity.provider,
    providerAlbumId: providerId,
    kind: entity.kind === 'single' ? 'single' : 'album',
    title: N.cleanText(entity.title, 300) || 'Untitled',
    artistDisplay,
    coverUrl: n(entity.coverUrl),
    releaseDate: n(entity.releaseDate),
    genre: n(entity.genre),
    genreBucket,
    scene: storeScene(n(entity.scene) || T.sceneFor(artistDisplay, T.genreBucket(entity.genre))),
    trackCount: n(entity.trackCount),
    score: n(entity.score) ?? N.editorialScore(id),
    popularity: n(entity.popularity),
    comments: n(entity.comments) ?? 0,
    description: n(entity.description),
    externalUrl: n(entity.externalUrl),
    chartSource: n(entity.chartSource),
    qqAlbumMid: n(entity.qqAlbumMid),
    qqListenSongMid: n(entity.qqListenSongMid),
    neteaseAlbumId: n(entity.neteaseAlbumId),
    syncedAt: n(entity.syncedAt) || now,
    now
  };
}

function upsertAlbum(entity) {
  const a = albumRow(entity);
  run(
    `INSERT INTO albums (id, provider, provider_album_id, kind, title, artist_display, cover_url,
        release_date, genre, genre_bucket, scene, track_count, score, popularity, comments,
        description, external_url, chart_source, qq_album_mid, qq_listen_song_mid, netease_album_id,
        synced_at, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       title = excluded.title,
       artist_display = COALESCE(excluded.artist_display, albums.artist_display),
       cover_url = COALESCE(excluded.cover_url, albums.cover_url),
       release_date = COALESCE(excluded.release_date, albums.release_date),
       genre = COALESCE(excluded.genre, albums.genre),
       genre_bucket = COALESCE(excluded.genre_bucket, albums.genre_bucket),
       scene = COALESCE(excluded.scene, albums.scene),
       track_count = COALESCE(excluded.track_count, albums.track_count),
       score = COALESCE(excluded.score, albums.score),
       popularity = COALESCE(excluded.popularity, albums.popularity),
       description = COALESCE(excluded.description, albums.description),
       external_url = COALESCE(excluded.external_url, albums.external_url),
       chart_source = COALESCE(excluded.chart_source, albums.chart_source),
       qq_album_mid = COALESCE(excluded.qq_album_mid, albums.qq_album_mid),
       qq_listen_song_mid = COALESCE(excluded.qq_listen_song_mid, albums.qq_listen_song_mid),
       netease_album_id = COALESCE(excluded.netease_album_id, albums.netease_album_id),
       synced_at = excluded.synced_at,
       sync_status = 'ok',
       sync_error = NULL,
       updated_at = excluded.updated_at`,
    [
      a.id, a.provider, a.providerAlbumId, a.kind, a.title, a.artistDisplay, a.coverUrl,
      a.releaseDate, a.genre, a.genreBucket, a.scene, a.trackCount, a.score, a.popularity,
      a.comments, a.description, a.externalUrl, a.chartSource, a.qqAlbumMid, a.qqListenSongMid,
      a.neteaseAlbumId, a.syncedAt, a.now, a.now
    ]
  );
  if (providerIdLooksReal(a.providerAlbumId) && a.id !== N.albumId(a.provider, a.providerAlbumId, a.title)) {
    setAlbumAlias(a.provider, a.providerAlbumId, a.id);
  }
  return a.id;
}

function ensureAlbumRef(ref) {
  if (!ref || (!ref.providerId && !ref.title)) return null;
  const providerId =
    ref.providerId !== undefined && ref.providerId !== null && ref.providerId !== ''
      ? String(ref.providerId)
      : `title:${N.slugify(ref.title)}`;
  const alias = albumAlias(ref.provider, providerId);
  const id = (alias && alias.albumId) || N.albumId(ref.provider, providerId, ref.title);
  const exists = get(`SELECT id FROM albums WHERE id = ?`, [id]);
  if (!exists) {
    upsertAlbum({
      id,
      provider: ref.provider,
      providerId,
      title: ref.title,
      kind: N.kindForAlbum(null, ref.title),
      artistDisplay: ref.artistDisplay || null,
      coverUrl: ref.coverUrl || null,
      releaseDate: ref.releaseDate || null,
      genre: ref.genre || null
    });
    if (ref.artistDisplay) {
      const artistId = ensureArtistRef({ provider: ref.provider, providerId: null, name: ref.artistDisplay });
      if (artistId) linkAlbumArtist(id, artistId, 'main', 0);
    }
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
  if (!albumId && entity.albumRef) {
    albumId = ensureAlbumRef({
      ...entity.albumRef,
      artistDisplay: entity.albumRef.artistDisplay || entity.artistDisplay
    });
  }
  const genreBucket = storeBucket(entity.genreBucket || T.genreBucket(entity.genre));

  run(
    `INSERT INTO tracks (id, provider, provider_track_id, title, album_id, artist_display,
        track_number, disc_number, duration_ms, preview_url, release_date, genre, genre_bucket,
        popularity, qq_song_mid, netease_song_id, synced_at, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)
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
       genre_bucket = COALESCE(excluded.genre_bucket, tracks.genre_bucket),
       popularity = COALESCE(excluded.popularity, tracks.popularity),
       qq_song_mid = COALESCE(excluded.qq_song_mid, tracks.qq_song_mid),
       netease_song_id = COALESCE(excluded.netease_song_id, tracks.netease_song_id),
       synced_at = excluded.synced_at,
       sync_status = 'ok',
       sync_error = NULL,
       updated_at = excluded.updated_at`,
    [
      id, entity.provider, providerId, N.cleanText(entity.title, 300) || 'Untitled', albumId,
      n(entity.artistDisplay), n(entity.trackNumber), n(entity.discNumber), n(entity.durationMs),
      n(entity.previewUrl), n(entity.releaseDate), n(entity.genre), genreBucket, n(entity.popularity),
      n(entity.qqSongMid), n(entity.neteaseSongId), now, now, now
    ]
  );

  for (const ref of entity.artistRefs || []) {
    const artistId = ensureArtistRef(ref);
    if (artistId) linkTrackArtist(id, artistId, ref.role || 'main', ref.position || 0);
  }

  if (albumId) {
    const hasArtist = get(`SELECT 1 AS ok FROM album_artists WHERE album_id = ? LIMIT 1`, [albumId]);
    if (!hasArtist) {
      const main = (entity.artistRefs || [])[0];
      const artistId = main ? ensureArtistRef(main) : null;
      if (artistId) {
        linkAlbumArtist(albumId, artistId, 'main', 0);
        refreshAlbumArtistDisplay(albumId);
      }
    }
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

// Keep a denormalised artist_display in sync with the relation table so list
// views and detail views never disagree about who made the album.
function refreshAlbumArtistDisplay(albumId) {
  const artists = albumArtists(albumId);
  if (!artists.length) return;
  const mains = artists.filter((a) => a.role !== 'featured');
  const display = (mains.length ? mains : artists).map((a) => a.name).join(' / ');
  run(`UPDATE albums SET artist_display = ?, updated_at = ? WHERE id = ? AND (artist_display IS NULL OR artist_display <> ?)`, [
    display, nowIso(), albumId, display
  ]);
}

function refreshTrackArtistDisplay(trackId) {
  const artists = trackArtists(trackId);
  if (!artists.length) return;
  const mains = artists.filter((a) => a.role !== 'featured');
  const display = (mains.length ? mains : artists).map((a) => a.name).join(' / ');
  run(`UPDATE tracks SET artist_display = ?, updated_at = ? WHERE id = ? AND (artist_display IS NULL OR artist_display <> ?)`, [
    display, nowIso(), trackId, display
  ]);
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
    refreshAlbumArtistDisplay(albumId);
    applyAlbumScene(albumId);
    return albumId;
  });
}

// Album "scene" follows its primary artist (mainstream vs underground curation).
function applyAlbumScene(albumId) {
  const row = get(
    `SELECT ar.scene AS scene FROM album_artists aa
     JOIN artists ar ON ar.id = aa.artist_id WHERE aa.album_id = ?
     ORDER BY aa.position, ar.name LIMIT 1`,
    [albumId]
  );
  const scene = row ? storeScene(row.scene) : null;
  if (!scene) return;
  run(`UPDATE albums SET scene = COALESCE(?, scene), updated_at = ? WHERE id = ?`, [scene, nowIso(), albumId]);
}

const persistArtist = (entity) => upsertArtist(entity);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const ARTIST_COLUMNS = `id, provider, provider_artist_id AS providerId, name, sort_name AS sortName,
  genre, genre_bucket AS genreBucket, scene, region, bio, avatar_url AS avatarUrl,
  avatar_source AS avatarSource, hero_url AS heroUrl, external_url AS externalUrl, popularity,
  synced_at AS syncedAt, sync_status AS syncStatus, sync_error AS syncError,
  created_at AS createdAt, updated_at AS updatedAt`;

const ALBUM_COLUMNS = `al.id, al.provider, al.provider_album_id AS providerId, al.kind, al.title,
  al.artist_display AS artistDisplay, al.cover_url AS coverUrl, al.release_date AS releaseDate,
  al.genre, al.genre_bucket AS genreBucket, al.scene, al.track_count AS trackCount,
  al.score, al.popularity, al.comments, al.description, al.external_url AS externalUrl,
  al.chart_source AS chartSource, al.qq_album_mid AS qqAlbumMid, al.qq_listen_song_mid AS qqListenSongMid,
  al.netease_album_id AS neteaseAlbumId, al.synced_at AS syncedAt, al.sync_status AS syncStatus,
  al.sync_error AS syncError,
  (SELECT ar.id FROM album_artists aa JOIN artists ar ON ar.id = aa.artist_id
     WHERE aa.album_id = al.id ORDER BY aa.position, ar.name LIMIT 1) AS primaryArtistId,
  (SELECT ar.name FROM album_artists aa JOIN artists ar ON ar.id = aa.artist_id
     WHERE aa.album_id = al.id ORDER BY aa.position, ar.name LIMIT 1) AS primaryArtistName`;

const TRACK_COLUMNS = `t.id, t.provider, t.provider_track_id AS providerId, t.title,
  t.album_id AS albumId, t.artist_display AS artistDisplay, t.track_number AS trackNumber,
  t.disc_number AS discNumber, t.duration_ms AS durationMs, t.preview_url AS previewUrl,
  t.release_date AS releaseDate, t.genre, t.genre_bucket AS genreBucket, t.popularity,
  t.qq_song_mid AS qqSongMid, t.netease_song_id AS neteaseSongId,
  t.synced_at AS syncedAt, t.sync_status AS syncStatus, t.sync_error AS syncError`;

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
  const tracks = albumTracks(id).map((track) => ({ ...track, artists: trackArtists(track.id) }));
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

const artistBucketExists = (bucket) =>
  `EXISTS (SELECT 1 FROM album_artists aa JOIN artists ar ON ar.id = aa.artist_id
            WHERE aa.album_id = al.id AND ar.genre_bucket = '${bucket}')`;

// A K-POP act's album can be tagged "Hip-Hop/Rap" upstream and a rapper's
// project can be tagged "Pop". Rather than lose those rows from the cross-genre
// tabs, match on the album's own bucket OR its primary artist's bucket.
const BUCKET_FILTERS = {
  kpop: `(al.genre_bucket = 'kpop' OR ${artistBucketExists('kpop')})`,
  hiphop: `(al.genre_bucket = 'hiphop' OR ${artistBucketExists('hiphop')})`,
  rap: `(al.genre_bucket = 'hiphop' OR ${artistBucketExists('hiphop')})`,
  other: `(al.genre_bucket = 'other' OR ${artistBucketExists('other')})`
};

const SCENE_FILTERS = { mainstream: `al.scene = 'mainstream'`, underground: `al.scene = 'underground'` };

function albumWhere({ bucket, scene, genre, from, to, year } = {}) {
  const clauses = [];
  const params = [];
  if (BUCKET_FILTERS[bucket]) clauses.push(BUCKET_FILTERS[bucket]);
  if (SCENE_FILTERS[scene]) clauses.push(SCENE_FILTERS[scene]);
  if (genre && !BUCKET_FILTERS[genre]) {
    clauses.push(`(al.genre LIKE ? ESCAPE '\\' OR al.genre LIKE ? ESCAPE '\\')`);
    params.push(`%${escapeLike(genre)}%`, `%${escapeLike(genre)}%`);
  }
  if (from) { clauses.push('al.release_date >= ?'); params.push(from); }
  if (to) { clauses.push('al.release_date <= ?'); params.push(to); }
  if (year) { clauses.push('al.release_date LIKE ?'); params.push(`${year}-%`); }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const ORDER_BY = {
  popularity: 'COALESCE(al.popularity, -1) DESC, al.score DESC, al.release_date DESC',
  score: 'al.score DESC, al.release_date DESC',
  date: 'al.release_date DESC NULLS LAST, al.score DESC',
  title: 'al.title ASC'
};

function listAlbumsBrowse({ bucket, scene, genre, from, to, year, sort = 'date', limit = 40 } = {}) {
  const { where, params } = albumWhere({ bucket, scene, genre, from, to, year });
  params.push(limit);
  return all(
    `SELECT ${ALBUM_COLUMNS} FROM albums al ${where} ORDER BY ${ORDER_BY[sort] || ORDER_BY.date} LIMIT ?`,
    params
  );
}

const listReleases = ({ from = null, to = null, bucket = null, scene = null, limit = 30 } = {}) =>
  listAlbumsBrowse({ from, to, bucket, scene, sort: 'date', limit });

const listCharts = ({ genre = 'all', scene = 'all', sort = 'popularity', limit = 50 } = {}) =>
  listAlbumsBrowse({
    bucket: genre === 'all' ? null : genre,
    scene: scene === 'all' ? null : scene,
    sort,
    limit
  });

const staleArtists = (sinceIso, limit = 25) =>
  all(
    `SELECT ${ARTIST_COLUMNS} FROM artists
     WHERE synced_at IS NULL OR synced_at < ?
     ORDER BY COALESCE(popularity, 0) DESC LIMIT ?`,
    [sinceIso, limit]
  );

const categoryCounts = () => ({
  buckets: all(
    `SELECT COALESCE(genre_bucket, 'unknown') AS bucket, COUNT(*) AS count FROM albums GROUP BY genre_bucket`
  ),
  scenes: all(
    `SELECT COALESCE(scene, 'unknown') AS scene, COUNT(*) AS count FROM albums GROUP BY scene`
  ),
  artistScenes: all(
    `SELECT COALESCE(scene, 'unknown') AS scene, COUNT(*) AS count FROM artists GROUP BY scene`
  )
});

// What a maintainer would want to see after a sync: rows that still disagree.
const consistencyReport = () => ({
  albumsMissingCover: get(`SELECT COUNT(*) AS c FROM albums WHERE cover_url IS NULL OR cover_url = ''`).c,
  albumsMissingReleaseDate: get(`SELECT COUNT(*) AS c FROM albums WHERE release_date IS NULL OR release_date = ''`).c,
  albumsWithoutArtist: get(`SELECT COUNT(*) AS c FROM albums al WHERE NOT EXISTS (SELECT 1 FROM album_artists aa WHERE aa.album_id = al.id)`).c,
  tracksWithoutAlbum: get(`SELECT COUNT(*) AS c FROM tracks WHERE album_id IS NULL`).c,
  tracksMissingArtist: get(`SELECT COUNT(*) AS c FROM tracks t WHERE t.artist_display IS NULL AND NOT EXISTS (SELECT 1 FROM track_artists ta WHERE ta.track_id = t.id)`).c,
  stubArtists: get(`SELECT COUNT(*) AS c FROM artists WHERE provider_artist_id LIKE 'name:%'`).c,
  stubAlbums: get(`SELECT COUNT(*) AS c FROM albums WHERE provider_album_id LIKE 'title:%'`).c,
  duplicateArtists: get(
    `SELECT COUNT(*) AS c FROM (SELECT provider, lower(name) AS n FROM artists GROUP BY provider, lower(name) HAVING COUNT(*) > 1)`
  ).c,
  duplicateTracks: get(
    `SELECT COUNT(*) AS c FROM (SELECT album_id, lower(title) AS t, COALESCE(disc_number,-1) AS d,
       COALESCE(track_number,-1) AS n FROM tracks WHERE album_id IS NOT NULL
       GROUP BY album_id, lower(title), COALESCE(disc_number,-1), COALESCE(track_number,-1) HAVING COUNT(*) > 1)`
  ).c,
  duplicateAlbums: get(
    `SELECT COUNT(*) AS c FROM (SELECT provider, lower(title) AS t, COALESCE(artist_display,'') AS a FROM albums GROUP BY provider, lower(title), COALESCE(artist_display,'') HAVING COUNT(*) > 1)`
  ).c
});

const stats = () => ({
  artists: get(`SELECT COUNT(*) AS c FROM artists`).c,
  albums: get(`SELECT COUNT(*) AS c FROM albums`).c,
  tracks: get(`SELECT COUNT(*) AS c FROM tracks`).c,
  sources: get(`SELECT COUNT(*) AS c FROM metadata_sources`).c,
  posts: get(`SELECT COUNT(*) AS c FROM community_posts`).c,
  pendingJobs: get(`SELECT COUNT(*) AS c FROM sync_jobs WHERE status IN ('pending','running')`).c,
  cachedCovers: get(`SELECT COUNT(*) AS c FROM cover_cache WHERE status = 'ready'`).c
});

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------

const listPosts = ({ topic = null, limit = 30 } = {}) =>
  all(
    `SELECT p.id, p.topic, p.title, p.body, p.author, p.album_id AS albumId, p.artist_id AS artistId,
       p.likes, p.created_at AS createdAt,
       al.title AS albumTitle, al.artist_display AS albumArtist,
       ar.name AS artistName
     FROM community_posts p
     LEFT JOIN albums al ON al.id = p.album_id
     LEFT JOIN artists ar ON ar.id = p.artist_id
     ${topic && topic !== 'all' ? 'WHERE p.topic = ?' : ''}
     ORDER BY p.created_at DESC LIMIT ?`,
    topic && topic !== 'all' ? [topic, limit] : [limit]
  );

const countPosts = () => get(`SELECT COUNT(*) AS c FROM community_posts`).c;

function createPost({ topic = 'general', title, body, author = 'HIPKOP 社区', albumId = null, artistId = null }) {
  const now = nowIso();
  const info = run(
    `INSERT INTO community_posts (topic, title, body, author, album_id, artist_id, likes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [topic, title, body, author, albumId, artistId, now, now]
  );
  return Number(info.lastInsertRowid || 0);
}

function seedPostsIfEmpty(posts) {
  if (countPosts() > 0) return 0;
  let created = 0;
  for (const post of posts) {
    createPost(post);
    created += 1;
  }
  return created;
}

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
  albumAlias,
  setAlbumAlias,
  persistAlbum,
  refreshAlbumArtistDisplay,
  refreshTrackArtistDisplay,
  applyAlbumScene,
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
  listAlbumsBrowse,
  categoryCounts,
  consistencyReport,
  staleArtists,
  stats,
  listPosts,
  createPost,
  countPosts,
  seedPostsIfEmpty,
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