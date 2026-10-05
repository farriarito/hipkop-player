'use strict';

// HIPKOP catalog schema. SQLite (via node:sqlite) is the default store; the
// statements below are intentionally ANSI-ish so a PostgreSQL migration can
// reuse the same column set.

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS metadata_sources (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  homepage      TEXT,
  license       TEXT,
  requires_key  INTEGER NOT NULL DEFAULT 0,
  enabled       INTEGER NOT NULL DEFAULT 1,
  note          TEXT,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artists (
  id                 TEXT PRIMARY KEY,
  provider           TEXT NOT NULL,
  provider_artist_id TEXT NOT NULL,
  name               TEXT NOT NULL,
  sort_name          TEXT,
  genre              TEXT,
  genre_bucket       TEXT,
  scene              TEXT,
  region             TEXT,
  bio                TEXT,
  avatar_url         TEXT,
  avatar_source      TEXT,
  hero_url           TEXT,
  external_url       TEXT,
  popularity         REAL,
  synced_at          TEXT,
  sync_status        TEXT NOT NULL DEFAULT 'ok',
  sync_error         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (provider, provider_artist_id)
);
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists (name);

CREATE TABLE IF NOT EXISTS albums (
  id                 TEXT PRIMARY KEY,
  provider           TEXT NOT NULL,
  provider_album_id  TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'album',
  title              TEXT NOT NULL,
  artist_display     TEXT,
  cover_url          TEXT,
  release_date       TEXT,
  genre              TEXT,
  genre_bucket       TEXT,
  scene              TEXT,
  track_count        INTEGER,
  score              REAL,
  popularity         REAL,
  comments           INTEGER NOT NULL DEFAULT 0,
  description        TEXT,
  external_url       TEXT,
  chart_source       TEXT,
  qq_album_mid       TEXT,
  qq_listen_song_mid TEXT,
  netease_album_id   TEXT,
  synced_at          TEXT,
  sync_status        TEXT NOT NULL DEFAULT 'ok',
  sync_error         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (provider, provider_album_id)
);
CREATE INDEX IF NOT EXISTS idx_albums_release ON albums (release_date DESC);
CREATE INDEX IF NOT EXISTS idx_albums_title ON albums (title);

CREATE TABLE IF NOT EXISTS tracks (
  id                 TEXT PRIMARY KEY,
  provider           TEXT NOT NULL,
  provider_track_id  TEXT NOT NULL,
  title              TEXT NOT NULL,
  album_id           TEXT REFERENCES albums (id) ON DELETE SET NULL,
  artist_display     TEXT,
  track_number       INTEGER,
  disc_number        INTEGER,
  duration_ms        INTEGER,
  preview_url        TEXT,
  release_date       TEXT,
  genre              TEXT,
  genre_bucket       TEXT,
  popularity         REAL,
  qq_song_mid        TEXT,
  netease_song_id    TEXT,
  synced_at          TEXT,
  sync_status        TEXT NOT NULL DEFAULT 'ok',
  sync_error         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (provider, provider_track_id)
);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks (album_id);

CREATE TABLE IF NOT EXISTS album_artists (
  album_id   TEXT NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
  artist_id  TEXT NOT NULL REFERENCES artists (id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'main',
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, artist_id, role)
);
CREATE INDEX IF NOT EXISTS idx_album_artists_artist ON album_artists (artist_id);

CREATE TABLE IF NOT EXISTS track_artists (
  track_id   TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  artist_id  TEXT NOT NULL REFERENCES artists (id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'main',
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (track_id, artist_id, role)
);
CREATE INDEX IF NOT EXISTS idx_track_artists_artist ON track_artists (artist_id);

CREATE TABLE IF NOT EXISTS cover_cache (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url   TEXT NOT NULL UNIQUE,
  local_path   TEXT,
  content_type TEXT,
  bytes        INTEGER,
  width        INTEGER,
  height       INTEGER,
  status       TEXT NOT NULL DEFAULT 'pending',
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,
  target       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  priority     INTEGER NOT NULL DEFAULT 0,
  payload      TEXT,
  last_error   TEXT,
  next_run_at  INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_due ON sync_jobs (status, next_run_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_jobs_active
  ON sync_jobs (type, IFNULL(target, '')) WHERE status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS album_aliases (
  provider          TEXT NOT NULL,
  provider_album_id TEXT NOT NULL,
  album_id          TEXT NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (provider, provider_album_id)
);
CREATE INDEX IF NOT EXISTS idx_album_aliases_album ON album_aliases (album_id);

CREATE TABLE IF NOT EXISTS community_posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic      TEXT NOT NULL DEFAULT 'general',
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  author     TEXT NOT NULL DEFAULT 'HIPKOP 社区',
  album_id   TEXT REFERENCES albums (id) ON DELETE SET NULL,
  artist_id  TEXT REFERENCES artists (id) ON DELETE SET NULL,
  likes      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_topic ON community_posts (topic, created_at DESC);

CREATE TABLE IF NOT EXISTS artist_taxonomy (
  artist_id    TEXT PRIMARY KEY REFERENCES artists (id) ON DELETE CASCADE,
  genre_bucket TEXT,
  genre        TEXT,
  confidence   REAL NOT NULL DEFAULT 0,
  reason       TEXT,
  evidence     TEXT,
  evidence_key TEXT,
  backend      TEXT NOT NULL DEFAULT 'heuristic',
  status       TEXT NOT NULL DEFAULT 'suggested',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artist_taxonomy_status ON artist_taxonomy (status);
`;

// Columns added after the first release. Applied by db.js for databases that
// already exist, because CREATE TABLE IF NOT EXISTS does not alter old tables.
const MIGRATIONS = [
  ['artists', 'genre_bucket', 'TEXT'],
  ['artists', 'scene', 'TEXT'],
  ['albums', 'genre_bucket', 'TEXT'],
  ['albums', 'scene', 'TEXT'],
  ['albums', 'qq_album_mid', 'TEXT'],
  ['albums', 'qq_listen_song_mid', 'TEXT'],
  ['albums', 'netease_album_id', 'TEXT'],
  ['tracks', 'genre_bucket', 'TEXT'],
  ['tracks', 'qq_song_mid', 'TEXT'],
  ['tracks', 'netease_song_id', 'TEXT']
];

module.exports = { SCHEMA, MIGRATIONS, schema: SCHEMA };
