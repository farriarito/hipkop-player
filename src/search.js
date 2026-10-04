'use strict';

// Search pipeline required by the handoff:
//   user input -> local DB -> (if thin) providers -> normalize -> persist
//   -> relations -> real covers/avatars.
// Static arrays are only ever an offline fallback in the browser, never a source.

const repo = require('./repo');
const providers = require('./providers');
const log = require('./util/logger')('search');

const LOCAL_MIN = 5;

const nameKey = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

function dedupe(list, keyOf, prefer) {
  const map = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing || prefer(item, existing)) map.set(key, item);
  }
  return [...map.values()];
}

const artistKey = (artist) => nameKey(artist.name);
const albumKey = (album) => `${nameKey(album.title)}|${nameKey(album.artistDisplay || album.primaryArtistName)}`;
const trackKey = (track) => `${nameKey(track.title)}|${nameKey(track.artistDisplay)}`;

// Prefer the richer record (has artwork/genre), otherwise keep the first.
const preferRicher = (candidate, current) => {
  const score = (row) =>
    (row.avatarUrl || row.coverUrl ? 2 : 0) +
    (row.genre ? 1 : 0) +
    (row.primaryArtistId || row.provider === 'itunes' ? 1 : 0);
  return score(candidate) > score(current);
};

// Rank exact/prefix name matches first so "Kendrick Lamar" surfaces the artist
// himself before "Baby Keem & Kendrick Lamar".
const relevance = (text, query) => {
  const value = nameKey(text);
  const target = nameKey(query);
  if (!value) return 0;
  if (value === target) return 4;
  if (value.startsWith(target)) return 3;
  if (value.includes(target)) return 2;
  return 1;
};

const rankByQuery = (list, textOf, query) =>
  [...list].sort(
    (a, b) =>
      relevance(textOf(b), query) - relevance(textOf(a), query) ||
      Number(b.popularity || 0) - Number(a.popularity || 0) ||
      String(textOf(a)).localeCompare(String(textOf(b)))
  );

function persistResults(remote) {
  for (const artist of remote.artists || []) {
    try { repo.persistArtist(artist); } catch (error) { log.warn(`persist artist failed: ${error.message}`); }
  }
  for (const album of remote.albums || []) {
    try { repo.persistAlbum(album, []); } catch (error) { log.warn(`persist album failed: ${error.message}`); }
  }
  for (const track of remote.tracks || []) {
    try { repo.upsertTrack(track); } catch (error) { log.warn(`persist track failed: ${error.message}`); }
  }
}

async function search(rawQuery, { page = 1, pageSize = 20, forceRemote = false } = {}) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    return { query, page, pageSize, cached: true, providers: [], artists: [], albums: [], tracks: [] };
  }

  const local = repo.searchLocal(query, { limit: pageSize * 3 });
  const localCount = local.artists.length + local.albums.length + local.tracks.length;
  let usedProviders = false;
  let remoteProviders = [];
  let remoteError = null;

  if (forceRemote || localCount < LOCAL_MIN) {
    try {
      const remote = await providers.search(query, { limit: 40 });
      remoteProviders = remote.providers || [];
      persistResults(remote);
      usedProviders = true;
    } catch (error) {
      remoteError = error.message;
      log.warn(`remote search failed for "${query}": ${error.message}`);
    }
  }

  // Re-read from the DB so every returned row has canonical ids + relations.
  const rows = repo.searchLocal(query, { limit: pageSize * 4 });
  const artists = rankByQuery(dedupe(rows.artists, artistKey, preferRicher), (a) => a.name, query).slice(0, pageSize);
  const albums = rankByQuery(dedupe(rows.albums, albumKey, preferRicher), (a) => a.title, query).slice(0, pageSize);
  const tracks = rankByQuery(dedupe(rows.tracks, trackKey, preferRicher), (t) => t.title, query).slice(0, pageSize);

  return {
    query,
    page,
    pageSize,
    cached: !usedProviders,
    providers: remoteProviders,
    error: remoteError,
    artists,
    albums,
    tracks,
    counts: { artists: artists.length, albums: albums.length, tracks: tracks.length }
  };
}

module.exports = { search, persistResults, dedupe };