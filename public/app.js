'use strict';

/* HIPKOP PLAYER front-end.
 *
 * Every view is fed by the JSON API:
 *   /api/releases  /api/charts  /api/albums  /api/artists/:id  /api/albums/:id
 *   /api/tracks/:id  /api/search  /api/categories  /api/community/posts
 * Each album/track carries `listen.platforms`, so "听完整版" jumps straight to
 * QQ 音乐 / 网易云 / Apple Music instead of stopping at a 30s preview. The
 * arrays below are an OFFLINE FALLBACK ONLY, used when the API is unreachable.
 */

/* ------------------------------- fallback -------------------------------- */

const FALLBACK_ALBUMS = [
  { id: 'fallback-1', kind: 'album', title: 'MUSE', artist: 'aespa', artistId: 'fallback-aespa', genre: 'K-POP', genreBucket: 'kpop', scene: 'mainstream', year: '2026', releaseDate: '2026-09-21', score: 9.4, comments: 428, desc: '未来感、强节拍与极具辨识度的世界观。', coverUrl: '/media/cover/fallback-1' },
  { id: 'fallback-2', kind: 'album', title: '五人组', artist: 'Higher Brothers', artistId: 'fallback-hb', genre: 'RAP', genreBucket: 'hiphop', scene: 'mainstream', year: '2026', releaseDate: '2026-09-14', score: 9.1, comments: 376, desc: '把中文说唱的街头能量带到更大的舞台。', coverUrl: '/media/cover/fallback-2' },
  { id: 'fallback-3', kind: 'album', title: '生于未来', artist: '法老', artistId: 'fallback-pharaoh', genre: 'RAP', genreBucket: 'hiphop', scene: 'underground', year: '2025', releaseDate: '2025-12-08', score: 9.0, comments: 318, desc: '锋利写作、密集叙事与一张完整的作品。', coverUrl: '/media/cover/fallback-3' },
  { id: 'fallback-4', kind: 'album', title: 'The Album', artist: 'BLACKPINK', artistId: 'fallback-bp', genre: 'K-POP', genreBucket: 'kpop', scene: 'mainstream', year: '2025', releaseDate: '2025-10-02', score: 8.9, comments: 289, desc: '强烈的流行结构与舞台感。', coverUrl: '/media/cover/fallback-4' },
  { id: 'fallback-5', kind: 'album', title: 'Pink Tape', artist: 'A$AP Rocky', artistId: 'fallback-rocky', genre: 'RAP', genreBucket: 'hiphop', scene: 'mainstream', year: '2025', releaseDate: '2025-07-18', score: 8.8, comments: 254, desc: '跨越地下美学与主流制作的混合体。', coverUrl: '/media/cover/fallback-5' },
  { id: 'fallback-6', kind: 'album', title: 'REBEL', artist: 'G-DRAGON', artistId: 'fallback-gd', genre: 'K-POP', genreBucket: 'kpop', scene: 'mainstream', year: '2026', releaseDate: '2026-08-30', score: 8.7, comments: 231, desc: '个性化视觉与极具张力的流行表达。', coverUrl: '/media/cover/fallback-6' }
];

const FALLBACK_ARTISTS = [
  { id: 'fallback-aespa', name: 'aespa', genre: 'K-POP', scene: 'mainstream', region: '韩国', bio: '以未来感世界观、强烈编舞和电子流行为核心的女子组合。', avatarUrl: '/media/avatar/fallback-aespa', heroUrl: '/media/hero/fallback-aespa' },
  { id: 'fallback-pharaoh', name: '法老', genre: 'RAP', scene: 'underground', region: '中国·上海', bio: '以叙事、社会观察与现场感染力著称的中文说唱音乐人。', avatarUrl: '/media/avatar/fallback-pharaoh', heroUrl: '/media/hero/fallback-pharaoh' },
  { id: 'fallback-bp', name: 'BLACKPINK', genre: 'K-POP', scene: 'mainstream', region: '韩国', bio: '融合 Hip-Hop、流行与强舞台表现力的全球女子组合。', avatarUrl: '/media/avatar/fallback-bp', heroUrl: '/media/hero/fallback-bp' },
  { id: 'fallback-rocky', name: 'A$AP Rocky', genre: 'RAP', scene: 'mainstream', region: '美国·纽约', bio: '将高端时装、视觉艺术与纽约说唱融合的艺术家。', avatarUrl: '/media/avatar/fallback-rocky', heroUrl: '/media/hero/fallback-rocky' }
];

const FALLBACK_POSTS = [
  { id: 'fallback-post-1', topic: 'performance', title: '中文说唱和 K-POP 的现场差异', body: '一个更靠近叙事，一个更靠近编舞，但观众都在等待灯光亮起。', author: 'Melo7' },
  { id: 'fallback-post-2', topic: 'recommend', title: '你心目中的年度最佳 Rap Album？', body: '国内外说唱一起投票，欢迎留下你的选择和理由。', author: 'HIPKOP 社区' },
  { id: 'fallback-post-3', topic: 'general', title: '从鼓点到舞台：HipHop × K-POP', body: '采样、舞蹈和视觉设计正在越来越紧密地交汇。', author: 'Echo Chamber' }
];

const DEFAULT_TOPICS = [
  { key: 'all', label: '全部' },
  { key: 'release', label: '新作' },
  { key: 'recommend', label: '安利' },
  { key: 'performance', label: '演出' },
  { key: 'review', label: '乐评' },
  { key: 'general', label: '闲聊' }
];

const CHART_TABS = [
  { key: 'all', label: '综合 TOP 50' },
  { key: 'mainstream', label: '主流 HipHop' },
  { key: 'underground', label: '地下 HipHop' },
  { key: 'kpop', label: 'K-POP' }
];

const BUCKET_TABS = [
  { key: 'all', label: '全部风格' },
  { key: 'hiphop', label: 'HipHop' },
  { key: 'kpop', label: 'K-POP' },
  { key: 'other', label: '其他' }
];

const SCENE_TABS = [
  { key: 'all', label: '全部场景' },
  { key: 'mainstream', label: '主流' },
  { key: 'underground', label: '地下' }
];

const SORT_TABS = [
  { key: 'date', label: '最新发行' },
  { key: 'popularity', label: '榜单热度' },
  { key: 'score', label: '评分优先' }
];

/* -------------------------------- state ---------------------------------- */

const state = {
  page: 'home',
  liked: new Set(),
  offline: false,
  lastDetail: { page: 'home', id: null, kind: 'album' },
  releases: [],
  charts: [],
  hero: [],
  heroIndex: 0,
  pick: null,
  chartTab: 'all',
  chartSort: 'popularity',
  discover: null,
  browse: { bucket: 'all', scene: 'all', year: 'all', sort: 'date', items: [] },
  community: { topic: 'all', items: [], topics: [] },
  stats: null,
  categories: null,
  detail: { kind: 'album', item: null, tracks: [], artists: [] }
};

// Items rendered with a listen button are remembered so the "选择收听平台"
// sheet can look them up without inlining JSON into markup.
const listenIndex = new Map();

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const bucketLabel = (bucket) => ({ hiphop: 'HipHop', kpop: 'K-POP', other: '其他' }[bucket] || '');
const sceneLabel = (scene) => ({ mainstream: '主流', underground: '地下' }[scene] || '');
const yearOf = (item) => item.year || String(item.releaseDate || '').slice(0, 4);
const topicLabel = (key) => {
  const topics = state.community.topics.length ? state.community.topics : DEFAULT_TOPICS;
  const match = topics.find((topic) => topic.key === key);
  return match ? match.label : key;
};

function tagLine(item) {
  return [item.genre, bucketLabel(item.genreBucket), sceneLabel(item.scene)].filter(Boolean);
}

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
    return fallbackValue;
  }
}/* ------------------------------- rendering -------------------------------- */

function cover(item, extra = '') {
  const url = item.coverUrl || (item.id ? `/media/cover/${encodeURIComponent(item.id)}` : '');
  return `<div class="cover${extra ? ` ${extra}` : ''}"><img src="${esc(url)}" alt="${esc(item.title)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('img-fallback')"><span>${esc(item.genre || item.kind || '')}</span></div>`;
}

function avatar(item, cls = '') {
  const url = item.avatarUrl || (item.id ? `/media/avatar/${encodeURIComponent(item.id)}` : '');
  return `<img ${cls ? `class="${cls}"` : ''} src="${esc(url)}" alt="${esc(item.name)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('img-fallback')">`;
}

function albumCard(album) {
  const year = yearOf(album);
  const score = album.score != null ? Number(album.score).toFixed(1) : '—';
  return `<article class="card" onclick="openItem('${esc(album.id)}')">${cover(album)}<h3>${esc(album.title)}</h3><p>${esc(album.artist)} · ${esc(year)} · <b>${score}</b></p></article>`;
}

function releaseCard(album) {
  return `<article class="release-card" onclick="openItem('${esc(album.id)}')">${cover(album)}<h3>${esc(album.title)}</h3><p>${esc(album.artist)}</p><small>${album.kind === 'single' ? '单曲' : '专辑'} · ${esc(album.releaseDate || yearOf(album) || '')}</small></article>`;
}

function listenButton(item, label) {
  const platforms = (item && item.listen && item.listen.platforms) || [];
  if (!platforms.length) return '';
  listenIndex.set(item.id, item);
  const primary = platforms.find((platform) => platform.key === 'qq') || platforms[0];
  return `<a class="track-listen" href="${esc(primary.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${esc(primary.name)}">↗${label ? `<i>${esc(label)}</i>` : ''}</a>`;
}

function listenCta(item) {
  const platforms = (item.listen && item.listen.platforms) || [];
  if (!platforms.length) return '';
  listenIndex.set(item.id, item);
  const primary = platforms.find((platform) => platform.key === 'qq') || platforms[0];
  return `<div class="listen-row"><a class="cta" href="${esc(primary.url)}" target="_blank" rel="noopener">在${esc(primary.name)}听完整版 ↗</a><button class="ghost" onclick="openListenById('${esc(item.id)}')">选择收听平台</button></div>`;
}

function trackRow(track, index, options = {}) {
  const label = track.trackNumber != null ? String(track.trackNumber).padStart(2, '0') : index != null ? String(index + 1).padStart(2, '0') : '♪';
  const listen = options.listen === false ? '' : listenButton(track, '');
  return `<div class="track" onclick="openItem('${esc(track.id)}')"><span>${label}</span><b>${esc(track.title)}</b><em>${esc(track.artist || track.albumTitle || '')}</em>${listen}</div>`;
}

function artistResult(artist) {
  const tags = [artist.genre, sceneLabel(artist.scene)].filter(Boolean).join(' · ');
  return `<div class="artist-result" onclick="artistDetail('${esc(artist.id)}')">${avatar(artist)}<div><b>${esc(artist.name)}</b><small>${esc(tags || '艺人')}${artist.region ? ' · ' + esc(artist.region) : ''}</small></div><span>→</span></div>`;
}

function postCard(post) {
  const related = [post.albumTitle && `专辑 ${post.albumTitle}`, post.artistName && `艺人 ${post.artistName}`].filter(Boolean).join(' · ');
  return `<article class="post"><div class="post-meta"><span>${esc(post.author || 'HIPKOP')}</span><span>${esc(topicLabel(post.topic))}</span></div><h3>${esc(post.title)}</h3><p>${esc(post.body)}</p>${related ? `<small class="post-related">${esc(related)}</small>` : ''}</article>`;
}

const loading = (text = '正在加载…') => `<section class="section"><div class="discover-hint">${esc(text)}</div></section>`;
const emptyState = (text) => `<p class="empty">${esc(text)}</p>`;

function offlineNotice() {
  return state.offline ? `<section class="section"><div class="discover-hint">⚠ 无法连接目录服务，当前展示离线示例数据。请确认服务已启动。</div></section>` : '';
}

/* ------------------------------ home pieces -------------------------------- */

function heroSlides() {
  return state.hero.length ? state.hero : FALLBACK_ALBUMS.slice(0, 3);
}

function heroBanner() {
  const slides = heroSlides();
  const index = state.heroIndex % slides.length;
  const album = slides[index];
  const image = album.coverUrl || `/media/cover/${encodeURIComponent(album.id)}`;
  const dots = slides
    .map((_, i) => `<button class="hero-dot ${i === index ? 'active' : ''}" onclick="heroGo(${i})" aria-label="第 ${i + 1} 张"></button>`)
    .join('');
  const tags = tagLine(album).join(' · ');
  return `<section class="hero-banner" id="heroBanner">
    <div class="hero-slide" onclick="openItem('${esc(album.id)}')">
      <div class="hero-bg" style="background-image:url('${esc(image)}')"></div>
      <div class="hero-copy">
        <span class="eyebrow">HIPKOP PICK${tags ? ' · ' + esc(tags) : ''}</span>
        <h1>${esc(album.title)}</h1>
        <p>${esc(album.artist)}${album.releaseDate ? ' · ' + esc(album.releaseDate) : ''}</p>
        <span class="hero-cta">查看专辑 →</span>
      </div>
    </div>
    <div class="hero-nav"><button onclick="heroStep(-1)" aria-label="上一张">‹</button><div class="hero-dots">${dots}</div><button onclick="heroStep(1)" aria-label="下一张">›</button></div>
  </section>`;
}

function heroGo(index) {
  const slides = heroSlides();
  state.heroIndex = ((index % slides.length) + slides.length) % slides.length;
  const node = $('#heroBanner');
  if (node) node.outerHTML = heroBanner();
}

function heroStep(delta) {
  heroGo(state.heroIndex + delta);
}

if (typeof window !== 'undefined') {
  setInterval(() => {
    if (state.page === 'home' && $('#heroBanner')) heroStep(1);
  }, 6000);
}

function dailyPick() {
  const pool = state.releases.length ? state.releases : FALLBACK_ALBUMS;
  const day = Math.floor(Date.now() / 86400000);
  return pool[day % pool.length];
}

function pickView() {
  const pick = state.pick || dailyPick();
  if (!pick) return emptyState('暂无推荐，等待同步完成。');
  const kind = pick.kind === 'single' ? 'SINGLE' : 'ALBUM';
  const tags = tagLine(pick).join(' · ');
  return `<div class="pick-card" onclick="openItem('${esc(pick.id)}')">${cover(pick, 'pick-cover')}<div><span class="eyebrow">今日同频 · ${kind}</span><h3>${esc(pick.title)}</h3><p>${esc(pick.artist)}${tags ? ' · ' + esc(tags) : ''}</p></div><button onclick="event.stopPropagation();randomPick();paint();">换一个</button></div>`;
}

function statStrip() {
  const stats = state.stats || { artists: 0, albums: 0, tracks: 0, posts: 0 };
  return `<section class="stat-strip">
    <div><b>${esc(stats.artists)}</b><span>收录歌手</span></div>
    <div><b>${esc(stats.albums)}</b><span>专辑 / 单曲</span></div>
    <div><b>${esc(stats.posts)}</b><span>社区帖子</span></div>
  </section>`;
}/* --------------------------------- pages ---------------------------------- */

async function viewHome() {
  const [releaseData, chartData, healthData, postData] = await Promise.all([
    safeApi('/api/releases?limit=12', null),
    safeApi('/api/charts?sort=popularity&limit=10', null),
    safeApi('/api/health', null),
    safeApi('/api/community/posts?limit=3', null)
  ]);
  state.offline = !releaseData && !chartData && !healthData;
  state.releases = releaseData && releaseData.items && releaseData.items.length ? releaseData.items : FALLBACK_ALBUMS;
  state.charts = chartData && chartData.items && chartData.items.length ? chartData.items : FALLBACK_ALBUMS.slice(0, 5);
  state.hero = state.charts.slice(0, 5);
  state.heroIndex = 0;
  state.stats = healthData ? healthData.stats : null;
  state.community.items = postData && postData.items && postData.items.length ? postData.items : FALLBACK_POSTS;
  if (postData && postData.topics) state.community.topics = postData.topics;
  state.pick = null;

  const latest = state.releases;
  const charts = state.charts.slice(0, 6);
  const posts = state.community.items.slice(0, 3);
  return `${offlineNotice()}${heroBanner()}
    ${statStrip()}
    <section class="section"><div class="section-head"><h2>新作</h2><a onclick="navigate('discover')">查看全部 →</a></div><div class="release-scroller">${latest.map(releaseCard).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>今日同频</h2><span class="section-action" onclick="randomPick();paint();">换一个 ↻</span></div>${pickView()}</section>
    <section class="section"><div class="section-head"><h2>编辑推荐</h2><a onclick="navigate('discover')">查看全部 →</a></div><div class="cards">${latest.slice(0, 4).map(albumCard).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>热评专辑榜</h2><a onclick="navigate('charts')">完整榜单 →</a></div><div class="rank-list">${charts.map((album, index) => `<div class="rank" onclick="openItem('${esc(album.id)}')"><span class="rank-no">${String(index + 1).padStart(2, '0')}</span><div><div class="rank-name">${esc(album.title)}</div><div class="rank-artist">${esc(album.artist)}${album.genre ? ' · ' + esc(album.genre) : ''}</div></div><span class="score">${album.score != null ? Number(album.score).toFixed(1) : '—'}</span></div>`).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>最新评论</h2><a onclick="navigate('community')">进入社区 →</a></div><div class="community-list">${posts.map(postCard).join('')}</div></section>`;
}

async function loadCharts() {
  const params = new URLSearchParams({ sort: state.chartSort, limit: '50' });
  if (state.chartTab === 'kpop') params.set('genre', 'kpop');
  else if (state.chartTab === 'mainstream') { params.set('genre', 'hiphop'); params.set('scene', 'mainstream'); }
  else if (state.chartTab === 'underground') { params.set('genre', 'hiphop'); params.set('scene', 'underground'); }
  const data = await safeApi(`/api/charts?${params}`, null);
  state.charts = data && data.items ? data.items : [];
  state.offline = !data;
}

function chartsList() {
  if (!state.charts.length) return emptyState('暂无榜单数据。首次同步完成后将显示真实榜单。');
  return `<div class="rank-list">${state.charts
    .map((album, index) => `<div class="rank" onclick="openItem('${esc(album.id)}')"><span class="rank-no">${String(index + 1).padStart(2, '0')}</span><div><div class="rank-name">${esc(album.title)}</div><div class="rank-artist">${esc(album.artist)}${album.genre ? ' · ' + esc(album.genre) : ''}${album.year ? ' · ' + esc(album.year) : ''}</div></div><span class="score">${album.score != null ? Number(album.score).toFixed(1) : '—'}</span></div>`)
    .join('')}</div>`;
}

async function viewCharts() {
  await loadCharts();
  return `<div class="page-title"><span class="eyebrow">HIPKOP CHARTS</span><h1>榜单</h1><p>综合、主流 HipHop、地下 HipHop 与 K-POP 分桶，来自元数据 Provider 与 Apple 榜单同步。</p>
    <div class="chips">${CHART_TABS.map((tab) => `<button class="chip ${state.chartTab === tab.key ? 'active' : ''}" onclick="setChartTab('${tab.key}')">${esc(tab.label)}</button>`).join('')}</div>
    <div class="sort-row"><label>排序</label><select onchange="setChartSort(this.value)">
      <option value="popularity" ${state.chartSort === 'popularity' ? 'selected' : ''}>榜单热度</option>
      <option value="score" ${state.chartSort === 'score' ? 'selected' : ''}>综合评分</option>
      <option value="date" ${state.chartSort === 'date' ? 'selected' : ''}>最新发行</option>
    </select></div></div>
    ${offlineNotice()}<section class="section" id="chartList">${chartsList()}</section>`;
}

/* -------------------------------- discover -------------------------------- */

function discoverHint() {
  return '<div class="discover-hint">试试搜索：aespa · 法老 · PACT · Higher Brothers · BLACKPINK · G-DRAGON · A$AP Rocky</div>';
}

function yearTabs() {
  const now = new Date().getFullYear();
  const years = [{ key: 'all', label: '全部年份' }];
  for (let year = now; year >= now - 8; year -= 1) years.push({ key: String(year), label: String(year) });
  return years;
}

async function loadBrowse() {
  const params = new URLSearchParams({ limit: '40', sort: state.browse.sort });
  if (state.browse.bucket !== 'all') params.set('bucket', state.browse.bucket);
  if (state.browse.scene !== 'all') params.set('scene', state.browse.scene);
  if (state.browse.year !== 'all') params.set('year', state.browse.year);
  const data = await safeApi(`/api/albums?${params}`, null);
  state.browse.items = data && data.items ? data.items : [];
  return Boolean(data);
}

function browseListHtml() {
  if (!state.browse.items.length) return emptyState('这个筛选下还没有作品，换个条件试试。');
  return `<div class="cards">${state.browse.items.map(albumCard).join('')}</div>`;
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

async function viewDiscover() {
  await loadBrowse();
  const years = yearTabs();
  const chips = (tabs, key, setter) =>
    tabs.map((tab) => `<button class="chip ${key === tab.key ? 'active' : ''}" onclick="${setter}('${tab.key}')">${esc(tab.label)}</button>`).join('');
  return `<div class="page-title"><span class="eyebrow">DISCOVER</span><h1>发现</h1><p>搜索任意艺人，或按风格 / 场景 / 年份筛选新发行。</p></div>
    <section class="section discover-search"><div class="inline-search"><input id="discoverInput" placeholder="搜索艺人、专辑、单曲或组合" oninput="onDiscoverInput()"><button onclick="runDiscover()">搜索</button></div><div id="discoverResults">${searchResultsHtml(state.discover)}</div></section>
    ${offlineNotice()}
    <section class="section"><div class="section-head"><h2>筛选</h2><span class="section-action">${state.browse.items.length} 张作品</span></div>
      <div class="filter-block"><label>风格</label><div class="chips">${chips(BUCKET_TABS, state.browse.bucket, 'setBrowseBucket')}</div></div>
      <div class="filter-block"><label>场景</label><div class="chips">${chips(SCENE_TABS, state.browse.scene, 'setBrowseScene')}</div></div>
      <div class="filter-block"><label>年份</label><div class="chips">${chips(years, state.browse.year, 'setBrowseYear')}</div></div>
      <div class="sort-row"><label>排序</label><select onchange="setBrowseSort(this.value)">${SORT_TABS.map((tab) => `<option value="${tab.key}" ${state.browse.sort === tab.key ? 'selected' : ''}>${esc(tab.label)}</option>`).join('')}</select></div>
      <div id="browseResults">${browseListHtml()}</div>
    </section>`;
}/* -------------------------------- community -------------------------------- */

async function loadCommunity() {
  const data = await safeApi(`/api/community/posts?topic=${encodeURIComponent(state.community.topic)}&limit=40`, null);
  state.community.items = data && data.items ? data.items : state.community.topic === 'all' ? FALLBACK_POSTS : [];
  if (data && data.topics) state.community.topics = data.topics;
  state.offline = !data;
}

async function viewCommunity() {
  await loadCommunity();
  const topics = state.community.topics.length ? state.community.topics : DEFAULT_TOPICS;
  return `<div class="page-title"><span class="eyebrow">COMMUNITY</span><h1>社区</h1><p>和同样热爱 HipHop 与 K-POP 的人，分享演出、新作和你的宝藏安利。</p><button class="cta" onclick="openPostComposer()">＋ 发布内容</button></div>
    ${offlineNotice()}
    <section class="section"><div class="chips">${topics.map((topic) => `<button class="chip ${state.community.topic === topic.key ? 'active' : ''}" onclick="setCommunityTopic('${topic.key}')">${esc(topic.label)}</button>`).join('')}</div>
      <div class="community-list">${state.community.items.map(postCard).join('') || emptyState('这个话题下还没有帖子，来发第一帖。')}</div></section>`;
}

/* --------------------------------- profile -------------------------------- */

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
  else if (state.page === 'discover') view.innerHTML = await viewDiscover();
  else if (state.page === 'community') view.innerHTML = await viewCommunity();
  else if (state.page === 'profile') view.innerHTML = viewProfile();
}

async function navigate(page) {
  if (page !== 'detail' && page !== 'artist') state.page = page;
  if (['home', 'charts', 'discover', 'community'].includes(page)) $('#view').innerHTML = loading();
  if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
  await paint();
}

function backFromDetail() {
  const page = state.lastDetail.page && !['detail', 'artist'].includes(state.lastDetail.page) ? state.lastDetail.page : 'home';
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
  state.detail = { kind: 'album', item: album, tracks, artists };
  const liked = state.liked.has(album.id);
  const artistLink = album.artistId
    ? `<div class="artist" onclick="artistDetail('${esc(album.artistId)}')">${esc(album.artist)}</div>`
    : `<div class="artist">${esc(album.artist)}</div>`;
  const tags = tagLine(album).join(' · ');
  $('#view').innerHTML = `<div class="detail"><span class="back" onclick="backFromDetail()">← 返回</span>
    <div class="detail-hero"><div class="detail-cover">${cover(album)}</div><div>
      <span class="eyebrow">${album.kind === 'single' ? 'SINGLE' : 'ALBUM'} · ${esc(yearOf(album) || '')}${tags ? ' · ' + esc(tags) : ''}</span>
      <h1>${esc(album.title)}</h1>${artistLink}
      <div class="detail-meta"><span>发行日期 <b>${esc(album.releaseDate || '待同步')}</b></span><span>曲目 <b>${tracks.length || album.trackCount || 0}</b></span><span>评分 <b>${album.score != null ? Number(album.score).toFixed(1) : '—'}</b></span></div>
      ${listenCta(album)}
      <button class="ghost" onclick="toggleLike('${esc(album.id)}')">${liked ? '♥ 已收藏' : '♡ 收藏'}</button>
    </div></div>
    <div class="review-box"><b>HIPKOP 编辑短评</b><p>${esc(album.desc || `${album.title} · ${album.artist}`)}</p>
      <div class="track-box"><h3>曲目列表 (${tracks.length})</h3>${tracks.length ? tracks.map((track, index) => trackRow(track, index)).join('') : '<p class="single-meta">曲目尚未同步，正在后台获取。</p>'}</div>
      ${artists && artists.length ? `<p class="single-meta">艺人：${artists.map((a) => `<a onclick="artistDetail('${esc(a.id)}')">${esc(a.name)}</a>`).join(' · ')}</p>` : ''}
    </div></div>`;
}

function renderTrack(data) {
  const { track, album, artists } = data;
  state.detail = { kind: 'track', item: track, tracks: [], artists };
  const liked = state.liked.has(track.id);
  const tags = tagLine(track).join(' · ');
  $('#view').innerHTML = `<div class="detail"><span class="back" onclick="backFromDetail()">← 返回</span>
    <div class="detail-hero"><div class="detail-cover">${cover(album || track)}</div><div>
      <span class="eyebrow">SINGLE · ${esc(yearOf(track) || '')}${tags ? ' · ' + esc(tags) : ''}</span>
      <h1>${esc(track.title)}</h1>
      ${artists && artists.length ? `<div class="artist" onclick="artistDetail('${esc(artists[0].id)}')">${esc(track.artist)}</div>` : `<div class="artist">${esc(track.artist)}</div>`}
      <div class="detail-meta"><span>发行日期 <b>${esc(track.releaseDate || '待同步')}</b></span><span>时长 <b>${track.durationMs ? Math.round(track.durationMs / 1000) + 's' : '—'}</b></span></div>
      ${listenCta(track)}
      <button class="ghost" onclick="toggleLike('${esc(track.id)}')">${liked ? '♥ 已收藏' : '♡ 收藏'}</button>
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
  state.offline = false;
  const { artist, albums, tracks } = data;
  const tags = [artist.genre, bucketLabel(artist.genreBucket), sceneLabel(artist.scene), artist.region].filter(Boolean).join(' · ');
  view.innerHTML = `<div class="artist-page"><span class="back" onclick="backFromDetail()">← 返回</span>
    <div class="artist-hero" style="background-image:url('${esc(artist.heroUrl)}')"><div class="artist-overlay"></div>
      <div class="artist-info">${avatar(artist)}<div>
        <span class="eyebrow">${esc(tags || '艺人')}</span>
        <h1>${esc(artist.name)}</h1><p>${esc(artist.bio || '暂无简介，资料来自元数据 Provider。')}</p>
        <button class="cta" onclick="followArtist()">＋ 关注艺人</button>
      </div></div></div>
    ${offlineNotice()}
    <section class="section"><div class="section-head"><h2>代表专辑 (${albums.length})</h2></div><div class="cards">${albums.length ? albums.map(albumCard).join('') : emptyState('暂无关联专辑')}</div></section>
    <section class="section"><div class="section-head"><h2>关联单曲 (${tracks.length})</h2></div><div class="track-box">${tracks.length ? tracks.slice(0, 12).map((track, index) => trackRow(track, index, { listen: false })).join('') : emptyState('暂无关联单曲')}</div></section></div>`;
}/* ------------------------------ interactions ------------------------------ */

function followArtist() {
  toast('已关注该艺人');
}

function randomPick() {
  const pool = state.releases.length ? state.releases : FALLBACK_ALBUMS;
  state.pick = pool[Math.floor(Math.random() * pool.length)];
  return state.pick;
}

function toggleLike(id) {
  state.liked.has(id) ? state.liked.delete(id) : state.liked.add(id);
  toast(state.liked.has(id) ? '已加入收藏' : '已取消收藏');
  if (state.page === 'detail' && state.detail.kind === 'track') renderTrack({ track: state.detail.item, album: null, artists: state.detail.artists });
}

async function setChartTab(key) {
  state.chartTab = key;
  await paint();
}

async function setChartSort(sort) {
  state.chartSort = sort;
  await paint();
}

async function setBrowse(key, value) {
  state.browse[key] = value;
  await paint();
}

function setBrowseBucket(value) {
  return setBrowse('bucket', value);
}

function setBrowseScene(value) {
  return setBrowse('scene', value);
}

function setBrowseYear(value) {
  return setBrowse('year', value);
}

function setBrowseSort(value) {
  return setBrowse('sort', value);
}

async function setCommunityTopic(topic) {
  state.community.topic = topic;
  await paint();
}

/* --------------------------------- sheet ---------------------------------- */

function openSheet(html) {
  const sheet = $('#sheet');
  if (!sheet) return;
  $('#sheetCard').innerHTML = html;
  sheet.classList.remove('hidden');
}

function closeSheet() {
  const sheet = $('#sheet');
  if (sheet) sheet.classList.add('hidden');
}

function openListen(item) {
  const platforms = (item && item.listen && item.listen.platforms) || [];
  if (!platforms.length) return toast('暂无可用的收听平台');
  const rows = platforms
    .map((platform) => `<a class="platform ${platform.exact ? 'exact' : ''}" href="${esc(platform.url)}" target="_blank" rel="noopener"><b>${esc(platform.name)}</b><span>${platform.exact ? '已匹配条目' : '搜索完整版'} · ${esc(platform.note)}</span></a>`)
    .join('');
  openSheet(`<h3>选择收听平台</h3><p class="sheet-sub">${esc(item.title || '')}${item.artist ? ' · ' + esc(item.artist) : ''}</p><div class="platform-list">${rows}</div><p class="sheet-note">本页只做跳转，完整曲目在对应平台内播放。</p>`);
}

function openListenById(id) {
  const item = listenIndex.get(id) || state.detail.item;
  if (item) openListen(item);
}

function openPostComposer() {
  const topics = (state.community.topics.length ? state.community.topics : DEFAULT_TOPICS).filter((topic) => topic.key !== 'all');
  openSheet(`<h3>发布内容</h3>
    <label class="field"><span>话题</span><select id="postTopic">${topics.map((topic) => `<option value="${topic.key}" ${state.community.topic === topic.key ? 'selected' : ''}>${esc(topic.label)}</option>`).join('')}</select></label>
    <label class="field"><span>标题</span><input id="postTitle" maxlength="120" placeholder="一句话说清你想聊什么"></label>
    <label class="field"><span>正文</span><textarea id="postBody" rows="4" maxlength="2000" placeholder="展开说说，或者安利你的宝藏歌手 / 歌曲…"></textarea></label>
    <button class="cta" onclick="submitPost()">发布</button>`);
}

async function submitPost() {
  const topic = $('#postTopic').value;
  const title = ($('#postTitle').value || '').trim();
  const body = ($('#postBody').value || '').trim();
  if (!title || !body) return toast('标题和正文都不能为空');
  try {
    const response = await fetch('/api/community/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, body })
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
  } catch (error) {
    return toast('发布失败，请稍后再试');
  }
  closeSheet();
  toast('已发布');
  state.community.topic = topic;
  await paint();
}

function toast(message) {
  const element = $('#toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 2200);
}

function toggleSearch() {
  const bar = $('#searchbar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) $('#searchInput').focus();
}

function search() {
  const query = ($('#searchInput').value || '').trim();
  if (!query) return;
  navigate('discover').then(() => {
    const input = $('#discoverInput');
    if (input) input.value = query;
    runDiscover(query);
  });
}

let discoverTimer = null;
function onDiscoverInput() {
  clearTimeout(discoverTimer);
  discoverTimer = setTimeout(() => runDiscover(), 350);
}

async function runDiscover(explicitQuery) {
  const root = $('#discoverResults');
  if (!root) return;
  const query = (explicitQuery != null ? explicitQuery : $('#discoverInput') ? $('#discoverInput').value : '').trim();
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
  const providers = (data.providers || [])
    .map((provider) => `<div class="status-row"><b>${esc(provider.label)}</b><span>${provider.available ? '可用' : provider.configured ? '冷却中' : '未配置'}${provider.requiresKey && !provider.configured ? ' · 需要 API Key' : ''}</span></div>`)
    .join('');
  const consistency = data.consistency || {};
  const issues = Object.entries(consistency).filter(([, value]) => value > 0);
  openSheet(`<h3>目录与 Provider 状态</h3>
    <div class="stat-strip compact"><div><b>${esc(data.stats.artists)}</b><span>艺人</span></div><div><b>${esc(data.stats.albums)}</b><span>专辑</span></div><div><b>${esc(data.stats.tracks)}</b><span>曲目</span></div></div>
    <div class="status-list">${providers}</div>
    <p class="sheet-note">一致性检查：${issues.length ? issues.map(([key, value]) => `${esc(key)} ${esc(value)}`).join(' · ') : '全部通过 ✓'}</p>`);
}

/* --------------------------------- boot ----------------------------------- */

navigate('home');