'use strict';

// Deterministic artist classification policy.
//
// Why this exists: the iTunes artist endpoint rarely returns a genre (93% of the
// artists in our catalogue have none), while every album does. So the usable
// evidence is the genre distribution of the artist's own albums, not the artist
// row itself. Everything here is pure and deterministic so it can be unit-tested
// and re-run safely.

// Order matters: "K-Pop" must win over the generic /pop/ fallback, and
// "Chinese Hip-Hop" must win over any pop-ish match.
const RULES = [
  { bucket: 'kpop', weight: 3, re: /k-?\s?pop|korean|korea/i },
  { bucket: 'hiphop', weight: 3, re: /hip[\s-]?hop|\brap\b|trap|drill|grime|boom\s?bap|说唱|嘻哈/i },
  {
    bucket: 'other',
    weight: 1,
    re: /r&b|soul|pop|dance|electronic|mandopop|j-?pop|rock|country|soundtrack|alternative|classical|jazz|metal|reggae|ballad|indie|music/i
  }
];

const ruleForGenre = (genre) => {
  const value = String(genre || '').trim();
  if (!value) return null;
  return RULES.find((rule) => rule.re.test(value)) || null;
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

// A single album is never enough evidence to auto-apply a label: the coverage
// factor deliberately keeps one-album artists under the default 0.75 threshold.
const coverageFor = (albumCount) => clamp01(0.55 + 0.15 * albumCount);

const shortHash = (value) => {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const dominantGenre = (albumGenres, bucket) => {
  if (!albumGenres.length) return null;
  const ranked = albumGenres.slice().sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const aOwn = ruleForGenre(a.genre).bucket === bucket ? 1 : 0;
    const bOwn = ruleForGenre(b.genre).bucket === bucket ? 1 : 0;
    return bOwn - aOwn;
  });
  return ranked[0].genre;
};

/**
 * Classify one artist from the genres of its own albums.
 * @param {{ name?: string, genre?: string|null, albums?: Array<{genre: string, count: number}> }} input
 */
function classifyArtist(input = {}) {
  const entries = [];
  if (input.genre) entries.push({ genre: input.genre, count: 1, fromArtist: true });
  for (const album of input.albums || []) {
    if (!album || !album.genre) continue;
    entries.push({ genre: album.genre, count: Number(album.count) || 1, fromArtist: false });
  }

  const votes = new Map();
  const albumGenres = [];
  let albumTotal = 0;
  for (const entry of entries) {
    const rule = ruleForGenre(entry.genre);
    if (!rule) continue;
    votes.set(rule.bucket, (votes.get(rule.bucket) || 0) + rule.weight * entry.count);
    if (!entry.fromArtist) {
      albumTotal += entry.count;
      albumGenres.push(entry);
    }
  }

  if (!votes.size) {
    return {
      genreBucket: 'unknown',
      genre: null,
      confidence: 0,
      reason: '没有可判定的流派证据',
      evidence: '',
      evidenceKey: ''
    };
  }

  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const bucket = ranked[0][0];
  const topWeight = ranked[0][1];
  const totalWeight = ranked.reduce((sum, [, weight]) => sum + weight, 0);
  const confidence = Math.round((topWeight / totalWeight) * coverageFor(Math.max(1, albumTotal)) * 1000) / 1000;
  const evidence = albumGenres.map((entry) => entry.genre + '×' + entry.count).join(', ');

  return {
    genreBucket: bucket,
    genre: dominantGenre(albumGenres, bucket),
    confidence,
    reason: '专辑流派 ' + (evidence || '无') + ' → ' + bucket + '（权重占比 ' + Math.round((topWeight / totalWeight) * 100) + '%）',
    evidence,
    evidenceKey: shortHash(bucket + '|' + albumGenres.map((e) => e.genre + ':' + e.count).sort().join(','))
  };
}

module.exports = { classifyArtist, ruleForGenre, coverageFor, RULES };