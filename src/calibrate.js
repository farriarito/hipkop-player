'use strict';

// Database calibration.
//
// Providers give us overlapping, sometimes partial metadata: the same artist
// arrives once with a numeric id and once name-only, a track can create a
// placeholder album before the real album is synced, a cover can be stored at a
// low resolution, release dates can be missing on one side of a relation. This
// module reconciles those rows into one consistent catalog. It is idempotent and
// safe to run after every sync.
//
//   duplicates   stub artists/albums merged into their canonical row
//   covers       artwork normalised to the 900px master, orphans queued for sync
//   dates        album/track release dates backfilled from each other
//   artists      every album gets a relation; display strings recomputed
//   taxonomy     genre bucket + scene re-derived

const { run, get, all, transaction, nowIso } = require('./db');
const T = require('./taxonomy');
const repo = require('./repo');

const key = (value) => T.key(value);

const isStubArtist = (row) => String(row.providerId || '').startsWith('name:');
const isStubAlbum = (row) => String(row.providerId || '').startsWith('title:');

// Rewrite iTunes artwork to the 900px master so the same album never shows two
// different resolutions depending on which sync touched it last.
function normalizeArtworkUrl(url) {
  if (!url) return url;
  if (!/mzstatic\.com/i.test(url)) return url;
  return String(url)
    .replace(/\d+x\d+bb/gi, '900x900bb')
    .replace(/\d+x\d+(?=\.(jpg|jpeg|png|webp))/gi, '900x900');
}

// ---------------------------------------------------------------------------
// Artist merges
// ---------------------------------------------------------------------------

function relationCount(artistId) {
  return (
    get(`SELECT COUNT(*) AS c FROM album_artists WHERE artist_id = ?`, [artistId]).c +
    get(`SELECT COUNT(*) AS c FROM track_artists WHERE artist_id = ?`, [artistId]).c
  );
}

function richness(row) {
  let score = relationCount(row.id) * 2;
  if (!isStubArtist(row)) score += 20;
  for (const field of ['genre', 'region', 'bio', 'avatarUrl', 'heroUrl', 'externalUrl']) {
    if (row[field]) score += 3;
  }
  if (row.popularity != null) score += 2;
  return score;
}

function fillArtist(targetId, src) {
  run(
    `UPDATE artists SET
       sort_name = COALESCE(sort_name, ?), genre = COALESCE(genre, ?), region = COALESCE(region, ?),
       bio = COALESCE(bio, ?), avatar_url = COALESCE(avatar_url, ?), avatar_source = COALESCE(avatar_source, ?),
       hero_url = COALESCE(hero_url, ?), external_url = COALESCE(external_url, ?),
       popularity = COALESCE(popularity, ?), genre_bucket = COALESCE(genre_bucket, ?),
       scene = COALESCE(scene, ?), updated_at = ?
     WHERE id = ?`,
    [src.sortName, src.genre, src.region, src.bio, src.avatarUrl, src.avatarSource, src.heroUrl,
     src.externalUrl, src.popularity, src.genreBucket, src.scene, nowIso(), targetId]
  );
}

function mergeArtistInto(fromId, toId) {
  const src = repo.getArtistRow(fromId);
  if (!src) return false;
  run(
    `INSERT OR IGNORE INTO album_artists (album_id, artist_id, role, position)
     SELECT album_id, ?, role, position FROM album_artists WHERE artist_id = ?`,
    [toId, fromId]
  );
  run(`DELETE FROM album_artists WHERE artist_id = ?`, [fromId]);
  run(
    `INSERT OR IGNORE INTO track_artists (track_id, artist_id, role, position)
     SELECT track_id, ?, role, position FROM track_artists WHERE artist_id = ?`,
    [toId, fromId]
  );
  run(`DELETE FROM track_artists WHERE artist_id = ?`, [fromId]);
  fillArtist(toId, src);
  run(`DELETE FROM artists WHERE id = ?`, [fromId]);
  return true;
}

function mergeArtists() {
  let merged = 0;

  // 1) name-only stubs -> the real provider row with the same name
  const stubs = all(
    `SELECT ${'id, provider, provider_artist_id AS providerId, name'} FROM artists WHERE provider_artist_id LIKE 'name:%'`
  );
  for (const stub of stubs) {
    const target = all(
      `SELECT id, name FROM artists
       WHERE provider = ? AND id <> ? AND lower(name) = lower(?) AND provider_artist_id NOT LIKE 'name:%'
       ORDER BY length(provider_artist_id) ASC LIMIT 1`,
      [stub.provider, stub.id, stub.name]
    )[0];
    if (target && mergeArtistInto(stub.id, target.id)) merged += 1;
  }

  // 2) same provider + same normalised name -> keep the richest, merge the rest
  const groups = all(
    `SELECT provider, lower(name) AS n, COUNT(*) AS c FROM artists GROUP BY provider, lower(name) HAVING c > 1`
  );
  for (const group of groups) {
    const rows = all(
      `SELECT id FROM artists WHERE provider = ? AND lower(name) = ?`,
      [group.provider, group.n]
    ).map((row) => repo.getArtistRow(row.id)).filter(Boolean);
    if (rows.length < 2) continue;
    rows.sort((a, b) => richness(b) - richness(a));
    const [keep, ...rest] = rows;
    for (const row of rest) if (mergeArtistInto(row.id, keep.id)) merged += 1;
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Album merges (placeholders only) + orphan artist attach
// ---------------------------------------------------------------------------

function fillAlbum(targetId, src) {
  run(
    `UPDATE albums SET
       artist_display = COALESCE(artist_display, ?),
       cover_url = COALESCE(cover_url, ?), release_date = COALESCE(release_date, ?),
       genre = COALESCE(genre, ?), genre_bucket = COALESCE(genre_bucket, ?),
       track_count = COALESCE(track_count, ?), score = COALESCE(score, ?),
       popularity = COALESCE(popularity, ?), comments = MAX(comments, COALESCE(?, 0)),
       description = COALESCE(description, ?), external_url = COALESCE(external_url, ?),
       chart_source = COALESCE(chart_source, ?), qq_album_mid = COALESCE(qq_album_mid, ?),
       qq_listen_song_mid = COALESCE(qq_listen_song_mid, ?), netease_album_id = COALESCE(netease_album_id, ?),
       updated_at = ?
     WHERE id = ?`,
    [src.artistDisplay, src.coverUrl, src.releaseDate, src.genre, src.genreBucket, src.trackCount,
     src.score, src.popularity, src.comments, src.description, src.externalUrl, src.chartSource,
     src.qqAlbumMid, src.qqListenSongMid, src.neteaseAlbumId, nowIso(), targetId]
  );
}

// Keep one canonical row per (title, artist). Provider storefronts hand us the
// same release with different ids, covers and slightly different dates; the
// richest row wins and the rest are folded into it.
function albumRichness(row) {
  let score = isStubAlbum(row) ? 0 : 12;
  if (row.coverUrl) score += 10;
  if (row.releaseDate) score += 6;
  if (row.genre) score += 3;
  if (row.description) score += 2;
  if (row.externalUrl) score += 2;
  if (row.qqAlbumMid || row.neteaseAlbumId) score += 2;
  score += Math.min(12, Number(row.trackCount) || 0);
  score += get(`SELECT COUNT(*) AS c FROM tracks WHERE album_id = ?`, [row.id]).c * 2;
  score += get(`SELECT COUNT(*) AS c FROM album_artists WHERE album_id = ?`, [row.id]).c * 3;
  return score;
}

function mergeDuplicateAlbums() {
  const buckets = new Map();
  for (const { id } of all(`SELECT id FROM albums`)) {
    const row = repo.getAlbumRow(id);
    if (!row) continue;
    const titleKey = key(row.title);
    if (!titleKey) continue;
    const artistKey = key(row.artistDisplay);
    // Group across providers only when an artist disambiguates the title;
    // otherwise stay within a provider to avoid false merges.
    const groupKey = artistKey ? `a|${titleKey}|${artistKey}` : `p|${row.provider}|${titleKey}`;
    const bucket = buckets.get(groupKey) || [];
    bucket.push(row);
    buckets.set(groupKey, bucket);
  }
  let merged = 0;
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => albumRichness(b) - albumRichness(a));
    const [keep, ...rest] = bucket;
    for (const row of rest) if (mergeAlbumInto(row.id, keep.id)) merged += 1;
  }
  return merged;
}

// Same release, same album, same position -> one track row.
function trackRichness(row) {
  let score = 0;
  if (row.previewUrl) score += 4;
  if (row.durationMs) score += 3;
  if (row.artistDisplay) score += 3;
  if (row.qqSongMid) score += 3;
  if (row.neteaseSongId) score += 3;
  if (row.trackNumber != null) score += 1;
  score += get(`SELECT COUNT(*) AS c FROM track_artists WHERE track_id = ?`, [row.id]).c * 2;
  return score;
}

function mergeDuplicateTracks() {
  const groups = all(
    `SELECT album_id AS albumId, lower(title) AS t, COALESCE(disc_number,-1) AS d,
       COALESCE(track_number,-1) AS n, COUNT(*) AS c FROM tracks
     WHERE album_id IS NOT NULL
     GROUP BY album_id, lower(title), COALESCE(disc_number,-1), COALESCE(track_number,-1)
     HAVING c > 1`
  );
  let merged = 0;
  for (const group of groups) {
    const rows = all(
      `SELECT id FROM tracks WHERE album_id = ? AND lower(title) = ?
         AND COALESCE(disc_number,-1) = ? AND COALESCE(track_number,-1) = ?`,
      [group.albumId, group.t, group.d, group.n]
    ).map((row) => repo.getTrackRow(row.id)).filter(Boolean);
    if (rows.length < 2) continue;
    rows.sort((a, b) => trackRichness(b) - trackRichness(a));
    const [keep, ...rest] = rows;
    for (const row of rest) {
      run(
        `INSERT OR IGNORE INTO track_artists (track_id, artist_id, role, position)
         SELECT ?, artist_id, role, position FROM track_artists WHERE track_id = ?`,
        [keep.id, row.id]
      );
      run(`DELETE FROM track_artists WHERE track_id = ?`, [row.id]);
      run(
        `UPDATE tracks SET preview_url = COALESCE(preview_url, ?), duration_ms = COALESCE(duration_ms, ?),
           track_number = COALESCE(track_number, ?), artist_display = COALESCE(artist_display, ?),
           qq_song_mid = COALESCE(qq_song_mid, ?), netease_song_id = COALESCE(netease_song_id, ?),
           popularity = COALESCE(popularity, ?), genre = COALESCE(genre, ?),
           genre_bucket = COALESCE(genre_bucket, ?), release_date = COALESCE(release_date, ?),
           updated_at = ? WHERE id = ?`,
        [row.previewUrl, row.durationMs, row.trackNumber, row.artistDisplay, row.qqSongMid,
         row.neteaseSongId, row.popularity, row.genre, row.genreBucket, row.releaseDate, nowIso(), keep.id]
      );
      run(`DELETE FROM tracks WHERE id = ?`, [row.id]);
      merged += 1;
    }
  }
  return merged;
}

function mergeAlbumInto(fromId, toId) {
  const src = repo.getAlbumRow(fromId);
  if (!src) return false;
  run(`UPDATE tracks SET album_id = ? WHERE album_id = ?`, [toId, fromId]);
  run(
    `INSERT OR IGNORE INTO album_artists (album_id, artist_id, role, position)
     SELECT ?, artist_id, role, position FROM album_artists WHERE album_id = ?`,
    [toId, fromId]
  );
  run(`DELETE FROM album_artists WHERE album_id = ?`, [fromId]);
  if (src.providerId && !String(src.providerId).startsWith('title:') && !String(src.providerId).startsWith('name:')) {
    repo.setAlbumAlias(src.provider, src.providerId, toId);
  }
  fillAlbum(toId, src);
  run(`DELETE FROM albums WHERE id = ?`, [fromId]);
  return true;
}

function mergeStubAlbums() {
  let merged = 0;
  const stubs = all(
    `SELECT id, provider, title, artist_display AS artistDisplay FROM albums WHERE provider_album_id LIKE 'title:%'`
  );
  for (const stub of stubs) {
    const candidates = all(
      `SELECT al.id, al.title, al.artist_display AS artistDisplay FROM albums al
       WHERE al.provider = ? AND al.id <> ? AND lower(al.title) = lower(?)
         AND al.provider_album_id NOT LIKE 'title:%'
       ORDER BY (al.cover_url IS NOT NULL) DESC, al.track_count DESC LIMIT 3`,
      [stub.provider, stub.id, stub.title]
    );
    const target = candidates.find((candidate) => {
      if (!stub.artistDisplay || !candidate.artistDisplay) return true;
      return key(stub.artistDisplay) === key(candidate.artistDisplay);
    });
    if (target && mergeAlbumInto(stub.id, target.id)) merged += 1;
  }
  return merged;
}

function attachMissingAlbumArtists() {
  const orphans = all(
    `SELECT al.id, al.provider, al.artist_display AS artistDisplay FROM albums al
     WHERE al.artist_display IS NOT NULL AND al.artist_display <> ''
       AND NOT EXISTS (SELECT 1 FROM album_artists aa WHERE aa.album_id = al.id)`
  );
  let attached = 0;
  for (const album of orphans) {
    const artistId = repo.ensureArtistRef({ provider: album.provider, providerId: null, name: album.artistDisplay });
    if (artistId) {
      repo.linkAlbumArtist(album.id, artistId, 'main', 0);
      attached += 1;
    }
  }
  return attached;
}

// ---------------------------------------------------------------------------
// Field backfills
// ---------------------------------------------------------------------------

function normalizeArtwork() {
  let changed = 0;
  const albums = all(`SELECT id, cover_url AS coverUrl FROM albums WHERE cover_url LIKE '%mzstatic.com%'`);
  for (const album of albums) {
    const next = normalizeArtworkUrl(album.coverUrl);
    if (next !== album.coverUrl) {
      run(`UPDATE albums SET cover_url = ?, updated_at = ? WHERE id = ?`, [next, nowIso(), album.id]);
      changed += 1;
    }
  }
  const artists = all(
    `SELECT id, avatar_url AS avatarUrl, hero_url AS heroUrl FROM artists
     WHERE avatar_url LIKE '%mzstatic.com%' OR hero_url LIKE '%mzstatic.com%'`
  );
  for (const artist of artists) {
    const avatar = normalizeArtworkUrl(artist.avatarUrl);
    const hero = normalizeArtworkUrl(artist.heroUrl);
    if (avatar !== artist.avatarUrl || hero !== artist.heroUrl) {
      run(`UPDATE artists SET avatar_url = ?, hero_url = ?, updated_at = ? WHERE id = ?`, [
        avatar, hero, nowIso(), artist.id
      ]);
      changed += 1;
    }
  }
  return changed;
}

function backfillAlbumFields() {
  const dates = run(
    `UPDATE albums SET release_date = (
        SELECT MIN(t.release_date) FROM tracks t
        WHERE t.album_id = albums.id AND t.release_date IS NOT NULL AND t.release_date <> ''
     ), updated_at = ?
     WHERE (release_date IS NULL OR release_date = '')
       AND EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = albums.id AND t.release_date IS NOT NULL AND t.release_date <> '')`,
    [nowIso()]
  );
  const counts = run(
    `UPDATE albums SET track_count = (SELECT COUNT(*) FROM tracks t WHERE t.album_id = albums.id), updated_at = ?
     WHERE track_count IS NULL AND EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = albums.id)`,
    [nowIso()]
  );
  const displays = run(
    `UPDATE albums SET artist_display = (
        SELECT ar.name FROM album_artists aa JOIN artists ar ON ar.id = aa.artist_id
        WHERE aa.album_id = albums.id ORDER BY aa.position, ar.name LIMIT 1
     ), updated_at = ?
     WHERE (artist_display IS NULL OR artist_display = '')
       AND EXISTS (SELECT 1 FROM album_artists aa WHERE aa.album_id = albums.id)`,
    [nowIso()]
  );
  return {
    releaseDates: Number(dates.changes || 0),
    trackCounts: Number(counts.changes || 0),
    artistDisplays: Number(displays.changes || 0)
  };
}

function backfillTrackFields() {
  const dates = run(
    `UPDATE tracks SET release_date = (
        SELECT al.release_date FROM albums al WHERE al.id = tracks.album_id
     ), updated_at = ?
     WHERE (release_date IS NULL OR release_date = '') AND album_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM albums al WHERE al.id = tracks.album_id AND al.release_date IS NOT NULL AND al.release_date <> '')`,
    [nowIso()]
  );
  const displays = run(
    `UPDATE tracks SET artist_display = (
        SELECT ar.name FROM track_artists ta JOIN artists ar ON ar.id = ta.artist_id
        WHERE ta.track_id = tracks.id ORDER BY ta.position, ar.name LIMIT 1
     ), updated_at = ?
     WHERE (artist_display IS NULL OR artist_display = '')
       AND EXISTS (SELECT 1 FROM track_artists ta WHERE ta.track_id = tracks.id)`,
    [nowIso()]
  );
  return { releaseDates: Number(dates.changes || 0), artistDisplays: Number(displays.changes || 0) };
}

function backfillBuckets() {
  let artists = 0;
  let albums = 0;
  const clean = (value) => (value && value !== 'unknown' ? value : null);
  for (const row of all(`SELECT id, name, genre, genre_bucket AS bucket, scene FROM artists`)) {
    const bucket = clean(T.genreBucket(row.genre));
    const scene = clean(T.sceneFor(row.name, T.genreBucket(row.genre)));
    if (bucket !== row.bucket || (scene && scene !== row.scene)) {
      run(`UPDATE artists SET genre_bucket = ?, scene = COALESCE(?, scene), updated_at = ? WHERE id = ?`, [
        bucket, scene, nowIso(), row.id
      ]);
      artists += 1;
    }
  }
  for (const row of all(`SELECT id, genre, genre_bucket AS bucket, scene FROM albums`)) {
    const bucket = clean(T.genreBucket(row.genre));
    if (bucket !== row.bucket) {
      run(`UPDATE albums SET genre_bucket = ?, updated_at = ? WHERE id = ?`, [bucket, nowIso(), row.id]);
      albums += 1;
    }
    if (!row.scene || row.scene === 'unknown') repo.applyAlbumScene(row.id);
  }
  return { artists, albums };
}

// Orphan albums that still have no artwork are queued for a provider re-sync
// rather than left blank.
function queueCoverBackfill() {
  const orphans = all(
    `SELECT id, provider, provider_album_id AS providerId FROM albums
     WHERE (cover_url IS NULL OR cover_url = '') AND provider_album_id NOT LIKE 'title:%'`
  );
  let queued = 0;
  for (const album of orphans) {
    repo.enqueueJob({ type: 'album', target: album.id, priority: 1 });
    queued += 1;
  }
  return queued;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const SEED_POSTS = [
  {
    topic: 'recommend',
    title: '安利：把中文说唱的地下现场讲清楚的几张专辑',
    body: '从法老到派克特，再到连麻。地下不是"不好听"，而是还没被算法看见。欢迎在评论里补上你的宝藏。',
    author: 'HIPKOP 编辑部'
  },
  {
    topic: 'release',
    title: '本周新作一起听：Rap 与 K-POP 同步更新',
    body: '首页「新作」每天都在同步。听到好的，直接开一个 topic 安利给别人。',
    author: 'HIPKOP 编辑部'
  },
  {
    topic: 'performance',
    title: '演出话题：你最近看了哪一场现场？',
    body: '说说舞台、氛围和那首让你起鸡皮疙瘩的歌。',
    author: 'HIPKOP 编辑部'
  }
];

function calibrate() {
  const before = repo.consistencyReport();
  const report = transaction(() => {
    // Merging can uncover new duplicates (a stub artist becomes mergeable once
    // its album is attached), so iterate until the catalog is stable. Cap the
    // passes so a pathological cycle can never spin forever.
    let mergedArtists = 0;
    let mergedAlbums = 0;
    let mergedTracks = 0;
    let attachedArtists = 0;
    for (let pass = 0; pass < 5; pass += 1) {
      const artists = mergeArtists();
      const stubAlbums = mergeStubAlbums();
      const duplicateAlbums = mergeDuplicateAlbums();
      const duplicateTracks = mergeDuplicateTracks();
      const attached = attachMissingAlbumArtists();
      mergedArtists += artists;
      mergedAlbums += stubAlbums + duplicateAlbums;
      mergedTracks += duplicateTracks;
      attachedArtists += attached;
      if (!artists && !stubAlbums && !duplicateAlbums && !duplicateTracks && !attached) break;
    }
    const artwork = normalizeArtwork();
    const albumFields = backfillAlbumFields();
    const trackFields = backfillTrackFields();
    const buckets = backfillBuckets();
    const coverJobs = queueCoverBackfill();
    const seededPosts = repo.seedPostsIfEmpty(SEED_POSTS);
    return {
      mergedArtists, mergedAlbums, mergedTracks, attachedArtists, artwork,
      albumFields, trackFields, buckets, coverJobs, seededPosts
    };
  });
  const after = repo.consistencyReport();
  return { ranAt: nowIso(), before, after, ...report };
}

module.exports = { calibrate, normalizeArtworkUrl, SEED_POSTS };