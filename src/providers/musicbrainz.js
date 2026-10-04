'use strict';

// MusicBrainz provider — public, no key. Used for artist enrichment (country,
// disambiguation, genres, official links) and as an artist fallback when the
// primary provider has no match. Images are intentionally left null here:
// Cover Art Archive availability is unstable, and covers come from iTunes.

const config = require('../config');
const { fetchJson } = require('../util/http');
const log = require('../util/logger')('provider:musicbrainz');
const N = require('../normalize');

const PROVIDER = 'musicbrainz';
const BASE = 'https://musicbrainz.org/ws/2';
const headers = { 'User-Agent': config.musicbrainzUserAgent };

const mbid = (value) => (value ? String(value) : null);

const normalizeArtist = (item) => {
  const providerId = mbid(item.id);
  const name = N.cleanText(item.name, 200) || 'Unknown Artist';
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const genres = Array.isArray(item.genres) ? item.genres : [];
  const genre =
    (genres[0] && genres[0].name) || (tags[0] && tags[0].name) || null;
  return {
    id: N.artistId(PROVIDER, providerId, name),
    provider: PROVIDER,
    providerId,
    name,
    sortName: N.cleanText(item['sort-name'], 200),
    genre: N.cleanText(genre, 80),
    region: N.cleanText(item.country || item.area?.name, 80),
    bio: N.cleanText(item.disambiguation, 300),
    avatarUrl: null,
    avatarSource: null,
    heroUrl: null,
    externalUrl: providerId ? `https://musicbrainz.org/artist/${providerId}` : null,
    popularity: null
  };
};

const typeToKind = (type) => {
  const value = String(type || '').toLowerCase();
  if (value.includes('single') || value.includes('ep')) return 'single';
  return 'album';
};

const normalizeReleaseGroup = (item) => {
  const providerId = mbid(item.id);
  const title = N.cleanText(item.title, 300) || 'Untitled';
  const id = N.albumId(PROVIDER, providerId, title);
  const artistCredit = Array.isArray(item['artist-credit']) ? item['artist-credit'] : [];
  const artistRefs = artistCredit
    .filter((credit) => credit && credit.artist)
    .map((credit, index) =>
      N.normalizeArtistRef(PROVIDER, credit.artist.id, credit.artist.name, 'main', index)
    );
  return {
    id,
    provider: PROVIDER,
    providerId,
    kind: typeToKind(item['primary-type'] || item['secondary-types']?.[0]),
    title,
    artistDisplay: artistRefs.map((ref) => ref.name).join(', ') || null,
    artistRefs,
    coverUrl: null,
    releaseDate: N.cleanText(item['first-release-date'], 10),
    genre: null,
    trackCount: null,
    score: N.editorialScore(id),
    popularity: null,
    description: null,
    externalUrl: providerId ? `https://musicbrainz.org/release-group/${providerId}` : null
  };
};

const normalizeRecording = (item) => {
  const providerId = mbid(item.id);
  const title = N.cleanText(item.title, 300) || 'Untitled';
  const id = N.trackId(PROVIDER, providerId, title);
  const artistCredit = Array.isArray(item['artist-credit']) ? item['artist-credit'] : [];
  const artistRefs = artistCredit
    .filter((credit) => credit && credit.artist)
    .map((credit, index) =>
      N.normalizeArtistRef(PROVIDER, credit.artist.id, credit.artist.name, 'main', index)
    );
  const release = Array.isArray(item.releases) ? item.releases[0] : null;
  return {
    id,
    provider: PROVIDER,
    providerId,
    title,
    albumRef: release
      ? { provider: PROVIDER, providerId: release.id, title: release.title, coverUrl: null }
      : null,
    albumId: null,
    artistRefs,
    artistDisplay: artistRefs.map((ref) => ref.name).join(', ') || null,
    trackNumber: null,
    discNumber: null,
    durationMs: Number.isFinite(item.length) ? item.length : null,
    previewUrl: null,
    releaseDate: release ? N.cleanText(release.date, 10) : null,
    genre: null,
    popularity: null
  };
};

const query = (entity, term, limit) =>
  `${BASE}/${entity}/?query=${encodeURIComponent(term)}&fmt=json&limit=${limit}`;

async function search(queryText, { limit = 25 } = {}) {
  const [artists, releases, recordings] = await Promise.allSettled([
    fetchJson(query('artist', queryText, limit), { headers }),
    fetchJson(query('release-group', queryText, limit), { headers }),
    fetchJson(query('recording', queryText, limit), { headers })
  ]);
  const pick = (result, key, mapper) =>
    result.status === 'fulfilled' ? (result.value[key] || []).map(mapper) : [];
  const out = {
    artists: pick(artists, 'artists', normalizeArtist),
    albums: pick(releases, 'release-groups', normalizeReleaseGroup),
    tracks: pick(recordings, 'recordings', normalizeRecording)
  };
  if (!out.artists.length && !out.albums.length && !out.tracks.length) {
    const failed = [artists, releases, recordings].find((r) => r.status === 'rejected');
    if (failed) log.warn('search failed', failed.reason?.message);
  }
  return out;
}

async function getArtist(providerId) {
  const data = await fetchJson(
    `${BASE}/artist/${encodeURIComponent(providerId)}?fmt=json&inc=url-rels+tags+genres`,
    { headers }
  );
  const artist = normalizeArtist(data);
  const relations = Array.isArray(data.relations) ? data.relations : [];
  const homepage = relations.find(
    (rel) => rel.type === 'official homepage' && rel.url?.resource
  );
  if (homepage) artist.externalUrl = homepage.url.resource;
  return artist;
}

async function getArtistAlbums(providerId, { limit = 100 } = {}) {
  const data = await fetchJson(
    `${BASE}/release-group?artist=${encodeURIComponent(providerId)}&fmt=json&limit=${limit}`,
    { headers }
  );
  return (data['release-groups'] || []).map(normalizeReleaseGroup);
}

module.exports = {
  name: PROVIDER,
  label: 'MusicBrainz',
  homepage: 'https://musicbrainz.org/doc/MusicBrainz_API',
  license: 'MusicBrainz data is CC0 / public domain',
  requiresKey: false,
  supports: ['search', 'artist', 'albums', 'enrichment'],
  search,
  getArtist,
  getArtistAlbums
};