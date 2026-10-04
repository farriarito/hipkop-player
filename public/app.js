'use strict';

/* HIPKOP PLAYER front-end.
 *
 * All catalog data comes from the JSON API (/api/releases, /api/charts,
 * /api/search, /api/artists/:id, /api/albums/:id, /api/tracks/:id). The arrays
 * below are an OFFLINE FALLBACK ONLY — used when the API is unreachable — and
 * are never the primary search source. Artwork is served through /media/... so
 * the page never hotlinks a third-party image host.
 */

/* ------------------------------- fallback -------------------------------- */

const FALLBACK_ALBUMS = [
  { id: 'fallback-1', kind: 'album', title: 'MUSE', artist: 'aespa', artistId: 'fallback-aespa', genre: 'K-POP', year: '2026', releaseDate: '2026-09-21', score: 9.4, comments: 428, desc: '未来感、强节拍与极具辨识度的世界观。', coverUrl: '/media/cover/fallback-1' },
  { id: 'fallback-2', kind: 'album', title: '五人组', artist: 'Higher Brothers', artistId: 'fallback-hb', genre: 'RAP', year: '2026', releaseDate: '2026-09-14', score: 9.1, comments: 376, desc: '把中文说唱的街头能量带到更大的舞台。', coverUrl: '/media/cover/fallback-2' },
  { id: 'fallback-3', kind: 'album', title: '生于未来', artist: '法老', artistId: 'fallback-pharaoh', genre: 'RAP', year: '2025', releaseDate: '2025-12-08', score: 9.0, comments: 318, desc: '锋利写作、密集叙事与一张完整的作品。', coverUrl: '/media/cover/fallback-3' },
  { id: 'fallback-4', kind: 'album', title: 'The Album', artist: 'BLACKPINK', artistId: 'fallback-bp', genre: 'K-POP', year: '2025', releaseDate: '2025-10-02', score: 8.9, comments: 289, desc: '强烈的流行结构与舞台感。', coverUrl: '/media/cover/fallback-4' },
  { id: 'fallback-5', kind: 'album', title: 'Pink Tape', artist: 'A$AP Rocky', artistId: 'fallback-rocky', genre: 'RAP', year: '2025', releaseDate: '2025-07-18', score: 8.8, comments: 254, desc: '跨越地下美学与主流制作的混合体。', coverUrl: '/media/cover/fallback-5' },
  { id: 'fallback-6', kind: 'album', title: 'REBEL', artist: 'G-DRAGON', artistId: 'fallback-gd', genre: 'K-POP', year: '2026', releaseDate: '2026-08-30', score: 8.7, comments: 231, desc: '个性化视觉与极具张力的流行表达。', coverUrl: '/media/cover/fallback-6' }
];

const FALLBACK_ARTISTS = [
  { id: 'fallback-aespa', name: 'aespa', genre: 'K-POP', region: '韩国', bio: '以未来感世界观、强烈编舞和电子流行为核心的女子组合。', avatarUrl: '/media/avatar/fallback-aespa', heroUrl: '/media/hero/fallback-aespa' },
  { id: 'fallback-pharaoh', name: '法老', genre: 'RAP', region: '中国·上海', bio: '以叙事、社会观察与现场感染力著称的中文说唱音乐人。', avatarUrl: '/media/avatar/fallback-pharaoh', heroUrl: '/media/hero/fallback-pharaoh' },
  { id: 'fallback-bp', name: 'BLACKPINK', genre: 'K-POP', region: '韩国', bio: '融合 Hip-Hop、流行与强舞台表现力的全球女子组合。', avatarUrl: '/media/avatar/fallback-bp', heroUrl: '/media/hero/fallback-bp' },
  { id: 'fallback-rocky', name: 'A$AP Rocky', genre: 'RAP', region: '美国·纽约', bio: '将高端时装、视觉艺术与纽约说唱融合的艺术家。', avatarUrl: '/media/avatar/fallback-rocky', heroUrl: '/media/hero/fallback-rocky' }
];

const FALLBACK_POSTS = [
  { title: '中文说唱和 K-POP 的现场差异', author: 'Melo7', body: '一个更靠近叙事，一个更靠近编舞，但观众都在等待灯光亮起。', category: '现场' },
  { title: '你心目中的年度最佳 Rap Album？', author: 'HIPKOP 社区', body: '国内外说唱一起投票，欢迎留下你的选择和理由。', category: '单曲评价' },
  { title: '从鼓点到舞台：HipHop × K-POP', author: 'Echo Chamber', body: '采样、舞蹈和视觉设计正在越来越紧密地交汇。', category: '话题' }
];

const COMMUNITY_TYPES = [
  { id: 'artist', label: '艺人评价', icon: '✦', hint: '为艺人的风格、现场与影响力打分' },
  { id: 'track', label: '单曲评价', icon: '♫', hint: '留下这首歌为什么值得循环的理由' },
  { id: 'live', label: '现场评价', icon: '▣', hint: '分享演出、舞台与现场声音' },
  { id: 'topic', label: '话题分类', icon: '#', hint: '发起一个让 Rap 与 K-POP 互通的话题' }
];

const HOT_KEYWORDS = [
  ['新专辑首发', '2.8k'],
  ['现场还原度', '1.9k'],
  ['中文说唱出海', '1.6k'],
  ['K-POP 回归季', '1.4k'],
  ['地下新声', '980']
];

function readCommunityPosts() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('hipkop-community-posts') || 'null');
    return Array.isArray(saved) && saved.length ? saved : FALLBACK_POSTS.slice();
  } catch {
    return FALLBACK_POSTS.slice();
  }
}

function saveCommunityPosts() {
  try {
    window.localStorage.setItem('hipkop-community-posts', JSON.stringify(state.communityPosts.slice(0, 100)));
  } catch {
    // Private browsing or disabled storage should not break posting in-memory.
  }
}

/* -------------------------------- state ---------------------------------- */

const state = {
  page: 'home',
  liked: new Set(),
  offline: false,
  lastDetail: { page: 'home', id: null, kind: 'album' },
  releases: [],
  artists: [],
  pick: null,
  chartGenre: 'all',
  chartSort: 'popularity',
  charts: [],
  discover: null,
  communityFilter: 'all',
  communityTopic: '',
  communityComposer: null,
  communityFiles: [],
  communityPosts: readCommunityPosts()
};

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------ data layer -------------------------------- */

async function api(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`http_${response.status}`);
  return response.json();
}

async function safeApi(path, fallbackValue) {
  try {
    const data = await api(path);
    state.offline = false;
    return data;
  } catch (error) {
    state.offline = true;
    return fallbackValue;
  }
}

/* ------------------------------- rendering -------------------------------- */

function cover(item, extra = '') {
  const url = item.coverUrl || (item.id ? `/media/cover/${encodeURIComponent(item.id)}` : '');
  return `<div class="cover${extra ? ` ${extra}` : ''}"><img src="${esc(url)}" alt="${esc(item.title)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('img-fallback')"><span>${esc(item.genre || item.kind || '')}</span></div>`;
}

function avatar(item, cls = '') {
  const url = item.avatarUrl || (item.id ? `/media/avatar/${encodeURIComponent(item.id)}` : '');
  return `<img ${cls ? `class="${cls}"` : ''} src="${esc(url)}" alt="${esc(item.name)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('img-fallback')">`;
}

function albumCard(album) {
  const year = album.year || (album.releaseDate || '').slice(0, 4);
  const score = album.score != null ? Number(album.score).toFixed(1) : '—';
  return `<article class="card" onclick="openItem('${esc(album.id)}')">${cover(album)}<h3>${esc(album.title)}</h3><p>${esc(album.artist)} · ${esc(year)} · <b>${score}</b></p></article>`;
}

function releaseCard(album) {
  return `<article class="release-card" onclick="openItem('${esc(album.id)}')">${cover(album)}<h3>${esc(album.title)}</h3><p>${esc(album.artist)}</p><small>${album.kind === 'single' ? '单曲' : '专辑'} · ${esc(album.releaseDate || album.year || '')}</small></article>`;
}

function trackRow(track, index) {
  const label = track.trackNumber != null ? String(track.trackNumber).padStart(2, '0') : index != null ? String(index + 1).padStart(2, '0') : '♪';
  return `<div class="track" onclick="openItem('${esc(track.id)}')"><span>${label}</span><b>${esc(track.title)}</b><em>${esc(track.artist || track.albumTitle || '')}</em></div>`;
}

function artistResult(artist) {
  return `<div class="artist-result" onclick="artistDetail('${esc(artist.id)}')">${avatar(artist)}<div><b>${esc(artist.name)}</b><small>${esc(artist.genre || '艺人')}${artist.region ? ' · ' + esc(artist.region) : ''}</small></div><span>→</span></div>`;
}

const loading = (text = '正在加载…') => `<section class="section"><div class="discover-hint">${esc(text)}</div></section>`;
const emptyState = (text) => `<p class="empty">${esc(text)}</p>`;

function isCoreCulture(item) {
  const genre = String(item?.genre || '').toLowerCase();
  const text = `${genre} ${item?.artist || ''} ${item?.title || ''}`.toLowerCase();
  return /hip.?hop|rap|k.?pop|korean pop|中文说唱|华语说唱|korean/.test(text);
}

function cultureBucket(item) {
  const genre = String(item?.genre || '').toLowerCase();
  if (/k.?pop|korean pop/.test(genre)) return 'kpop';
  const artist = String(item?.artist || item?.artistDisplay || '').toLowerCase();
  const region = String(item?.region || '').toLowerCase();
  const chinese = /[\u4e00-\u9fff]/.test(artist) || /china|中国|taiwan|台湾|hong kong|香港/.test(region);
  return chinese ? 'rap-cn' : 'rap-global';
}

function balancedCharts(items, limit = 50) {
  const groups = { 'rap-cn': [], 'rap-global': [], kpop: [] };
  for (const item of items || []) {
    if (!isCoreCulture(item)) continue;
    const bucket = cultureBucket(item);
    if (groups[bucket]) groups[bucket].push(item);
  }
  const result = [];
  const order = ['rap-cn', 'rap-global', 'kpop'];
  let cursor = 0;
  while (result.length < limit && order.some((key) => groups[key].length)) {
    const key = order[cursor % order.length];
    if (groups[key].length) result.push(groups[key].shift());
    cursor += 1;
  }
  return result;
}

// Keep editorial/random modules representative of all three core cultures
// without changing the chronological order of the release rail itself.
function balancedItems(items, limit = 10) {
  const groups = { 'rap-cn': [], 'rap-global': [], kpop: [] };
  for (const item of items || []) {
    const bucket = cultureBucket(item);
    (groups[bucket] || groups['rap-global']).push(item);
  }
  const result = [];
  const order = ['rap-cn', 'rap-global', 'kpop'];
  let cursor = 0;
  while (result.length < limit && order.some((key) => groups[key].length)) {
    const key = order[cursor % order.length];
    if (groups[key].length) result.push(groups[key].shift());
    cursor += 1;
  }
  return result;
}

function heatValue(item) {
  const explicit = Number(item?.searchHeat ?? item?.heat ?? item?.popularity);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const comments = Number(item?.comments) || 0;
  const score = Number(item?.score) || 0;
  const date = item?.releaseDate ? new Date(item.releaseDate).getTime() : 0;
  const freshness = date ? Math.max(0, (date - Date.now() + 1000 * 86400 * 365) / (1000 * 86400 * 365)) : 0;
  return comments * 1.4 + score * 42 + freshness * 10;
}

function heatPercent(item, collection = state.charts) {
  const values = (collection || []).map(heatValue);
  const max = Math.max(1, ...values);
  return Math.max(1, Math.min(99, Math.round((heatValue(item) / max) * 100)));
}

function uniqueItems(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    if (!item || !item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function formatReleaseDate(item) {
  const value = item?.releaseDate || item?.year || '';
  return value ? String(value).slice(0, 10) : '日期待同步';
}

function communityCategoryLabel(category) {
  return COMMUNITY_TYPES.find((item) => item.id === category)?.label || '内容';
}

/* --------------------------------- pages ---------------------------------- */

function heroSection() {
  return `<section class="hero"><div class="hero-copy"><div class="hero-kicker"><span class="pulse"></span> HIPKOP / CULTURE FEED · 2026</div><h1>下一首，<em>和你同频。</em></h1><p>把主流发行、小众地下与潮流 K-POP 放进同一张地图。这里不只听歌，也发现风格、现场和正在发生的共鸣。</p><div class="hero-meta"><span>GLOBAL RAP</span><span>K-POP</span><span>COMMUNITY</span></div><div class="hero-actions"><button class="cta" onclick="navigate('discover')">开始探索 <b>↗</b></button><button class="ghost-cta" onclick="navigate('charts')">看本周榜单</button></div></div><div class="hero-art"><div class="hero-art-grid"></div><div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div><div class="hero-sticker sticker-top">TURN<br>IT<br>UP</div><div class="hero-sticker sticker-bottom">H / K<br><small>NO SKIPS</small></div><span class="hero-art-word">HYPE<br>MODE</span><span class="hero-index">001 / 026</span></div></section>`;
}

function pickView() {
  const pick = state.pick || state.releases[0] || FALLBACK_ALBUMS[0];
  const kind = pick.kind === 'single' ? 'SINGLE' : 'ALBUM';
  return `<div class="pick-card" onclick="openItem('${esc(pick.id)}')">${cover(pick, 'pick-cover')}<div><span class="eyebrow">RANDOM PICK · ${kind}</span><h3>${esc(pick.title)}</h3><p>${esc(pick.artist)}${pick.genre ? ' · ' + esc(pick.genre) : ''}</p></div><button type="button" onclick="event.stopPropagation();changePick();">换一个</button></div>`;
}

function offlineNotice() {
  return state.offline ? `<section class="section"><div class="discover-hint">⚠ 无法连接目录服务，当前展示离线示例数据。请确认服务已启动。</div></section>` : '';
}

async function viewHome() {
  const data = await safeApi('/api/releases?limit=50', null);
  const remoteReleases = data && Array.isArray(data.items) ? data.items : [];
  const cultureReleases = remoteReleases.filter(isCoreCulture);
  state.releases = (cultureReleases.length ? cultureReleases : remoteReleases)
    .slice()
    .sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')))
    .slice(0, 16);
  if (!state.releases.length) state.releases = FALLBACK_ALBUMS;
  const chartsData = await safeApi('/api/charts?limit=50', null);
  const remoteCharts = chartsData && Array.isArray(chartsData.items) ? chartsData.items : [];
  const cultureCharts = remoteCharts.filter(isCoreCulture);
  state.charts = balancedCharts(cultureCharts.length ? cultureCharts : remoteCharts, 50);
  if (!state.charts.length) state.charts = FALLBACK_ALBUMS.slice(0, 5);
  if (!state.pick || !state.releases.some((item) => item.id === state.pick.id)) randomPick();

  const latest = state.releases;
  const charts = state.charts.slice(0, 6);
  const editorialPool = uniqueItems([...state.charts, ...state.releases, ...FALLBACK_ALBUMS])
    .filter(isCoreCulture)
    .sort((a, b) => heatValue(b) - heatValue(a));
  const seasonal = balancedItems(editorialPool, 10);
  return `${offlineNotice()}${heroSection()}
    <section class="section"><div class="section-head"><h2>新作</h2><a onclick="navigate('discover')">查看全部 →</a></div><div class="release-scroller">${latest.map(releaseCard).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>今天听点儿</h2><span class="section-action" onclick="randomPick();paint();">换一个 ↻</span></div>${pickView()}</section>
    <section class="section"><div class="section-head"><h2>当季热听</h2><a onclick="navigate('charts')">查看 TOP 10 →</a></div><div class="cards">${seasonal.map(albumCard).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>我们都在聊？</h2><a onclick="navigate('community')">进入社区 →</a></div><div class="keyword-list">${HOT_KEYWORDS.map(([keyword, count], index) => `<button type="button" class="keyword-row" onclick="openCommunityTopic('${esc(keyword)}')"><span class="rank-no">${String(index + 1).padStart(2, '0')}</span><b>#${esc(keyword)}</b><small>${esc(count)} 人在聊 →</small></button>`).join('')}</div></section>`;
}

function chartsList() {
  if (!state.charts.length) return emptyState('暂无榜单数据。首次同步完成后将显示真实榜单。');
  return `<div class="rank-list">${state.charts.map((album, index) => {
    const metric = state.chartSort === 'date'
      ? formatReleaseDate(album)
      : state.chartSort === 'popularity'
        ? `🔥 ${heatPercent(album)}%`
        : album.score != null ? Number(album.score).toFixed(1) : '—';
    return `<div class="rank" style="grid-template-columns:28px 42px minmax(0,1fr) auto" onclick="openItem('${esc(album.id)}')"><span class="rank-no">${String(index + 1).padStart(2, '0')}</span><div style="width:42px;height:42px">${cover(album, 'rank-cover')}</div><div><div class="rank-name">${esc(album.title)}</div><div class="rank-artist">${esc(album.artist)}${album.genre ? ' · ' + esc(album.genre) : ''}</div></div><span class="score">${esc(metric)}</span></div>`;
  }).join('')}</div>`;
}

async function loadCharts() {
  const params = new URLSearchParams({ genre: state.chartGenre, sort: state.chartSort, limit: '50' });
  const data = await safeApi(`/api/charts?${params}`, null);
  let items = data && Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    items = FALLBACK_ALBUMS.filter((item) => {
      if (state.chartGenre === 'kpop') return cultureBucket(item) === 'kpop';
      if (state.chartGenre === 'hiphop') return cultureBucket(item) !== 'kpop';
      return true;
    });
  }
  const sorted = items.slice().sort((a, b) => {
    if (state.chartSort === 'date') return String(b.releaseDate || '').localeCompare(String(a.releaseDate || ''));
    if (state.chartSort === 'score') return (Number(b.score) || 0) - (Number(a.score) || 0);
    return heatValue(b) - heatValue(a);
  });
  state.charts = state.chartSort === 'date' ? sorted : balancedCharts(sorted, 50);
}

async function viewCharts() {
  await loadCharts();
  return `<div class="page-title"><span class="eyebrow">HIPKOP CHARTS</span><h1>榜单</h1><p>让不同语言、不同场景的潮流音乐在同一张榜单里被看见。</p>
    <div class="chips">
      <button class="chip ${state.chartGenre === 'all' ? 'active' : ''}" onclick="setChartGenre('all')">综合 TOP 50</button>
      <button class="chip ${state.chartGenre === 'hiphop' ? 'active' : ''}" onclick="setChartGenre('hiphop')">Hip-Hop TOP 50</button>
      <button class="chip ${state.chartGenre === 'kpop' ? 'active' : ''}" onclick="setChartGenre('kpop')">K-POP TOP 50</button>
    </div>
    <div class="sort-row"><label>排序</label><select onchange="setChartSort(this.value)">
      <option value="popularity" ${state.chartSort === 'popularity' ? 'selected' : ''}>榜单热度</option>
      <option value="score" ${state.chartSort === 'score' ? 'selected' : ''}>综合评分</option>
      <option value="date" ${state.chartSort === 'date' ? 'selected' : ''}>最新发行</option>
    </select></div></div>
    ${offlineNotice()}<section class="section" id="chartList">${chartsList()}</section>`;
}

function discoverHint() {
  return '<div class="discover-hint">试试搜索：aespa · 法老 · PACT · Higher Brothers · BLACKPINK · G-DRAGON · A$AP Rocky</div>';
}

function searchResultsHtml(result) {
  if (!result) return discoverHint();
  const { results, counts } = result;
  const none = !counts.artists && !counts.albums && !counts.tracks;
  if (none) {
    return result.error
      ? `<p class="empty">查询失败：${esc(result.error)}。请稍后重试。</p>`
      : `<p class="empty">未找到「${esc(result.query)}」的结果，请尝试其他关键词。</p>`;
  }
  const note = result.cached ? '本地目录结果' : `元数据 Provider 结果 · ${esc((result.providers || []).join(', ') || 'provider')}`;
  return `<div class="discover-hint">${note} · 艺人 ${counts.artists} · 专辑 ${counts.albums} · 单曲 ${counts.tracks}</div>
    <div class="result-group"><h3>艺人 (${counts.artists})</h3>${results.artists.map(artistResult).join('') || emptyState('无匹配艺人')}</div>
    <div class="result-group"><h3>专辑 (${counts.albums})</h3><div class="cards">${results.albums.map(albumCard).join('') || emptyState('无匹配专辑')}</div></div>
    <div class="result-group"><h3>单曲 (${counts.tracks})</h3>${results.tracks.slice(0, 12).map((track, index) => trackRow(track, index)).join('') || emptyState('无匹配单曲')}</div>`;
}

function viewDiscover() {
  return `<div class="page-title"><span class="eyebrow">DISCOVER</span><h1>发现</h1><p>搜索艺人、专辑和单曲，也搜索正在互通的文化线索。</p></div>
    <section class="section discover-search"><div class="inline-search"><input id="discoverInput" placeholder="搜索艺人、专辑、单曲或组合" oninput="onDiscoverInput()"><button onclick="runDiscover()">搜索</button></div><div id="discoverResults">${searchResultsHtml(state.discover)}</div></section>
    ${offlineNotice()}
    <section class="section"><div class="feature-grid"><article class="feature"><b>RAP · GLOBAL</b><h3>全球说唱<br>新声地图</h3><p>从中文说唱到欧美地下，发现下一位想关注的艺人。</p></article><article class="feature"><b>K-POP · EDITORIAL</b><h3>回归季<br>视觉档案</h3><p>记录每一次 comeback 的专辑、舞台和视觉语言。</p></article></div></section>`;
}

function viewCommunity() {
  const filter = state.communityFilter;
  const filtered = state.communityPosts.filter((post) => filter === 'all' || post.category === filter || (filter === 'rap' && /说唱|Rap|中文|HipHop/i.test(post.title + post.body)) || (filter === 'kpop' && /K-POP/i.test(post.title + post.body)) || (filter === 'live' && /现场/.test(post.category)));
  const topicNote = state.communityTopic ? `<div class="discover-hint">正在浏览话题：<b>#${esc(state.communityTopic)}</b></div>` : '';
  return `<div class="page-title"><span class="eyebrow">COMMUNITY</span><h1>社区</h1><p>音乐榜单之外，这里讨论最新发行、艺人、单曲和现场，让不同语言的潮流文化真正互通。</p><button class="cta" onclick="openCommunityComposer('topic')">＋ 发布内容</button></div>
    <section class="section"><div class="chips"><button type="button" class="chip ${filter === 'all' ? 'active' : ''}" onclick="setCommunityFilter('all')">全部</button><button type="button" class="chip ${filter === 'rap' ? 'active' : ''}" onclick="setCommunityFilter('rap')">Rap</button><button type="button" class="chip ${filter === 'kpop' ? 'active' : ''}" onclick="setCommunityFilter('kpop')">K-POP</button><button type="button" class="chip ${filter === 'live' ? 'active' : ''}" onclick="setCommunityFilter('live')">现场</button></div>
    <div class="community-type-grid">${COMMUNITY_TYPES.map((type) => `<button type="button" class="feature" onclick="openCommunityComposer('${type.id}')"><b>${type.icon} ${esc(type.label)}</b><h3>${esc(type.label)}</h3><p>${esc(type.hint)} →</p></button>`).join('')}</div>
    ${communityFormHtml()}${topicNote}<div class="community-list">${filtered.map((post) => `<article class="post" onclick="openCommunityComposer('${post.category === '现场' || post.category === '现场评价' ? 'live' : post.category === '话题' ? 'topic' : post.category === '艺人评价' ? 'artist' : 'track'}')"><div class="post-meta"><span>${esc(post.author)}</span><span>${esc(post.category)}${post.rating ? ` · ${esc(post.rating)}.0 分` : ''} · 刚刚</span></div><h3>${esc(post.title)}</h3><p>${esc(post.body)}</p>${post.mediaCount ? `<small class="community-post-category">${esc(post.mediaCount)} 个媒体附件</small>` : ''}</article>`).join('') || emptyState('这个分类还没有内容，来发布第一条吧。')}</div></section>`;
}

function communityFormHtml() {
  if (!state.communityComposer) return '';
  const label = communityCategoryLabel(state.communityComposer);
  const isTopic = state.communityComposer === 'topic';
  return `<section class="section community-composer"><div class="section-head"><h2>${esc(label)}</h2><button type="button" class="section-action" onclick="closeCommunityComposer()">关闭 ×</button></div>
    <label style="display:block;font-size:10px;color:var(--muted);margin:8px 0">${isTopic ? '话题标题' : '评分对象'}<input id="communitySubject" style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #ffffff24;border-radius:6px;background:#141620;color:var(--ink)" placeholder="${isTopic ? '例如：今年最值得现场看的回归' : '输入艺人或单曲名称'}"></label>
    <label style="display:block;font-size:10px;color:var(--muted);margin:8px 0">评分 <select id="communityRating" style="margin-left:8px;padding:7px;background:#141620;color:var(--ink);border:1px solid #ffffff24;border-radius:5px"><option value="5">★★★★★ 5.0</option><option value="4">★★★★☆ 4.0</option><option value="3">★★★☆☆ 3.0</option><option value="2">★★☆☆☆ 2.0</option><option value="1">★☆☆☆☆ 1.0</option></select></label>
    <textarea id="communityReason" rows="4" style="display:block;width:100%;margin:8px 0;padding:10px;border:1px solid #ffffff24;border-radius:6px;background:#141620;color:var(--ink);resize:vertical" placeholder="写下你的理由、听感或现场细节…"></textarea>
    <label style="display:block;padding:10px;border:1px dashed #ffffff2b;border-radius:6px;color:var(--muted);font-size:10px;cursor:pointer">＋ 添加图片或视频<input id="communityMedia" type="file" accept="image/*,video/*" multiple style="display:none" onchange="previewCommunityFiles(this)"></label><div id="communityFileHint" class="discover-hint">${state.communityFiles.length ? `${state.communityFiles.length} 个文件已选择` : '支持 JPG、PNG、GIF、MP4 等格式'}</div><div id="communityMediaPreview" class="media-preview"></div><button type="button" class="cta" onclick="submitCommunityPost()">发布${esc(label)}</button></section>`;
}

function viewProfile() {
  return `<div class="page-title"><span class="eyebrow">MY HIPKOP</span><h1>我的</h1></div><div class="profile-card"><div class="avatar">H</div><div><h2>游客</h2><p>登录后同步你的收藏、乐评与关注</p></div><button class="login" onclick="toast('本地演示模式：登录功能已禁用')">登录</button></div><div class="menu"><div class="menu-item" onclick="toast('收藏夹为空')">我的收藏 <span>→</span></div><div class="menu-item" onclick="toast('登录后查看我的乐评')">我的乐评 <span>→</span></div><div class="menu-item" onclick="toast('暂无通知')">消息通知 <span>→</span></div><div class="menu-item" onclick="showStatus()">目录与 Provider 状态 <span>→</span></div><div class="menu-item" onclick="toast('HIPKOP PLAYER v0.3 · 元数据目录')">关于 HIPKOP PLAYER <span>→</span></div></div>`;
}

/* ------------------------------ navigation -------------------------------- */

async function paint() {
  const view = $('#view');
  document.querySelectorAll('.tabbar button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.page);
  });
  if (state.page === 'home') view.innerHTML = await viewHome();
  else if (state.page === 'charts') view.innerHTML = await viewCharts();
  else if (state.page === 'discover') view.innerHTML = viewDiscover();
  else if (state.page === 'community') view.innerHTML = viewCommunity();
  else if (state.page === 'profile') view.innerHTML = viewProfile();
}

async function navigate(page) {
  if (page !== 'detail' && page !== 'artist') state.page = page;
  if (page === 'home' || page === 'charts') $('#view').innerHTML = loading();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await paint();
}

function backFromDetail() {
  const page = state.lastDetail.page && !['detail', 'artist'].includes(state.lastDetail.page)
    ? state.lastDetail.page
    : 'home';
  navigate(page);
}

/* -------------------------------- details --------------------------------- */

async function openItem(id) {
  const previous = ['detail', 'artist'].includes(state.page) ? state.lastDetail.page : state.page;
  state.lastDetail = { page: previous || 'home', id };
  state.page = 'detail';
  const view = $('#view');
  view.innerHTML = loading('正在打开详情…');
  const data = await safeApi(`/api/albums/${encodeURIComponent(id)}`, null);
  if (!data || !data.album) {
    const trackData = await safeApi(`/api/tracks/${encodeURIComponent(id)}`, null);
    if (trackData && trackData.track) return renderTrack(trackData);
    view.innerHTML = `${offlineNotice()}${emptyState('无法加载该作品，可能尚未同步。')}<span class="back" onclick="backFromDetail()">← 返回</span>`;
    return;
  }
  renderAlbum(data);
}

function renderAlbum(data) {
  const { album, tracks, artists } = data;
  const liked = state.liked.has(album.id);
  const artistLink = album.artistId
    ? `<div class="artist" onclick="artistDetail('${esc(album.artistId)}')">${esc(album.artist)}</div>`
    : `<div class="artist">${esc(album.artist)}</div>`;
  $('#view').innerHTML = `<div class="detail"><span class="back" onclick="backFromDetail()">← 返回</span>
    <div class="detail-hero"><div class="detail-cover">${cover(album)}</div><div>
      <span class="eyebrow">${album.kind === 'single' ? 'SINGLE' : 'ALBUM'} · ${esc(album.year || '')} · ${esc(album.genre || '')}</span>
      <h1>${esc(album.title)}</h1>${artistLink}
      <div class="stars">★★★★★ <small>${album.score != null ? Number(album.score).toFixed(1) : '—'}</small></div>
      <button class="cta" onclick="toggleLike('${esc(album.id)}')">${liked ? '♥ 已收藏' : '♡ 收藏'}</button>
    </div></div>
    <div class="review-box"><b>HIPKOP 编辑短评</b><p>${esc(album.desc || `${album.title} · ${album.artist}`)}</p>
      <div class="track-box"><h3>曲目列表 (${tracks.length})</h3>${tracks.length ? tracks.map((track, index) => trackRow(track, index)).join('') : `<p class="single-meta">曲目尚未同步，正在后台获取。</p>`}</div>
      ${artists && artists.length ? `<p class="single-meta">艺人：${artists.map((a) => `<a onclick="artistDetail('${esc(a.id)}')">${esc(a.name)}</a>`).join(' · ')}</p>` : ''}
    </div></div>`;
}

function renderTrack(data) {
  const { track, album, artists } = data;
  const liked = state.liked.has(track.id);
  $('#view').innerHTML = `<div class="detail"><span class="back" onclick="backFromDetail()">← 返回</span>
    <div class="detail-hero"><div class="detail-cover">${cover(album || track)}</div><div>
      <span class="eyebrow">SINGLE · ${esc(track.year || '')} · ${esc(track.genre || '')}</span>
      <h1>${esc(track.title)}</h1>
      ${artists && artists.length ? `<div class="artist" onclick="artistDetail('${esc(artists[0].id)}')">${esc(track.artist)}</div>` : `<div class="artist">${esc(track.artist)}</div>`}
      <div class="stars">♪ <small>${track.durationMs ? Math.round(track.durationMs / 1000) + 's' : ''}</small></div>
      <button class="cta" onclick="toggleLike('${esc(track.id)}')">${liked ? '♥ 已收藏' : '♡ 收藏'}</button>
    </div></div>
    <div class="review-box"><b>所属专辑</b>${album ? `<p class="single-meta" onclick="openItem('${esc(album.id)}')">${esc(album.title)} · ${esc(album.artist)}</p>` : '<p class="single-meta">未关联专辑</p>'}
    ${track.previewUrl ? `<p class="single-meta"><a href="${esc(track.previewUrl)}" target="_blank" rel="noopener">试听片段 ↗</a></p>` : ''}</div></div>`;
}

async function artistDetail(id) {
  const previous = ['detail', 'artist'].includes(state.page) ? state.lastDetail.page : state.page;
  state.lastDetail = { page: previous || 'home', id };
  state.page = 'artist';
  const view = $('#view');
  view.innerHTML = loading('正在加载艺人资料…');
  const data = await safeApi(`/api/artists/${encodeURIComponent(id)}`, null);
  if (!data || !data.artist) {
    view.innerHTML = `${offlineNotice()}${emptyState('无法加载艺人资料。')}<span class="back" onclick="backFromDetail()">← 返回</span>`;
    return;
  }
  const { artist, albums, tracks } = data;
  view.innerHTML = `<div class="artist-page"><span class="back" onclick="backFromDetail()">← 返回</span>
    <div class="artist-hero" style="background-image:url('${esc(artist.heroUrl)}')"><div class="artist-overlay"></div>
      <div class="artist-info">${avatar(artist)}<div>
        <span class="eyebrow">${esc(artist.genre || '艺人')}${artist.region ? ' · ' + esc(artist.region) : ''}</span>
        <h1>${esc(artist.name)}</h1><p>${esc(artist.bio || '暂无简介，资料来自元数据 Provider。')}</p>
        <button class="cta" onclick="followArtist()">＋ 关注艺人</button>
      </div></div></div>
    ${offlineNotice()}
    <section class="section"><div class="section-head"><h2>代表专辑 (${albums.length})</h2></div><div class="cards">${albums.length ? albums.map(albumCard).join('') : emptyState('暂无关联专辑')}</div></section>
    <section class="section"><div class="section-head"><h2>关联单曲 (${tracks.length})</h2></div><div class="track-box">${tracks.length ? tracks.slice(0, 12).map((track, index) => trackRow(track, index)).join('') : emptyState('暂无关联单曲')}</div></section></div>`;
}

/* ------------------------------ interactions ------------------------------ */

function followArtist() {
  toast('已关注该艺人');
}

function randomPick() {
  const pool = balancedItems(uniqueItems([...state.releases, ...FALLBACK_ALBUMS]), 12);
  const choices = pool.filter((item) => !state.pick || item.id !== state.pick.id);
  state.pick = (choices.length ? choices : pool)[Math.floor(Math.random() * (choices.length || pool.length))];
  return state.pick;
}

function changePick() {
  randomPick();
  if (state.page === 'home') paint();
}

function toggleLike(id) {
  state.liked.has(id) ? state.liked.delete(id) : state.liked.add(id);
  toast(state.liked.has(id) ? '已加入收藏' : '已取消收藏');
  if (state.page === 'detail') openItem(state.lastDetail.id);
}

async function setChartGenre(genre) {
  state.chartGenre = genre;
  await paint();
}

async function setChartSort(sort) {
  state.chartSort = sort;
  await paint();
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 2200);
}

function setCommunityFilter(filter) {
  state.communityFilter = filter;
  state.communityTopic = '';
  paint();
}

function openCommunityTopic(topic) {
  state.communityTopic = topic;
  state.communityFilter = 'all';
  navigate('community');
}

function openCommunityComposer(category) {
  state.communityComposer = category;
  state.communityFiles = [];
  if (state.page !== 'community') state.page = 'community';
  paint();
}

function closeCommunityComposer() {
  state.communityComposer = null;
  state.communityFiles = [];
  paint();
}

function previewCommunityFiles(input) {
  state.communityFiles = Array.from(input?.files || []);
  const hint = $('#communityFileHint');
  if (hint) hint.textContent = state.communityFiles.length ? `${state.communityFiles.length} 个文件已选择：${state.communityFiles.map((file) => file.name).join('、')}` : '支持 JPG、PNG、GIF、MP4 等格式';
  const preview = $('#communityMediaPreview');
  if (!preview) return;
  preview.innerHTML = '';
  for (const file of state.communityFiles) {
    const url = URL.createObjectURL(file);
    const node = file.type.startsWith('video/') ? document.createElement('video') : document.createElement('img');
    node.src = url;
    node.title = file.name;
    if (node.tagName === 'VIDEO') node.controls = true;
    preview.appendChild(node);
  }
}

function submitCommunityPost() {
  const subject = ($('#communitySubject')?.value || '').trim();
  const reason = ($('#communityReason')?.value || '').trim();
  if (!subject || !reason) return toast('请填写对象/标题和理由');
  const rating = $('#communityRating')?.value;
  const label = communityCategoryLabel(state.communityComposer);
  state.communityPosts.unshift({
    title: subject,
    author: '本地用户',
    body: reason,
    category: label,
    rating: rating || null,
    mediaCount: state.communityFiles.length
  });
  saveCommunityPosts();
  toast(`${label}已保存${rating ? ` · ${rating}.0 分` : ''}，媒体附件 ${state.communityFiles.length} 个`);
  state.communityComposer = null;
  state.communityFiles = [];
  paint();
}

let discoverTimer = null;
function onDiscoverInput() {
  clearTimeout(discoverTimer);
  discoverTimer = setTimeout(() => runDiscover(), 350);
}

async function runDiscover(explicitQuery) {
  const root = $('#discoverResults');
  if (!root) return;
  const query = (explicitQuery != null ? explicitQuery : ($('#discoverInput') ? $('#discoverInput').value : '')).trim();
  if (!query) {
    state.discover = null;
    root.innerHTML = discoverHint();
    return;
  }
  root.innerHTML = '<div class="discover-hint">正在查询本地目录与外部 Provider…</div>';
  const data = await safeApi(`/api/search?q=${encodeURIComponent(query)}`, null);
  state.discover = data || { query, counts: { artists: 0, albums: 0, tracks: 0 }, results: { artists: [], albums: [], tracks: [] }, error: 'network' };
  const current = $('#discoverResults');
  if (current) current.innerHTML = searchResultsHtml(state.discover);
}

async function showStatus() {
  const data = await safeApi('/api/health', null);
  if (!data) return toast('无法连接目录服务');
  const names = (data.providers || []).filter((p) => p.available).map((p) => p.label).join(', ') || '无';
  toast(`艺人 ${data.stats.artists} · 专辑 ${data.stats.albums} · 曲目 ${data.stats.tracks} · Provider: ${names}`);
}

/* --------------------------------- boot ----------------------------------- */

navigate('home');
