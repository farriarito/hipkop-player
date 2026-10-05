'use strict';

// Cross-genre taxonomy: the product thesis is that HipHop and K-POP listeners
// speak the same language. Metadata only gives us a genre, so:
//   genreBucket -> kpop | hiphop | other        (derived automatically)
//   scene       -> mainstream | underground | unknown
// "Scene" is a curation axis (no provider exposes it), so it comes from
// configurable artist lists in config.js and can be extended via env vars.
//
// The keyword sets below are the single source of truth for both the album
// bucket (here) and the artist bucket (agents/classify.js), so the two can no
// longer drift apart. They cover the non-Latin genre tags iTunes really ships -
// "힙합/랩", "ヒップホップ", "说唱" - which used to fall
// through to "other" and hid real Hip-Hop releases from the HipHop chart.

const config = require('./config');

const key = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();

// K-Pop is tested before the generic pop keyword on purpose: "케이팝" contains
// "팝", and K-Pop has to win. "korean pop" stays narrow so that an album
// tagged "Korean Hip-Hop" is still bucketed as hiphop.
const KPOP_PATTERNS = [/k-?\s?pop/, /korean\s?pop/, /케이팝/];

const HIPHOP_PATTERNS = [
  /hip[\s-]?hop/, /\brap\b/, /trap/, /drill/, /grime/, /boom\s?bap/,
  /说唱/, /嘻哈/, /説唱/, /驛舌/,
  /힙합/, /랩/, /ヒップホップ/, /ラップ/
];

const OTHER_PATTERNS = [
  /r&b/, /soul/, /pop/, /dance/, /electronic/, /mandopop/, /j-?pop/, /rock/,
  /country/, /soundtrack/, /alternative/, /classical/, /jazz/, /metal/,
  /reggae/, /ballad/, /indie/, /music/, /anime/,
  /록/, /팝/, /음악/, /댄스/, /소울/,
  /재즈/, /클래식/, /메탈/, /얼터너티브/,
  /ロック/, /ポップ/, /ミュージック/, /ジャズ/, /メタル/,
  /オルタナティブ/, /サウンドトラック/, /アニメ/
];

const combine = (patterns) => new RegExp(patterns.map((re) => re.source).join('|'), 'i');

// Combined, non-global regexes are safe to reuse: without the /g flag `test`
// keeps no lastIndex state.
const KPOP_RE = combine(KPOP_PATTERNS);
const HIPHOP_RE = combine(HIPHOP_PATTERNS);
const OTHER_RE = combine(OTHER_PATTERNS);

const genreBucket = (genre) => {
  const value = String(genre || '').toLowerCase();
  if (!value) return 'unknown';
  if (KPOP_RE.test(value)) return 'kpop';
  if (HIPHOP_RE.test(value)) return 'hiphop';
  return 'other';
};

const mainstreamKeys = new Set(config.mainstreamArtists.map(key).filter(Boolean));
const undergroundKeys = new Set(config.undergroundArtists.map(key).filter(Boolean));

// Match on a normalised prefix so "??" matches "?? (Pharaoh)" and
// "??Swimming" matches "??".
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

module.exports = {
  genreBucket,
  sceneFor,
  key,
  KPOP_RE,
  HIPHOP_RE,
  OTHER_RE,
  KPOP_PATTERNS,
  HIPHOP_PATTERNS,
  OTHER_PATTERNS
};
