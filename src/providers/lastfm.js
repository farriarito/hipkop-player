'use strict';

// Last.fm provider — optional, enabled only when LASTFM_API_KEY is set.
// It supplies artist biographies and portrait images (real avatars) that the
// keyless providers cannot always provide.

const config = require('../config');
const { fetchJson } = require('../util/http');
const N = require('../normalize');

const PROVIDER = 'lastfm';
const BASE = 'https://ws.audioscrobbler.com/2.0/';

const pickImage = (images) => {
  if (!Array.isArray(images)) return null;
  const order = ['mega', 'extralarge', 'large', 'medium'];
  for (const size of order) {
    const match = images.find((image) => image.size === size && image['#text']);
    if (match) return match['#text'];
  }
  return null;
};

const normalizeArtist = (item) => {
  const name = N.cleanText(item.name, 200) || 'Unknown Artist';
  const stats = item.stats || {};
  return {
    id: N.artistId(PROVIDER, name, name),
    provider: PROVIDER,
    providerId: name,
    name,
    sortName: name,
    genre: N.cleanText(item.tags?.tag?.[0]?.name, 80),
    region: null,
    bio: N.cleanText(item.bio?.summary, 500),
    avatarUrl: pickImage(item.image),
    avatarSource: 'lastfm',
    heroUrl: pickImage(item.image),
    externalUrl: item.url || null,
    popularity: Number.isFinite(Number(stats.listeners)) ? Number(stats.listeners) : null
  };
};

const apiUrl = (params) => {
  const url = new URL(BASE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('api_key', config.lastfmApiKey);
  url.searchParams.set('format', 'json');
  return url.toString();
};

async function getArtistInfo(name) {
  const data = await fetchJson(apiUrl({ method: 'artist.getinfo', artist: name }));
  if (!data.artist) throw new Error('lastfm_not_found');
  return normalizeArtist(data.artist);
}

module.exports = {
  name: PROVIDER,
  label: 'Last.fm',
  homepage: 'https://www.last.fm/api',
  license: 'Last.fm API — requires an API key; artist metadata & images',
  requiresKey: true,
  enabled: Boolean(config.lastfmApiKey),
  supports: ['avatar', 'bio', 'enrichment'],
  getArtistInfo
};