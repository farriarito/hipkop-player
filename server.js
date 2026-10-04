const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.HIPKOP_PLAYER_PORT || 4180);
const PUBLIC = path.join(__dirname, 'public');
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
};
const json = (res, data, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

const requestJson = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HIPKOP-PLAYER/1.0 (metadata search)' }
    });
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

const imageUrl = (url, size = 600) => {
  if (!url) return '';
  return String(url).replace(/100x100bb/g, `${size}x${size}bb`).replace(/100x100/g, `${size}x${size}`);
};

const normalizeAlbum = (item) => ({
  id: item.collectionId ? `itunes-album-${item.collectionId}` : `album-${item.artistId || item.artistName}-${item.collectionName}`,
  collectionId: item.collectionId || null,
  kind: 'album',
  title: item.collectionName || item.trackName || '',
  artist: item.artistName || '',
  artistId: item.artistId || null,
  coverUrl: imageUrl(item.artworkUrl100),
  releaseDate: item.releaseDate || null,
  genre: item.primaryGenreName || '',
  country: item.country || '',
  source: 'itunes'
});

const normalizeSingle = (item) => ({
  id: item.trackId ? `itunes-track-${item.trackId}` : `single-${item.artistId || item.artistName}-${item.trackName}`,
  trackId: item.trackId || null,
  collectionId: item.collectionId || null,
  kind: 'single',
  title: item.trackName || '',
  artist: item.artistName || '',
  artistId: item.artistId || null,
  album: item.collectionName || '',
  coverUrl: imageUrl(item.artworkUrl100),
  releaseDate: item.releaseDate || null,
  genre: item.primaryGenreName || '',
  previewUrl: item.previewUrl || '',
  source: 'itunes'
});

const normalizeArtist = (item) => ({
  id: item.artistId ? `itunes-artist-${item.artistId}` : `artist-${item.artistName}`,
  artistId: item.artistId || null,
  name: item.artistName || '',
  genre: item.primaryGenreName || '',
  source: 'itunes'
});

async function searchItunes(query) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song,album&limit=50&country=US`;
  const data = await requestJson(url);
  const rows = Array.isArray(data.results) ? data.results : [];
  const albums = new Map();
  const singles = [];
  const artists = new Map();
  for (const item of rows) {
    if (item.artistName) artists.set(item.artistId || item.artistName, normalizeArtist(item));
    if (item.collectionId && item.collectionName) albums.set(item.collectionId, normalizeAlbum(item));
    if (item.wrapperType === 'track' && item.trackName) singles.push(normalizeSingle(item));
  }
  return { albums: [...albums.values()], singles, artists: [...artists.values()], provider: 'itunes' };
}

async function artistSupplement(query) {
  try {
    const data = await requestJson(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(query)}&fmt=json&limit=10`, 7000);
    return (data.artists || []).map(a => ({
      id: a.id ? `musicbrainz-artist-${a.id}` : `artist-${a.name}`,
      artistId: a.id || null,
      name: a.name || '',
      sortName: a.sort-name || '',
      country: a.country || '',
      disambiguation: a.disambiguation || '',
      genre: '',
      source: 'musicbrainz'
    }));
  } catch (_) { return []; }
}

async function handleSearch(q) {
  if (!q.trim()) return { query: q, albums: [], singles: [], artists: [], provider: 'itunes' };
  const result = await searchItunes(q);
  if (!result.artists.length) result.artists = await artistSupplement(q);
  return { query: q, ...result };
}

async function handleArtist(q) {
  const result = await searchItunes(q);
  let artist = result.artists[0] || null;
  if (!artist) {
    const supplement = await artistSupplement(q);
    artist = supplement[0] || null;
  }
  const artistId = artist?.artistId;
  const albums = artistId ? result.albums.filter(a => String(a.artistId) === String(artistId)) : result.albums;
  const singles = artistId ? result.singles.filter(s => String(s.artistId) === String(artistId)) : result.singles;
  return { query: q, artist, albums, singles, artists: result.artists, provider: result.provider };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/search') {
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return json(res, { query: q, albums: [], singles: [], artists: [], error: null });
      return json(res, await handleSearch(q));
    }
    if (p === '/api/artist') {
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return json(res, { query: q, artist: null, albums: [], singles: [], artists: [], error: 'missing_query' }, 400);
      return json(res, await handleArtist(q));
    }
  } catch (error) {
    return json(res, { error: 'provider_unavailable', message: error.message }, 502);
  }
  let filePath = p === '/' || p === '' ? path.join(PUBLIC, 'index.html') : path.resolve(PUBLIC, `.${p}`);
  if (!filePath.startsWith(PUBLIC) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(filePath));
}).listen(PORT, '127.0.0.1', () => console.log(`HIPKOP PLAYER: http://127.0.0.1:${PORT}`));
