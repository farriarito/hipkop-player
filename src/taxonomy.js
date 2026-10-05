'use strict';

// Cross-genre taxonomy: the product thesis is that mainstream HipHop,
// underground HipHop and K-POP listeners speak the same language. Metadata only
// gives us a genre, so:
//   genreBucket -> kpop | hiphop | other        (derived automatically)
//   scene       -> mainstream | underground | unknown
// "Scene" is a curation axis (no provider exposes it), so it comes from
// configurable artist lists in config.js and can be extended via env vars.

const config = require('./config');

const key = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();

const KPOP_PATTERNS = [/k-?\s?pop/, /korean\s?pop/];
const HIPHOP_PATTERNS = [/hip[\s-]?hop/, /\brap\b/, /trap/, /drill/, /grime/, /boom\s?bap/];

const genreBucket = (genre) => {
  const value = String(genre || '').toLowerCase();
  if (!value) return 'unknown';
  if (KPOP_PATTERNS.some((re) => re.test(value))) return 'kpop';
  if (HIPHOP_PATTERNS.some((re) => re.test(value))) return 'hiphop';
  return 'other';
};

const mainstreamKeys = new Set(config.mainstreamArtists.map(key).filter(Boolean));
const undergroundKeys = new Set(config.undergroundArtists.map(key).filter(Boolean));

// Match on a normalised prefix so "法老" matches "法老 (Pharaoh)" and
// "连麻Swimming" matches "连麻".
const matches = (haystack, needle) => haystack === needle || haystack.startsWith(needle) || needle.startsWith(haystack);

const sceneFor = (artistName, bucket) => {
  const name = key(artistName);
  if (name) {
    for (const entry of undergroundKeys) if (matches(name, entry)) return 'underground';
    for (const entry of mainstreamKeys) if (matches(name, entry)) return 'mainstream';
  }
  if (bucket === 'kpop') return 'mainstream';
  return 'unknown';
};

module.exports = { genreBucket, sceneFor, key };