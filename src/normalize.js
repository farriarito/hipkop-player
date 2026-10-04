'use strict';

// Unified catalog model helpers.
//
// Every provider is mapped into the same shapes before touching the database:
//   Artist { id, provider, providerId, name, ... }
//   Album  { id, provider, providerId, kind, title, artistRefs[], tracks[] }
//   Track  { id, provider, providerId, title, albumRef, artistRefs[] }
// The rest of the app never reads provider payload fields directly.

const slugify = (value) =>
  String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown';

const entityId = (provider, kind, providerId, fallback) =>
  `${provider}-${kind}-${providerId !== undefined && providerId !== null && providerId !== ''
    ? providerId
    : slugify(fallback)}`;

const artistId = (provider, providerId, name) => entityId(provider, 'artist', providerId, name);
const albumId = (provider, providerId, title) => entityId(provider, 'album', providerId, title);
const trackId = (provider, providerId, title) => entityId(provider, 'track', providerId, title);

const hashString = (value) => {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

// Real user scores/comments do not exist yet, so charts need a deterministic
// stand-in. It is derived from stable metadata (never random) and clearly
// labelled as editorial in the UI. Provider popularity always wins when present.
const editorialScore = (seed) => Math.round((7.4 + (hashString(`score:${seed}`) % 2200) / 1000) * 10) / 10;
const editorialPopularity = (seed) => hashString(`pop:${seed}`) % 100;

const cleanText = (value, max = 400) => {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const normalizeArtistRef = (provider, providerId, name, role = 'main', position = 0) => ({
  provider,
  providerId: providerId === undefined ? null : providerId,
  name: cleanText(name, 200) || 'Unknown Artist',
  role,
  position
});

const kindForAlbum = (trackCount, title) => {
  const t = String(title || '').toLowerCase();
  if (/\b(single|ep)\b/.test(t) && (trackCount ?? 0) <= 6) return 'single';
  if ((trackCount ?? 0) > 0 && trackCount <= 3) return 'single';
  return 'album';
};

module.exports = {
  slugify,
  entityId,
  artistId,
  albumId,
  trackId,
  hashString,
  editorialScore,
  editorialPopularity,
  cleanText,
  normalizeArtistRef,
  kindForAlbum
};