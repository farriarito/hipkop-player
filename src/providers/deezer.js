'use strict';

// Deezer provider — public, no key. Enabled by default because it returns real
// artist portraits (used for avatars) and album covers. The registry marks it
// unavailable automatically if the network blocks it, so it never blocks search.

const { fetchJson } = require('../util/http');
const N = require('../normalize');

const PROVIDER = 'deezer';
const BASE = 'https://api.deezer.com';

const normalizeArtist = (item) => {
  const providerId = item.id !== undefined ? String(item.id) : null;
  const name = N.cleanText(item.name, 200) || 'Unknown Artist';
  const picture = item.picture_xl || item.picture_big || item.picture_medium || null;
  return {
    id: N.artistId(PROVIDER, providerId, name),
    provider: PROVIDER,
    providerId,
    name,
    sortName: name,
    genre: null,
    region: null,
    bio: null,
    avatarUrl: picture,
    avatarSource: picture ? 'deezer' : null,
    heroUrl: picture,
    externalUrl: item.link || null,
    popularity: Number.isFinite(item.nb_fan) ? item.nb_fan : null
  };
};

const normalizeAlbum = (item) => {
  const providerId = item.id !== undefined ? String(item.id) : null;
  const title = N.cleanText(item.title, 300) || 'Untitled';
  const id = N.albumId(PROVIDER, providerId, title);
  return {
    id,
    provider: PROVIDER,
    providerId,
    kind: N.kindForAlbum(item.nb_tracks, title),
    title,
    artistDisplay: N.cleanText(item.artist?.name, 200),
    artistRefs: item.artist
      ? [N.normalizeArtistRef(PROVIDER, item.artist.id, item.artist.name)]
      : [],
    coverUrl: item.cover_xl || item.cover_big || null,
    releaseDate: N.cleanText(item.release_date, 10),
    genre: null,
    trackCount: Number.isFinite(item.nb_tracks) ? item.nb_tracks : null,
    score: N.editorialScore(id),
    popularity: Number.isFinite(item.rank) ? item.rank : null,
    description: null,
    externalUrl: item.link || null
  };
};

const normalizeTrack = (item) => {
  const providerId = item.id !== undefined ? String(item.id) : null;
  const title = N.cleanText(item.title, 300) || 'Untitled';
  const id = N.trackId(PROVIDER, providerId, title);
  return {
    id,
    provider: PROVIDER,
    providerId,
    title,
    albumRef: item.album
      ? {
          provider: PROVIDER,
          providerId: String(item.album.id),
          title: N.cleanText(item.album.title, 300),
          coverUrl: item.album.cover_xl || item.album.cover_big || null
        }
      : null,
    albumId: null,
    artistRefs: item.artist
      ? [N.normalizeArtistRef(PROVIDER, item.artist.id, item.artist.name)]
      : [],
    artistDisplay: N.cleanText(item.artist?.name, 200),
    trackNumber: null,
    discNumber: null,
    durationMs: Number.isFinite(item.duration) ? item.duration * 1000 : null,
    previewUrl: item.preview || null,
    releaseDate: null,
    genre: null,
    popularity: Number.isFinite(item.rank) ? item.rank : null
  };
};

async function search(queryText, { limit = 40 } = {}) {
  const [artists, albums, tracks] = await Promise.allSettled([
    fetchJson(`${BASE}/search/artist?q=${encodeURIComponent(queryText)}&limit=${limit}`),
    fetchJson(`${BASE}/search/album?q=${encodeURIComponent(queryText)}&limit=${limit}`),
    fetchJson(`${BASE}/search/track?q=${encodeURIComponent(queryText)}&limit=${limit}`)
  ]);
  const pick = (result, mapper) =>
    result.status === 'fulfilled' ? (result.value.data || []).map(mapper) : [];
  return {
    artists: pick(artists, normalizeArtist),
    albums: pick(albums, normalizeAlbum),
    tracks: pick(tracks, normalizeTrack)
  };
}

async function getArtist(providerId) {
  const data = await fetchJson(`${BASE}/artist/${encodeURIComponent(providerId)}`);
  if (data.error) throw new Error(`deezer_${data.error.code}`);
  return normalizeArtist(data);
}

async function getArtistAlbums(providerId, { limit = 100 } = {}) {
  const data = await fetchJson(`${BASE}/artist/${encodeURIComponent(providerId)}/albums?limit=${limit}`);
  return (data.data || []).map(normalizeAlbum);
}

async function getArtistTracks(providerId, { limit = 50 } = {}) {
  const data = await fetchJson(`${BASE}/artist/${encodeURIComponent(providerId)}/top?limit=${limit}`);
  return (data.data || []).map(normalizeTrack);
}

async function getAlbum(providerId) {
  const data = await fetchJson(`${BASE}/album/${encodeURIComponent(providerId)}`);
  if (data.error) throw new Error(`deezer_${data.error.code}`);
  const album = normalizeAlbum(data);
  const tracks = (data.tracks?.data || []).map((item) =>
    normalizeTrack({ ...item, artist: data.artist, album: { id: data.id, title: data.title, cover_xl: data.cover_xl } })
  );
  return { album, tracks };
}

module.exports = {
  name: PROVIDER,
  label: 'Deezer',
  homepage: 'https://developers.deezer.com/api',
  license: 'Deezer public API — metadata & artwork linking (non-commercial)',
  requiresKey: false,
  deadlineMs: 4500,
  supports: ['search', 'artist', 'album', 'track', 'avatar'],
  search,
  getArtist,
  getArtistAlbums,
  getArtistTracks,
  getAlbum
};