'use strict';

// iTunes / Apple Music provider.
//
// Uses only the public iTunes Search & Lookup API (no key, no login, allowed
// for metadata + artwork linking). It is the default provider because it covers
// Rap and K-POP catalogs globally and returns real cover artwork.

const config = require('../config');
const { fetchJson } = require('../util/http');
const log = require('../util/logger')('provider:itunes');
const N = require('../normalize');

const PROVIDER = 'itunes';
const BASE = 'https://itunes.apple.com';

const artworkAt = (url, size = 900) => {
  if (!url) return null;
  return String(url)
    .replace(/\d+x\d+bb/gi, `${size}x${size}bb`)
    .replace(/\d+x\d+(?=\.(jpg|jpeg|png|webp))/gi, `${size}x${size}`);
};

const toIsoDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const normalizeArtist = (item) => {
  const providerId = item.artistId !== undefined ? String(item.artistId) : null;
  const name = N.cleanText(item.artistName, 200) || 'Unknown Artist';
  return {
    id: N.artistId(PROVIDER, providerId, name),
    provider: PROVIDER,
    providerId,
    name,
    sortName: name,
    genre: N.cleanText(item.primaryGenreName, 80),
    region: null,
    bio: null,
    avatarUrl: null,
    avatarSource: null,
    heroUrl: null,
    externalUrl: item.artistLinkUrl || (providerId ? `https://music.apple.com/artist/${providerId}` : null),
    popularity: null
  };
};

const normalizeAlbum = (item) => {
  const providerId = item.collectionId !== undefined ? String(item.collectionId) : null;
  const title = N.cleanText(item.collectionName, 300) || 'Untitled';
  const id = N.albumId(PROVIDER, providerId, title);
  const trackCount = Number.isFinite(item.trackCount) ? item.trackCount : null;
  return {
    id,
    provider: PROVIDER,
    providerId,
    kind: N.kindForAlbum(trackCount, title),
    title,
    artistDisplay: N.cleanText(item.artistName, 200),
    artistRefs: item.artistName
      ? [N.normalizeArtistRef(PROVIDER, item.artistId, item.artistName)]
      : [],
    coverUrl: artworkAt(item.artworkUrl100, 900),
    releaseDate: toIsoDate(item.releaseDate),
    genre: N.cleanText(item.primaryGenreName, 80),
    trackCount,
    score: N.editorialScore(id),
    popularity: null,
    description: null,
    externalUrl: item.collectionViewUrl || null
  };
};

const normalizeTrack = (item) => {
  const providerId = item.trackId !== undefined ? String(item.trackId) : null;
  const title = N.cleanText(item.trackName, 300) || 'Untitled';
  const id = N.trackId(PROVIDER, providerId, title);
  const albumRef = item.collectionId
    ? {
        provider: PROVIDER,
        providerId: String(item.collectionId),
        title: N.cleanText(item.collectionName, 300),
        coverUrl: artworkAt(item.artworkUrl100, 900),
        releaseDate: toIsoDate(item.releaseDate),
        genre: N.cleanText(item.primaryGenreName, 80)
      }
    : null;
  return {
    id,
    provider: PROVIDER,
    providerId,
    title,
    albumRef,
    albumId: null,
    artistRefs: item.artistName
      ? [N.normalizeArtistRef(PROVIDER, item.artistId, item.artistName)]
      : [],
    artistDisplay: N.cleanText(item.artistName, 200),
    trackNumber: Number.isFinite(item.trackNumber) ? item.trackNumber : null,
    discNumber: Number.isFinite(item.discNumber) ? item.discNumber : null,
    durationMs: Number.isFinite(item.trackTimeMillis) ? item.trackTimeMillis : null,
    previewUrl: item.previewUrl || null,
    releaseDate: toIsoDate(item.releaseDate),
    genre: N.cleanText(item.primaryGenreName, 80),
    popularity: null
  };
};

const searchUrl = (term, country, limit) =>
  `${BASE}/search?term=${encodeURIComponent(term)}&media=music&entity=song,album,musicArtist` +
  `&limit=${limit}&country=${country}`;

const lookupUrl = (id, entity, country, limit = 200) =>
  `${BASE}/lookup?id=${encodeURIComponent(id)}&entity=${entity}&limit=${limit}&country=${country}`;

const splitResults = (results) => {
  const artists = [];
  const albums = [];
  const tracks = [];
  for (const item of results || []) {
    if (!item) continue;
    if (item.wrapperType === 'artist') artists.push(normalizeArtist(item));
    else if (item.wrapperType === 'collection') albums.push(normalizeAlbum(item));
    else if (item.wrapperType === 'track' && item.kind !== 'podcast' && item.trackName) tracks.push(normalizeTrack(item));
  }
  return { artists, albums, tracks };
};

async function search(query, { limit = 50 } = {}) {
  const countries = config.itunesCountries.length ? config.itunesCountries : ['US'];
  let lastError = null;
  for (const country of countries) {
    try {
      const data = await fetchJson(searchUrl(query, country, limit));
      const grouped = splitResults(data.results);
      if (grouped.artists.length || grouped.albums.length || grouped.tracks.length) {
        grouped.country = country;
        return grouped;
      }
    } catch (error) {
      lastError = error;
      log.warn(`search failed [${country}]`, error.message);
    }
  }
  if (lastError) throw lastError;
  return { artists: [], albums: [], tracks: [], country: countries[0] };
}

async function getAlbum(providerId, { country = config.itunesCountries[0] } = {}) {
  const data = await fetchJson(lookupUrl(providerId, 'song', country, 200));
  const grouped = splitResults(data.results);
  const album = grouped.albums[0] || null;
  return { album, tracks: grouped.tracks };
}

async function getArtist(providerId, { country = config.itunesCountries[0] } = {}) {
  const data = await fetchJson(lookupUrl(providerId, 'musicArtist', country, 1));
  const grouped = splitResults(data.results);
  return grouped.artists[0] || null;
}

async function getArtistAlbums(providerId, { country = config.itunesCountries[0] } = {}) {
  const data = await fetchJson(lookupUrl(providerId, 'album', country, 200));
  return splitResults(data.results).albums;
}

async function getArtistTracks(providerId, { country = config.itunesCountries[0] } = {}) {
  const data = await fetchJson(lookupUrl(providerId, 'song', country, 200));
  return splitResults(data.results).tracks;
}

async function getTrack(providerId, { country = config.itunesCountries[0] } = {}) {
  const data = await fetchJson(lookupUrl(providerId, 'song', country, 5));
  return splitResults(data.results).tracks[0] || null;
}

module.exports = {
  name: PROVIDER,
  label: 'iTunes / Apple Music',
  homepage: 'https://performance-partners.apple.com/search-api',
  license: 'Apple public iTunes Search API — metadata & artwork linking only',
  requiresKey: false,
  supports: ['search', 'artist', 'album', 'track', 'charts-rss'],
  artworkAt,
  toIsoDate,
  search,
  getArtist,
  getAlbum,
  getTrack,
  getArtistAlbums,
  getArtistTracks
};