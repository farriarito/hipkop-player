'use strict';

/* HIPKOP PLAYER front-end.
 *
 * Every view is fed by the JSON API:
 *   /api/releases  /api/charts  /api/albums  /api/artists/:id  /api/albums/:id
 *   /api/tracks/:id  /api/search  /api/categories  /api/community/posts
 * Each album/track carries `listen.platforms`, so "听完整版" jumps straight to
 * QQ 音乐 / 网易云 / Apple Music instead of stopping at a 30s preview. The
 * Empty/offline states never stand in for real catalog or community records.
 */

/* ------------------------------- fallback -------------------------------- */

// Offline and empty states are deliberately empty: never fabricate music or people.
const FALLBACK_ALBUMS = [];
const FALLBACK_ARTISTS = [];
const FALLBACK_POSTS = [];

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
  { key: 'hiphop', label: 'HipHop' },
  { key: 'kpop', label: 'K-POP' }
];

const BUCKET_TABS = [
  { key: 'all', label: '全部风格' },
  { key: 'hiphop', label: 'HipHop' },
  { key: 'kpop', label: 'K-POP' },
  { key: 'other', label: '其他' }
];

const SORT_TABS = [
  { key: 'date', label: '最新发行' },
  { key: 'popularity', label: '榜单热度' },
  { key: 'score', label: '评分优先' }
];

/* -------------------------------- state ---------------------------------- */

const state = {
  page: 'home',
  liked: new Set(Object.keys(loadFavorites())),
  offline: false,
  lastDetail: { page: 'home', id: null },
  releases: [],
  charts: [],
  hero: [],
  heroIndex: 0,
  pick: null,
  homeNewIds: new Set(),
  chartTab: 'all',
  chartSort: 'popularity',
  discover: null,
  browse: { bucket: 'all', year: 'all', sort: 'date', items: [] },
  archivePicks: [],
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

// Keyboard activation for elements rendered with role="button" instead of a
// native <button> (inline onclick keeps the existing call contract).
function activateKey(event) {
  if (!event) return;
  const key = event.key;
  if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return;
  event.preventDefault();
  const target = event.currentTarget || event.target;
  if (target && typeof target.click === 'function') target.click();
}

const bucketLabel = (bucket) => ({ hiphop: 'HipHop', kpop: 'K-POP', other: '其他' }[bucket] || '');
const yearOf = (item) => item.year || String(item.releaseDate || '').slice(0, 4);
const topicLabel = (key) => {
  const topics = state.community.topics.length ? state.community.topics : DEFAULT_TOPICS;
  const match = topics.find((topic) => topic.key === key);
  return match ? match.label : key;
};

function tagLine(item) {
  const tags = [item.genre, bucketLabel(item.genreBucket)].filter(Boolean);
  const seen = new Set();
  return tags.filter((tag) => {
    const key = String(tag).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function heatPercent(item) {
  // The Provider already maps chart rank to 0–100. Do not manufacture heat
  // from comments, editorial scores or the currently displayed subset.
  return item.popularity == null ? null : Math.max(0, Math.min(100, Math.round(Number(item.popularity))));
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
  const url = window.HipkopCulture.resource(item.coverUrl, item.id && !/^(undefined|null)$/.test(item.id) ? `/media/cover/${encodeURIComponent(item.id)}` : '/hipkop-logo.svg');
  const alt = item.title || item.name || '专辑封面';
  return `<div class="cover${extra ? ` ${extra}` : ''}"><img src="${esc(url)}" alt="${esc(alt)}" width="300" height="300" loading="lazy" decoding="async" onerror="this.style.display='none';this.closest('.cover')&&this.closest('.cover').classList.add('img-fallback')"><span>${esc(item.genre || item.kind || '')}</span></div>`;
}

function avatar(item, cls = '') {
  const url = window.HipkopCulture.resource(item.avatarUrl, item.id && !/^(undefined|null)$/.test(item.id) ? `/media/avatar/${encodeURIComponent(item.id)}` : '/hipkop-logo.svg');
  const alt = item.name || item.artist || '艺人头像';
  return `<img ${cls ? `class="${cls}" ` : ''}src="${esc(url)}" alt="${esc(alt)}" width="48" height="48" loading="lazy" decoding="async" onerror="this.style.display='none';var host=this.closest('.avatar-wrap,.artist-info,.artist-result,.avatar');if(host)host.classList.add('img-fallback')">`;
}

function albumCard(album) {
  const year = yearOf(album);
  const label = `打开专辑 ${album.title || ''}${album.artist ? ' · ' + album.artist : ''}`;
  return `<article class="card" data-work-id="${esc(album.id)}"><button type="button" class="card-open" aria-label="${esc(label)}" onclick="openItem('${esc(album.id)}')">${cover(album)}<h3>${esc(album.title)}</h3><p>${esc(album.artist)}${year ? ' · ' + esc(year) : ''}</p></button>${window.HipkopCulture.actions(album, state.liked.has(album.id))}</article>`;
}

function releaseCard(album) {
  const label = `打开${album.kind === 'single' ? '单曲' : '专辑'} ${album.title || ''}${album.artist ? ' · ' + album.artist : ''}`;
  return `<article class="release-card" role="button" tabindex="0" aria-label="${esc(label)}" onclick="openItem('${esc(album.id)}')" onkeydown="activateKey(event)">${cover(album)}<h3>${esc(album.title)}</h3><p>${esc(album.artist)}</p><small>${album.kind === 'single' ? '单曲' : '专辑'} · ${esc(album.releaseDate || yearOf(album) || '')}</small></article>`;
}

function listenButton(item, label) {
  const platforms = (item && item.listen && item.listen.platforms) || [];
  if (!platforms.length) return '';
  listenIndex.set(item.id, item);
  const primary = platforms.find((platform) => platform.key === 'qq') || platforms[0];
  const name = primary.name || '外部平台';
  return `<a class="track-listen" href="${esc(primary.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="在${esc(name)}收听完整版" aria-label="在${esc(name)}收听完整版"><span aria-hidden="true">↗</span>${label ? `<i>${esc(label)}</i>` : ''}</a>`;
}

function listenCta(item) {
  const platforms = (item.listen && item.listen.platforms) || [];
  if (!platforms.length) return '';
  listenIndex.set(item.id, item);
  const primary = platforms.find((platform) => platform.key === 'qq') || platforms[0];
  const name = primary.name || '外部平台';
  return `<div class="listen-row"><button class="cta preview-cta" type="button" onclick="playWork('${esc(item.id)}')"><span class="play-shape" aria-hidden="true"></span>播放试听</button><a class="ghost" href="${esc(primary.url)}" target="_blank" rel="noopener">在${esc(name)}听完整版 <span aria-hidden="true">↗</span></a><button class="ghost" type="button" onclick="openListenById('${esc(item.id)}')" aria-label="选择收听平台：${esc(item.title || '')}" title="选择收听平台">选择收听平台</button></div>`;
}

function trackRow(track, index, options = {}) {
  const label = track.trackNumber != null ? String(track.trackNumber).padStart(2, '0') : index != null ? String(index + 1).padStart(2, '0') : '♪';
  const listen = options.listen === false ? '' : `<button class="track-preview" type="button" onclick="event.stopPropagation();playWork('${esc(track.id)}')" aria-label="播放 ${esc(track.title)} 试听"><span class="play-shape" aria-hidden="true"></span></button>${listenButton(track, '')}`;
  const name = `打开曲目 ${track.title || ''}${track.artist ? ' · ' + track.artist : ''}`;
  return `<div class="track${options.thumbnail ? ' track-with-art' : ''}" role="button" tabindex="0" aria-label="${esc(name)}" onclick="openItem('${esc(track.id)}')" onkeydown="activateKey(event)">${options.thumbnail ? cover(track, 'track-cover') : `<span aria-hidden="true">${label}</span>`}<b>${esc(track.title)}</b><em>${esc(track.artist || track.albumTitle || '')}</em>${listen}</div>`;
}

function artistResult(artist) {
  const tags = [artist.genre, bucketLabel(artist.genreBucket)].filter(Boolean).join(' · ');
  return `<div class="artist-result" role="button" tabindex="0" aria-label="查看艺人 ${esc(artist.name || '')}" onclick="artistDetail('${esc(artist.id)}')" onkeydown="activateKey(event)">${avatar(artist)}<div><b>${esc(artist.name)}</b><small>${esc(tags || '艺人')}${artist.region ? ' · ' + esc(artist.region) : ''}</small></div><span aria-hidden="true">→</span></div>`;
}

function postCard(post) {
  return window.HipkopCulture.post(post, topicLabel(post.topic));
}

const loading = (text = '正在加载…') => `<section class="section loading-block" role="status" aria-label="${esc(text)}"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></section>`;
const emptyState = (text) => `<p class="empty">${esc(text)}</p>`;
let renderRevision = 0;
let chartRequest = 0;
let browseRequest = 0;
let communityRequest = 0;
let searchRequest = 0;

function backButton() {
  return '<span class="back" role="button" tabindex="0" aria-label="返回" onclick="backFromDetail()" onkeydown="activateKey(event)"><span aria-hidden="true">←</span> 返回</span>';
}

function offlineNotice() {
  return state.offline ? `<section class="section" role="status"><div class="discover-hint">目录暂时离线。请稍后重试；HIPKOP 不用示例内容替代真实数据。</div></section>` : '';
}

/* ------------------------------ home pieces -------------------------------- */

function heroSlides() {
  return state.hero.length ? state.hero : FALLBACK_ALBUMS.slice(0, 3);
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// Shared pool for 今日同频: prefer works that are NOT already shown in the
// 新作 strip so the first screen never repeats the same album three times.
function pickPool() {
  const all = state.releases.length ? state.releases : FALLBACK_ALBUMS;
  const excluded = state.homeNewIds instanceof Set ? state.homeNewIds : new Set();
  const preferred = all.filter((item) => !excluded.has(item.id));
  return preferred.length ? preferred : all;
}

function dailyPick() {
  const pool = pickPool();
  const day = Math.floor(Date.now() / 86400000);
  return pool[day % pool.length];
}

function pickView() {
  const pick = state.pick || dailyPick();
  if (!pick) return emptyState('暂无推荐，等待同步完成。');
  const kind = pick.kind === 'single' ? 'SINGLE' : 'ALBUM';
  const tags = tagLine(pick).join(' · ');
  const label = `今天听点儿 ${pick.title || ''}${pick.artist ? ' · ' + pick.artist : ''}`;
  return `<div class="pick-card" role="button" tabindex="0" aria-label="${esc(label)}" onclick="openItem('${esc(pick.id)}')" onkeydown="activateKey(event)">${cover(pick, 'pick-cover')}<div><span class="eyebrow">${kind} / 随机相遇</span><h3>${esc(pick.title)}</h3><p>${esc(pick.artist)}${tags ? ' · ' + esc(tags) : ''}</p></div><span class="pick-arrow" aria-hidden="true">↗</span></div>`;
}

function statStrip() {
  const stats = state.stats || { artists: 0, albums: 0, tracks: 0, posts: 0 };
  return `<section class="stat-strip">
    <button type="button" aria-label="浏览 ${esc(stats.artists)} 位收录歌手，前往发现页搜索" onclick="statGo('artists')"><b>${esc(stats.artists)}</b><span>收录歌手</span></button>
    <button type="button" aria-label="浏览 ${esc(stats.albums)} 张专辑与单曲，前往发现页筛选" onclick="statGo('albums')"><b>${esc(stats.albums)}</b><span>专辑 / 单曲</span></button>
    <button type="button" aria-label="查看 ${esc(stats.posts)} 条社区帖子" onclick="statGo('posts')"><b>${esc(stats.posts)}</b><span>社区帖子</span></button>
  </section>`;
}

// The stat strip reads as tappable, so each cell routes somewhere real:
// artists -> discover with the search field focused, albums -> the discover
// filter block, posts -> the community feed.
async function statGo(kind) {
  if (kind === 'posts') return navigate('community');
  await navigate('discover');
  if (kind === 'artists') {
    const input = $('#discoverInput');
    if (input) {
      if (typeof input.focus === 'function') input.focus();
      if (typeof input.select === 'function') input.select();
    }
    return;
  }
  const target = $('#browseSection');
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
}/* --------------------------------- pages ---------------------------------- */

function sortByReleaseDateDesc(items) {
  return items.slice().sort((a, b) => {
    const da = a.releaseDate || '';
    const db = b.releaseDate || '';
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? 1 : da > db ? -1 : 0;
  });
}

// Splits /api/releases into two disjoint groups for the home feed: the newest
// 8 feed 新作, the highest-scored of the remaining items feed 编辑推荐.
function splitHomeReleases(releases) {
  const ordered = sortByReleaseDateDesc(releases);
  const newReleases = ordered.slice(0, 8);
  const newIds = new Set(newReleases.map((item) => item.id));
  const editorsPicks = ordered
    .filter((item) => !newIds.has(item.id))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, 4);
  if (editorsPicks.length < 4) {
    for (const item of newReleases) {
      if (editorsPicks.length >= 4) break;
      if (!editorsPicks.some((pick) => pick.id === item.id)) editorsPicks.push(item);
    }
  }
  return { newReleases, editorsPicks };
}

// 曲风入口：不再区分主流/地下，只按曲风（HipHop / K-POP）切到对应榜单 tab。
const SCENE_ENTRIES = [
  { key: 'hiphop', en: 'HIPHOP', label: 'HipHop', sub: '说唱发行 · 榜单' },
  { key: 'kpop', en: 'K-POP', label: 'K-POP', sub: '流行发行 · 榜单' }
];

function sceneRail() {
  const cards = SCENE_ENTRIES
    .map((scene) => `<div class="feature" role="button" tabindex="0" aria-label="查看${esc(scene.label)}榜单" onclick="goScene('${scene.key}')" onkeydown="activateKey(event)"><b>${esc(scene.en)}</b><h3>${esc(scene.label)}</h3><p>${esc(scene.sub)}</p></div>`)
    .join('');
  return `<section class="section scene-rail"><div class="section-head"><h2>曲风入口</h2></div><div class="feature-grid">${cards}</div></section>`;
}

async function goScene(tab) {
  if (state.page === 'charts') return setChartTab(tab);
  state.chartTab = tab;
  return navigate('charts');
}

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
  // Keep state.pick: 「换一个」 sets it and the re-render must not wipe it.

  const { newReleases, editorsPicks } = splitHomeReleases(state.releases);
  state.homeNewIds = new Set(newReleases.map((item) => item.id));
  const charts = state.charts.slice(0, 10);
  const posts = state.community.items.slice(0, 3);
  return `${offlineNotice()}${window.HipkopExhibition.stage(state.hero)}
    ${statStrip()}
    ${sceneRail()}
    <section class="section releases-section"><div class="section-head"><h2>新作声场</h2><a role="button" tabindex="0" aria-label="查看全部新作" onclick="navigate('discover')" onkeydown="activateKey(event)">全部 <span aria-hidden="true">↗</span></a></div><div class="release-scroller">${newReleases.map(releaseCard).join('')}</div><div class="rail-meter" aria-hidden="true"><span></span></div><div class="rail-caption"><span>按发行时间排列</span><span>滑动探索 <span aria-hidden="true">→</span></span></div></section>
    <section class="section daily-section"><div class="section-head"><h2>今天听点儿</h2><button class="section-action" type="button" aria-label="换一个推荐" onclick="refreshPick()">换一个 <span aria-hidden="true">↻</span></button></div><div id="dailyPick">${pickView()}</div></section>
    <section class="section radar-section"><div class="section-head"><h2>私人雷达</h2><a role="button" tabindex="0" aria-label="查看全部私人雷达作品" onclick="navigate('discover')" onkeydown="activateKey(event)">查看全部 <span aria-hidden="true">↗</span></a></div><div class="cards">${editorsPicks.map(albumCard).join('')}</div></section>
    <section class="section top10-section"><div class="section-head"><h2>今日top10</h2><a role="button" tabindex="0" aria-label="查看完整榜单" onclick="navigate('charts')" onkeydown="activateKey(event)">完整榜单 <span aria-hidden="true">↗</span></a></div><div class="rank-list">${charts.map((album, index) => rankRow(album, index)).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>声音之外</h2><a role="button" tabindex="0" aria-label="进入社区" onclick="navigate('community')" onkeydown="activateKey(event)">进入社区 <span aria-hidden="true">↗</span></a></div><div class="community-list">${posts.map(postCard).join('')}</div></section>`;
}

async function loadCharts() {
  const revision = ++chartRequest;
  const params = new URLSearchParams({ sort: state.chartSort, limit: '50' });
  if (state.chartTab === 'kpop') params.set('genre', 'kpop');
  else if (state.chartTab === 'hiphop') params.set('genre', 'hiphop');
  const data = await safeApi(`/api/charts?${params}`, null);
  if (revision !== chartRequest) return false;
  state.charts = data && data.items ? data.items : [];
  state.offline = !data;
  return true;
}

function rankRow(album, index, context) {
  const metric = context === 'charts'
    ? state.chartSort === 'date'
      ? esc(album.releaseDate || yearOf(album) || '—')
      : state.chartSort === 'popularity'
        ? album.popularity == null
          ? '<span class="rank-heat-none" title="该专辑暂无榜单热度数据">—</span>'
          : `${heatPercent(album)}%`
        : album.score != null ? Number(album.score).toFixed(1) : '—'
    : album.score != null ? Number(album.score).toFixed(1) : '—';
  const sub = `${esc(album.artist)}${album.genre ? ' · ' + esc(album.genre) : ''}${context === 'charts' && album.year ? ' · ' + esc(album.year) : ''}`;
  return `<div class="rank" role="button" tabindex="0" aria-label="第 ${index + 1} 名 ${esc(album.title || '')} · ${esc(album.artist || '')}" onclick="openItem('${esc(album.id)}')" onkeydown="activateKey(event)"><span class="rank-no" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>${cover(album, 'rank-cover')}<div><div class="rank-name">${esc(album.title)}</div><div class="rank-artist">${sub}</div></div>${context === 'charts' ? `<span class="score">${metric}</span>` : '<span class="rank-open" aria-hidden="true">↗</span>'}</div>`;
}

function chartsList() {
  if (!state.charts.length) return emptyState('暂无榜单数据。首次同步完成后将显示真实榜单。');
  return `${window.HipkopCulture.podium(state.charts, cover, id => state.liked.has(id))}<div class="chart-list-heading"><h2>继续听下去</h2><span>${state.charts.length} 张入榜作品</span></div><div class="rank-list">${state.charts.slice(3).map((album, index) => `${rankRow(album, index + 3, 'charts')}<div class="rank-row-actions">${window.HipkopCulture.actions(album, state.liked.has(album.id))}</div>`).join('')}</div>`;
}

async function viewCharts() {
  await loadCharts();
  return `<div class="page-title charts-title"><span class="eyebrow">THE CHART STAGE</span><h1>榜单</h1><p class="page-deck">此刻的声音，站上展台。</p><div id="chartInfo">${window.HipkopCulture.chartInfo(state.charts, state.chartSort)}</div></div><section class="chart-controls" aria-label="榜单筛选">
    <div class="chips" role="group" aria-label="榜单分类">${CHART_TABS.map((tab) => `<button class="chip ${state.chartTab === tab.key ? 'active' : ''}" type="button" aria-pressed="${state.chartTab === tab.key}" onclick="setChartTab('${tab.key}')">${esc(tab.label)}</button>`).join('')}</div>
    <div class="chart-periods" role="group" aria-label="榜单周期"><button type="button" class="period-current" aria-pressed="true">当前快照</button>${['日榜', '周榜', '月榜'].map(label => `<button type="button" disabled title="尚未保存独立周期榜单">${label}</button>`).join('')}<span>历史周期未收录</span></div>
    <div class="sort-row"><label for="chartSort">排序</label><select id="chartSort" onchange="setChartSort(this.value)">
      <option value="popularity" ${state.chartSort === 'popularity' ? 'selected' : ''}>榜单热度</option>
      <option value="score" ${state.chartSort === 'score' ? 'selected' : ''}>目录编辑分</option>
      <option value="date" ${state.chartSort === 'date' ? 'selected' : ''}>最新发行</option>
    </select></div></section>
    ${offlineNotice()}<section class="section" id="chartList">${chartsList()}</section>`;
}

/* -------------------------------- discover -------------------------------- */

function discoverHint() {
  return '<div class="discover-idle"><span aria-hidden="true">↗</span><p>从一个名字开始。<br><small>艺人、专辑、单曲，都能找到新的入口。</small></p></div>';
}

function yearTabs() {
  const now = new Date().getFullYear();
  const years = [{ key: 'all', label: '全部年份' }];
  for (let year = now; year >= now - 8; year -= 1) years.push({ key: String(year), label: String(year) });
  return years;
}

async function loadBrowse() {
  const revision = ++browseRequest;
  const params = new URLSearchParams({ limit: '40', sort: state.browse.sort });
  if (state.browse.bucket !== 'all') params.set('bucket', state.browse.bucket);
  if (state.browse.year !== 'all') params.set('year', state.browse.year);
  const data = await safeApi(`/api/albums?${params}`, null);
  if (revision !== browseRequest) return false;
  state.browse.items = data && data.items ? data.items : [];
  return Boolean(data);
}

function browseListHtml() {
  if (!state.browse.items.length) return emptyState('这个筛选下还没有作品，换个条件试试。');
  return `<div class="cards">${state.browse.items.map(albumCard).join('')}</div>`;
}

function filterStatus() {
  const active = [];
  if (state.browse.bucket !== 'all') active.push(bucketLabel(state.browse.bucket));
  if (state.browse.year !== 'all') active.push(state.browse.year);
  if (state.browse.sort !== 'date') active.push(SORT_TABS.find(item => item.key === state.browse.sort)?.label);
  return `<span>${active.length ? '筛选已启用 · ' + esc(active.filter(Boolean).join(' / ')) : '全部档案 · 最新发行'} · ${state.browse.items.length} 张作品</span>${active.length ? '<button type="button" onclick="clearBrowseFilters()">一键清除 ↺</button>' : ''}`;
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
  const note = result.cached ? '唱片档案' : '新发现';
  return `<div class="discover-hint">${note} · 艺人 ${counts.artists} · 专辑 ${counts.albums} · 单曲 ${counts.tracks}</div>
    <div class="result-group"><h3>艺人 (${counts.artists})</h3>${results.artists.map(artistResult).join('') || emptyState('无匹配艺人')}</div>
    <div class="result-group"><h3>专辑 (${counts.albums})</h3><div class="cards">${results.albums.map(albumCard).join('') || emptyState('无匹配专辑')}</div></div>
    <div class="result-group"><h3>单曲 (${counts.tracks})</h3>${results.tracks.slice(0, 12).map((track, index) => `<div class="search-track">${trackRow(track, index, { listen: false, thumbnail: true })}${window.HipkopCulture.actions(track, state.liked.has(track.id))}</div>`).join('') || emptyState('无匹配单曲')}</div>`;
}

async function viewDiscover() {
  const [loaded, hiphop, kpop] = await Promise.all([
    loadBrowse(), safeApi('/api/albums?bucket=hiphop&sort=date&limit=8', null),
    safeApi('/api/albums?bucket=kpop&sort=date&limit=8', null)
  ]);
  state.offline = !loaded;
  state.archivePicks = [...(hiphop?.items || []), ...(kpop?.items || [])];
  const years = yearTabs();
  const chips = (tabs, key, setter, groupLabel) =>
    `<div class="chips" role="group" aria-label="${esc(groupLabel)}">${tabs.map((tab) => `<button class="chip ${key === tab.key ? 'active' : ''}" type="button" aria-pressed="${key === tab.key}" onclick="${setter}('${tab.key}')">${esc(tab.label)}</button>`).join('')}</div>`;
  return `<div class="page-title"><span class="eyebrow">THE RECORD ARCHIVE</span><h1>发现<span class="page-word">声场</span></h1><p>从一个名字，找到新的频率。</p></div>
    <section class="section discover-search"><form class="inline-search" onsubmit="event.preventDefault();runDiscover()"><input id="discoverInput" value="${esc(state.discover?.query || '')}" aria-label="搜索艺人、专辑、单曲或组合" placeholder="搜索艺人、专辑、单曲或组合" oninput="onDiscoverInput()" type="search"><button type="submit">搜索</button></form><div id="discoverResults" role="region" aria-label="搜索结果" aria-live="polite">${searchResultsHtml(state.discover)}</div></section>
    ${window.HipkopCulture.archive(state.archivePicks, cover, id => state.liked.has(id))}
    ${offlineNotice()}
    <section class="section archive-filter" id="browseSection"><div class="section-head"><h2>唱片索引</h2></div>
      <div class="filter-block"><label>风格</label>${chips(BUCKET_TABS, state.browse.bucket, 'setBrowseBucket', '风格筛选')}</div>
      <div class="filter-block"><label>年份</label>${chips(years, state.browse.year, 'setBrowseYear', '年份筛选')}</div>
      <div class="sort-row"><label for="browseSort">排序</label><select id="browseSort" onchange="setBrowseSort(this.value)">${SORT_TABS.map((tab) => `<option value="${tab.key}" ${state.browse.sort === tab.key ? 'selected' : ''}>${esc(tab.label)}</option>`).join('')}</select></div>
      <div id="filterStatus" role="status">${filterStatus()}</div><div id="browseResults" aria-live="polite">${browseListHtml()}</div>
    </section>`;
}/* -------------------------------- community -------------------------------- */

async function loadCommunity() {
  const revision = ++communityRequest;
  const data = await safeApi(`/api/community/posts?topic=${encodeURIComponent(state.community.topic)}&limit=40`, null);
  if (revision !== communityRequest) return false;
  state.community.items = data && data.items ? data.items : state.community.topic === 'all' ? FALLBACK_POSTS : [];
  if (data && data.topics) state.community.topics = data.topics;
  state.offline = !data;
  return true;
}

async function viewCommunity() {
  await loadCommunity();
  const topics = state.community.topics.length ? state.community.topics : DEFAULT_TOPICS;
  return `<div class="page-title"><span class="eyebrow">VOICES FROM THE FLOOR</span><h1>同频<span class="page-word">社区</span></h1><p>新作、现场、私藏。好音乐，值得聊。</p><button class="cta" type="button" aria-label="发布内容：写一帖" onclick="openPostComposer()"><span aria-hidden="true">＋</span> 写一帖</button></div>
    ${offlineNotice()}
    <section class="section wall-section"><div class="chips" role="group" aria-label="社区话题">${topics.map((topic) => `<button class="chip ${state.community.topic === topic.key ? 'active' : ''}" type="button" aria-pressed="${state.community.topic === topic.key}" onclick="setCommunityTopic('${topic.key}')">${esc(topic.label)}</button>`).join('')}</div>
      <div class="wall-heading"><span>文化留言墙</span><span id="communityCount">${state.community.items.length} 段声音 · 当前分类</span></div><div id="communityFeed" class="community-list" aria-live="polite">${window.HipkopCulture.wall(state.community.items, topicLabel)}</div></section>`;
}

/* --------------------------------- profile -------------------------------- */

function loadFavorites() {
  try { return JSON.parse(localStorage.getItem('hipkop.favorites.v1') || '{}'); }
  catch { return {}; }
}

function viewProfile() {
  const saved = Object.values(loadFavorites());
  return `<div class="page-title profile-title"><span class="eyebrow">YOUR LISTENING ARCHIVE</span><h1>我的<span class="page-word">唱片架</span></h1><p>留下喜欢的，下次接着听。</p></div>
    <div class="profile-card"><div class="avatar" aria-hidden="true"><img src="/hipkop-logo.svg" alt="" width="56" height="56"></div><div><h2>私藏 ${saved.length}</h2><p>收藏保存在这台设备</p></div><button type="button" class="ghost" onclick="navigate('discover')">找张唱片 ↗</button></div>
    <section class="section collection-section"><div class="section-head"><h2>私藏唱片</h2></div><div class="cards" id="collectionList">${saved.length ? saved.map(albumCard).join('') : emptyState('还没有私藏。打开一张作品，点一下收藏。')}</div></section>
    <div class="menu"><button class="menu-item" type="button" onclick="navigate('community')">去同频社区 <span aria-hidden="true">↗</span></button><button class="menu-item" type="button" onclick="showStatus()">目录状态 <span aria-hidden="true">↗</span></button></div>`;
}

/* ------------------------------ navigation -------------------------------- */

async function paint() {
  const revision = ++renderRevision;
  window.HipkopMotion?.clear();
  const view = $('#view');
  document.querySelectorAll('.tabbar button').forEach((button) => {
    const active = button.getAttribute('data-tab') === state.page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (view) view.setAttribute('aria-busy', 'true');
  try {
    let html;
    if (state.page === 'home') html = await viewHome();
    else if (state.page === 'charts') html = await viewCharts();
    else if (state.page === 'discover') html = await viewDiscover();
    else if (state.page === 'community') html = await viewCommunity();
    else if (state.page === 'profile') html = viewProfile();
    if (revision === renderRevision && html != null) view.innerHTML = html;
  } finally {
    if (revision === renderRevision) {
      if (view) view.removeAttribute('aria-busy');
      window.HipkopExhibition?.syncPlayer();
      window.HipkopCulture?.syncPlayback();
      window.HipkopMotion?.mount(view);
    }
  }
}

async function navigate(page) {
  clearTimeout(discoverTimer);
  searchRequest++;
  window.HipkopMotion?.clear();
  if (page !== 'detail' && page !== 'artist') state.page = page;
  const view = $('#view');
  if (view && ['home', 'charts', 'discover', 'community'].includes(page)) view.innerHTML = loading();
  if (typeof window !== 'undefined' && window.scrollTo) {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
  await paint();
}

function backFromDetail() {
  const page = state.lastDetail.page && !['detail', 'artist'].includes(state.lastDetail.page) ? state.lastDetail.page : 'home';
  navigate(page);
}

/* -------------------------------- details --------------------------------- */

async function openItem(id) {
  if (!id || /^(undefined|null)$/.test(String(id))) return toast('这张作品还未入档');
  closeSheet();
  const revision = ++renderRevision;
  window.HipkopMotion?.clear();
  window.scrollTo({ top: 0, behavior: 'instant' });
  const previous = ['detail', 'artist'].includes(state.page) ? state.lastDetail.page : state.page;
  state.lastDetail = { page: previous || 'home', id };
  state.page = 'detail';
  const view = $('#view');
  view.setAttribute('aria-busy', 'true');
  view.innerHTML = loading('正在打开详情…');
  const isTrack = String(id).includes('-track-') || state.discover?.results?.tracks?.some(track => track.id === id);
  const data = isTrack ? null : await safeApi(`/api/albums/${encodeURIComponent(id)}`, null);
  if (revision !== renderRevision) return;
  if (!data || !data.album) {
    const trackData = await safeApi(`/api/tracks/${encodeURIComponent(id)}`, null);
    if (revision !== renderRevision) return;
    if (trackData && trackData.track) return renderTrack(trackData);
    view.removeAttribute('aria-busy');
    view.innerHTML = `${offlineNotice()}${emptyState('无法加载该作品，可能尚未同步。')}${backButton()}`;
    return;
  }
  renderAlbum(data);
}

function renderAlbum(data) {
  const { album, tracks, artists } = data;
  state.detail = { kind: 'album', item: album, tracks, artists };
  const liked = state.liked.has(album.id);
  const artistLink = album.artistId
    ? `<div class="artist" role="button" tabindex="0" aria-label="查看艺人 ${esc(album.artist)}" onclick="artistDetail('${esc(album.artistId)}')" onkeydown="activateKey(event)">${esc(album.artist)}</div>`
    : `<div class="artist">${esc(album.artist)}</div>`;
  const tags = tagLine(album).join(' · ');
  const artistLinks = (artists || [])
    .map((a) => `<a role="button" tabindex="0" aria-label="查看艺人 ${esc(a.name)}" onclick="artistDetail('${esc(a.id)}')" onkeydown="activateKey(event)">${esc(a.name)}</a>`)
    .join(' · ');
  $('#view').innerHTML = `<div class="detail">${backButton()}
    <div class="detail-hero"><div class="detail-cover">${cover(album)}</div><div>
      <span class="eyebrow">${album.kind === 'single' ? 'SINGLE' : 'ALBUM'} · ${esc(yearOf(album) || '')}${tags ? ' · ' + esc(tags) : ''}</span>
      <h1>${esc(album.title)}</h1>${artistLink}
      <div class="detail-meta"><span>发行日期 <b>${esc(album.releaseDate || '待同步')}</b></span><span>曲目 <b>${tracks.length || album.trackCount || 0}</b></span><span>评分 <b>${album.score != null ? Number(album.score).toFixed(1) : '—'}</b></span></div>
      ${listenCta(album)}
      <button class="ghost" type="button" aria-pressed="${liked}" aria-label="${liked ? '取消收藏' : '收藏'} ${esc(album.title)}" data-like-id="${esc(album.id)}" onclick="toggleLike('${esc(album.id)}')">${liked ? '♥ 已收藏' : '♡ 收藏'}</button>
    </div></div>
    <div class="review-box"><b>作品笔记</b><p>${esc(album.desc || '这张作品暂无介绍。从曲目开始听。')}</p>
      <div class="track-box"><h3>曲目列表 (${tracks.length})</h3>${tracks.length ? tracks.map((track, index) => trackRow(track, index)).join('') : '<p class="single-meta">曲目尚未同步，正在后台获取。</p>'}</div>
      ${artists && artists.length ? `<p class="single-meta">艺人：${artistLinks}</p>` : ''}
    </div></div>`;
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('#view').removeAttribute('aria-busy');
  window.HipkopMotion?.mount($('#view'));
}

function renderTrack(data) {
  const { track, album, artists } = data;
  state.detail = { kind: 'track', item: track, tracks: [], artists };
  const liked = state.liked.has(track.id);
  const tags = tagLine(track).join(' · ');
  $('#view').innerHTML = `<div class="detail">${backButton()}
    <div class="detail-hero"><div class="detail-cover">${cover(album || track)}</div><div>
      <span class="eyebrow">SINGLE · ${esc(yearOf(track) || '')}${tags ? ' · ' + esc(tags) : ''}</span>
      <h1>${esc(track.title)}</h1>
      ${artists && artists.length ? `<div class="artist" role="button" tabindex="0" aria-label="查看艺人 ${esc(track.artist)}" onclick="artistDetail('${esc(artists[0].id)}')" onkeydown="activateKey(event)">${esc(track.artist)}</div>` : `<div class="artist">${esc(track.artist)}</div>`}
      <div class="detail-meta"><span>发行日期 <b>${esc(track.releaseDate || '待同步')}</b></span><span>时长 <b>${track.durationMs ? Math.round(track.durationMs / 1000) + 's' : '—'}</b></span></div>
      ${listenCta(track)}
      <button class="ghost" type="button" aria-pressed="${liked}" aria-label="${liked ? '取消收藏' : '收藏'} ${esc(track.title)}" data-like-id="${esc(track.id)}" onclick="toggleLike('${esc(track.id)}')">${liked ? '♥ 已收藏' : '♡ 收藏'}</button>
    </div></div>
    <div class="review-box"><b>所属专辑</b>${album ? `<p class="single-meta" role="button" tabindex="0" aria-label="打开专辑 ${esc(album.title)}" onclick="openItem('${esc(album.id)}')" onkeydown="activateKey(event)">${esc(album.title)} · ${esc(album.artist)}</p>` : '<p class="single-meta">未关联专辑</p>'}
    ${track.previewUrl ? `<p class="single-meta"><a href="${esc(track.previewUrl)}" target="_blank" rel="noopener">试听片段 <span aria-hidden="true">↗</span></a></p>` : ''}</div></div>`;
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('#view').removeAttribute('aria-busy');
  window.HipkopMotion?.mount($('#view'));
}

async function artistDetail(id) {
  if (!id || /^(undefined|null)$/.test(String(id))) return toast('艺人资料还未入档');
  closeSheet();
  const revision = ++renderRevision;
  window.HipkopMotion?.clear();
  window.scrollTo({ top: 0, behavior: 'instant' });
  const previous = ['detail', 'artist'].includes(state.page) ? state.lastDetail.page : state.page;
  state.lastDetail = { page: previous || 'home', id };
  state.page = 'artist';
  const view = $('#view');
  view.setAttribute('aria-busy', 'true');
  view.innerHTML = loading('正在加载艺人资料…');
  const data = await safeApi(`/api/artists/${encodeURIComponent(id)}`, null);
  if (revision !== renderRevision) return;
  if (!data || !data.artist) {
    view.removeAttribute('aria-busy');
    view.innerHTML = `${offlineNotice()}${emptyState('无法加载艺人资料。')}${backButton()}`;
    return;
  }
  state.offline = false;
  const { artist, albums, tracks } = data;
  const tags = [artist.genre, bucketLabel(artist.genreBucket), artist.region].filter(Boolean).join(' · ');
  view.innerHTML = `<div class="artist-page">${backButton()}
    <div class="artist-hero" style="background-image:url('${esc(window.HipkopCulture.resource(artist.heroUrl))}')"><div class="artist-overlay"></div>
      <div class="artist-info">${avatar(artist)}<div>
        <span class="eyebrow">${esc(tags || '艺人')}</span>
        <h1>${esc(artist.name)}</h1><p>${esc(artist.bio || '暂无简介，资料来自元数据 Provider。')}</p>
        <button class="cta" type="button" onclick="followArtist()"><span aria-hidden="true">＋</span> 关注艺人</button>
      </div></div></div>
    ${offlineNotice()}
    <section class="section"><div class="section-head"><h2>代表专辑 (${albums.length})</h2></div><div class="cards">${albums.length ? albums.map(albumCard).join('') : emptyState('暂无关联专辑')}</div></section>
    <section class="section"><div class="section-head"><h2>关联单曲 (${tracks.length})</h2></div><div class="track-box">${tracks.length ? tracks.slice(0, 12).map((track, index) => trackRow(track, index, { listen: false })).join('') : emptyState('暂无关联单曲')}</div></section></div>`;
  window.scrollTo({ top: 0, behavior: 'instant' });
  view.removeAttribute('aria-busy');
  window.HipkopMotion?.mount(view);
}/* ------------------------------ interactions ------------------------------ */

function followArtist() {
  toast('已关注该艺人');
}

function randomPick() {
  const pool = pickPool();
  const currentId = (state.pick || dailyPick())?.id;
  const choices = pool.length > 1 && currentId ? pool.filter((item) => item.id !== currentId) : pool;
  const source = choices.length ? choices : pool;
  state.pick = source[Math.floor(Math.random() * source.length)];
  return state.pick;
}

function refreshPick() {
  randomPick();
  const root = $('#dailyPick');
  if (!root) return;
  root.innerHTML = pickView();
  window.HipkopMotion?.pick(root);
}

function knownWork(id) {
  return state.detail.item?.id === id ? state.detail.item : [
    ...state.releases, ...state.charts, ...state.browse.items, ...state.archivePicks,
    ...(state.discover?.results?.albums || []), ...(state.discover?.results?.tracks || [])
  ].find(work => work.id === id);
}

async function toggleLike(id) {
  const favorites = loadFavorites();
  if (state.liked.has(id)) {
    state.liked.delete(id);
    delete favorites[id];
  } else {
    let item = knownWork(id);
    if (!item && id) {
      const data = await safeApi(`/api/${String(id).includes('-track-') ? 'tracks' : 'albums'}/${encodeURIComponent(id)}`, null);
      item = data?.album || data?.track;
    }
    if (!item) return toast('暂时无法收藏这张作品');
    state.liked.add(id);
    favorites[id] = item;
  }
  try { localStorage.setItem('hipkop.favorites.v1', JSON.stringify(favorites)); }
  catch { toast('设备存储空间不足，收藏未保存'); return; }
  const liked = state.liked.has(id);
  document.querySelectorAll('[data-like-id]').forEach(button => {
    if (button.getAttribute('data-like-id') !== id) return;
    button.setAttribute('aria-pressed', String(liked));
    button.setAttribute('aria-label', liked ? '取消收藏' : '收藏');
    button.textContent = liked ? '♥ 已收藏' : '♡ 收藏';
  });
  toast(liked ? '已放进唱片架' : '已移出唱片架');
}

async function playWork(id) {
  const current = window.HipkopPlayer?.snapshot();
  if (current && (current.id === id || current.item?.albumId === id) && ['playing', 'paused'].includes(current.status)) return window.HipkopPlayer.toggle();
  const item = knownWork(id);
  await window.HipkopPlayer?.playItem(item || id);
}

async function toggleExhibitionPlayback() {
  const player = window.HipkopPlayer;
  if (!player) return toast('播放器还未加载，请刷新重试');
  const status = player.snapshot().status;
  if (status === 'playing' || status === 'paused') return player.toggle();
  return player.playQueue(state.hero.length ? state.hero : state.releases);
}

function openExhibitionQueue() {
  const items = state.hero.length ? state.hero : state.releases;
  openSheet(`<h3>声场精选</h3><p class="sheet-sub">HIP-HOP × K-POP，换一种频率听。</p><button class="cta" type="button" onclick="closeSheet();window.HipkopPlayer.playQueue(state.hero.length ? state.hero : state.releases)">播放整组试听 ↗</button><div class="exhibition-queue">${items.map((work, index) => `<div class="queue-row"><button type="button" class="queue-work" onclick="closeSheet();openItem('${esc(work.id)}')"><span>${String(index + 1).padStart(2,'0')}</span>${cover(work)}<span><b>${esc(work.title)}</b><small>${esc(work.artist)}</small></span></button><button class="track-preview" type="button" onclick="playWork('${esc(work.id)}')" aria-label="播放 ${esc(work.title)} 试听"><span class="play-shape" aria-hidden="true"></span></button></div>`).join('')}</div>`);
}

async function setChartTab(key) {
  state.chartTab = key;
  return updateCharts();
}

async function setChartSort(sort) {
  state.chartSort = sort;
  return updateCharts();
}

async function updateCharts() {
  const root = $('#chartList');
  if (!root) return;
  document.querySelectorAll('[aria-label="榜单分类"] .chip').forEach(button => {
    const active = button.getAttribute('onclick') === `setChartTab('${state.chartTab}')`;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  root.setAttribute('aria-busy', 'true');
  const loaded = await loadCharts();
  if (!loaded || !root.isConnected || state.page !== 'charts') return;
  root.innerHTML = chartsList();
  $('#chartInfo').innerHTML = window.HipkopCulture.chartInfo(state.charts, state.chartSort);
  root.removeAttribute('aria-busy');
  window.HipkopCulture.syncPlayback();
  window.HipkopMotion?.results(root);
}

async function setBrowse(key, value) {
  state.browse[key] = value;
  const root = $('#browseResults');
  if (!root) return;
  for (const [group, setter, selected] of [['风格筛选', 'setBrowseBucket', state.browse.bucket], ['年份筛选', 'setBrowseYear', state.browse.year]]) {
    document.querySelectorAll(`[aria-label="${group}"] .chip`).forEach(button => {
      const active = button.getAttribute('onclick') === `${setter}('${selected}')`;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
  }
  root.setAttribute('aria-busy', 'true');
  const expected = browseRequest + 1;
  const loaded = await loadBrowse();
  if (expected !== browseRequest || !root.isConnected || state.page !== 'discover') return;
  // An unavailable server still gets a useful empty/error state.
  if (!loaded && root !== $('#browseResults')) return;
  root.innerHTML = loaded ? browseListHtml() : emptyState('唱片索引暂时离线，请稍后重试。');
  root.removeAttribute('aria-busy');
  $('#filterStatus').innerHTML = filterStatus();
  window.HipkopCulture.syncPlayback();
  window.HipkopMotion?.results(root);
}

function clearBrowseFilters() {
  state.browse.bucket = 'all'; state.browse.year = 'all'; state.browse.sort = 'date';
  if ($('#browseSort')) $('#browseSort').value = 'date';
  return setBrowse('bucket', 'all');
}

function setBrowseBucket(value) {
  return setBrowse('bucket', value);
}

function setBrowseYear(value) {
  return setBrowse('year', value);
}

function setBrowseSort(value) {
  return setBrowse('sort', value);
}

async function setCommunityTopic(topic) {
  state.community.topic = topic;
  const root = $('#communityFeed');
  if (!root) return;
  document.querySelectorAll('[aria-label="社区话题"] .chip').forEach(button => {
    const active = button.getAttribute('onclick') === `setCommunityTopic('${topic}')`;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  root.setAttribute('aria-busy', 'true');
  const loaded = await loadCommunity();
  if (!loaded || !root.isConnected || state.page !== 'community') return;
  root.innerHTML = window.HipkopCulture.wall(state.community.items, topicLabel);
  root.removeAttribute('aria-busy');
  $('#communityCount').textContent = `${state.community.items.length} 段声音 · 当前分类`;
  window.HipkopMotion?.results(root);
}

function openCommunityPost(id) {
  const post = state.community.items.find(item => String(item.id) === String(id));
  if (!post) return toast('这段声音暂时不在当前墙面');
  openSheet(`<div class="post-detail"><span class="eyebrow">同频社区 / ${esc(topicLabel(post.topic))}</span>${window.HipkopCulture.post(post, topicLabel(post.topic))}<button class="ghost" type="button" onclick="closeSheet()">收起这段声音</button></div>`);
}

/* --------------------------------- sheet ---------------------------------- */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let sheetReturnFocus = null;

function sheetFocusables() {
  const card = $('#sheetCard');
  if (!card) return [];
  return Array.prototype.slice.call(card.querySelectorAll(FOCUSABLE));
}

function handleSheetKeydown(event) {
  const sheet = $('#sheet');
  if (!sheet || sheet.classList.contains('hidden')) return;
  if (event.key === 'Escape' || event.key === 'Esc') {
    event.preventDefault();
    closeSheet();
    return;
  }
  if (event.key !== 'Tab') return;
  const nodes = sheetFocusables();
  if (!nodes.length) {
    event.preventDefault();
    const card = $('#sheetCard');
    if (card && typeof card.focus === 'function') card.focus();
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !sheet.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function openSheet(html) {
  const sheet = $('#sheet');
  if (!sheet) return;
  const active = document.activeElement;
  sheetReturnFocus = active && active !== document.body ? active : null;
  const card = $('#sheetCard');
  if (card) {
    card.setAttribute('tabindex', '-1');
    card.innerHTML = html;
  }
  sheet.classList.remove('hidden');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-hidden', 'false');
  window.HipkopMotion?.sheet(card);
  if (typeof document !== 'undefined' && document.body) document.body.style.overflow = 'hidden';
  document.removeEventListener('keydown', handleSheetKeydown, true);
  document.addEventListener('keydown', handleSheetKeydown, true);
  const focusTarget = sheetFocusables()[0] || card;
  if (focusTarget && typeof focusTarget.focus === 'function') {
    try { focusTarget.focus({ preventScroll: false }); } catch (error) { focusTarget.focus(); }
  }
}

function closeSheet() {
  const sheet = $('#sheet');
  if (!sheet || sheet.classList.contains('hidden')) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', handleSheetKeydown, true);
  if (typeof document !== 'undefined' && document.body) document.body.style.overflow = '';
  const target = sheetReturnFocus;
  sheetReturnFocus = null;
  if (target && typeof target.focus === 'function' && (!document.contains || document.contains(target))) target.focus();
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

async function openPostComposer() {
  try {
    if (window.HipkopAccount && !await window.HipkopAccount.ensure()) return;
  } catch { return toast('账号服务暂不可用，请稍后再试'); }
  const topics = (state.community.topics.length ? state.community.topics : DEFAULT_TOPICS).filter((topic) => topic.key !== 'all');
  const works = [...new Map([...state.releases, ...state.charts, ...state.browse.items].map(item => [item.id, item])).values()].slice(0, 50);
  openSheet(`<h3>发布内容</h3>
    <label class="field"><span>话题</span><select id="postTopic">${topics.map((topic) => `<option value="${topic.key}" ${state.community.topic === topic.key ? 'selected' : ''}>${esc(topic.label)}</option>`).join('')}</select></label>
    <label class="field"><span>标题</span><input id="postTitle" maxlength="120" placeholder="一句话说清你想聊什么"></label>
    <label class="field"><span>正文</span><textarea id="postBody" rows="4" maxlength="2000" placeholder="展开说说，或者安利你的宝藏歌手 / 歌曲…"></textarea></label>
    ${window.HipkopAccount && window.HipkopAccount.user() ? `<p>以 ${esc(window.HipkopAccount.user().displayName)} 发声 <button class="ghost" type="button" onclick="HipkopAccount.logout()">退出登录</button></p><input id="postAuthor" type="hidden" value="">` : '<label class="field"><span>署名（可选）</span><input id="postAuthor" maxlength="60" placeholder="不填写则显示 HIPKOP 听众"></label>'}
    <label class="field"><span>附张唱片（可选）</span><select id="postAlbum"><option value="">不关联作品</option>${works.map(item => `<option value="${esc(item.id)}">${esc(item.title)} — ${esc(item.artist)}</option>`).join('')}</select></label>
    <button class="cta" type="button" onclick="submitPost(this)">发布</button>`);
}

async function submitPost(button) {
  const topic = $('#postTopic').value;
  const title = ($('#postTitle').value || '').trim();
  const body = ($('#postBody').value || '').trim();
  if (!title || !body) return toast('标题和正文都不能为空');
  const card = $('#sheetCard');
  const submit = button || (card ? card.querySelector('button.cta') : null);
  const restore = submit ? submit.textContent : '';
  if (submit) {
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    submit.textContent = '发布中…';
  }
  let published = true;
  try {
    const response = await fetch('/api/community/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(window.HipkopAccount ? window.HipkopAccount.headers() : {}) },
      body: JSON.stringify({ topic, title, body, author: $('#postAuthor').value.trim(), albumId: $('#postAlbum').value || null })
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    published = (await response.json()).status !== 'pending';
  } catch (error) {
    if (submit) {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      submit.textContent = restore;
    }
    return toast('发布失败，请稍后再试');
  }
  closeSheet();
  toast(published ? '已发布' : '已提交，审核通过后出现在社区');
  state.community.topic = topic;
  await paint();
}

let toastTimer = null;
let toastHideTimer = null;

// Live region: never steals focus, and clears first so a repeated message is
// still announced by screen readers.
function toast(message) {
  const element = $('#toast');
  if (!element) return;
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  if (toastTimer) clearTimeout(toastTimer);
  if (toastHideTimer) clearTimeout(toastHideTimer);
  element.textContent = '';
  element.classList.add('show');
  toastTimer = setTimeout(() => {
    element.textContent = String(message == null ? '' : message);
  }, 20);
  toastHideTimer = setTimeout(() => {
    element.classList.remove('show');
  }, 2400);
}


let discoverTimer = null;
function onDiscoverInput() {
  clearTimeout(discoverTimer);
  searchRequest++;
  discoverTimer = setTimeout(() => runDiscover(), 350);
}

async function runDiscover(explicitQuery) {
  clearTimeout(discoverTimer);
  const revision = ++searchRequest;
  const root = $('#discoverResults');
  if (!root) return;
  const query = (explicitQuery != null ? explicitQuery : $('#discoverInput') ? $('#discoverInput').value : '').trim();
  if (!query) {
    state.discover = null;
    root.innerHTML = discoverHint();
    return;
  }
  root.setAttribute('aria-busy', 'true');
  root.innerHTML = '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-card"></div>';
  const data = await safeApi(`/api/search?q=${encodeURIComponent(query)}`, null);
  if (revision !== searchRequest || !root.isConnected || state.page !== 'discover') return;
  state.discover = data || { query, counts: { artists: 0, albums: 0, tracks: 0 }, results: { artists: [], albums: [], tracks: [] }, error: 'network' };
  const current = $('#discoverResults');
  if (current) {
    current.innerHTML = searchResultsHtml(state.discover);
    current.removeAttribute('aria-busy');
    window.HipkopCulture.syncPlayback();
    window.HipkopMotion?.results(current);
  }
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
    <p class="sheet-note">${data.consistency ? `一致性检查：${issues.length ? issues.map(([key, value]) => `${esc(key)} ${esc(value)}`).join(' · ') : '全部通过 ✓'}` : '详细诊断仅向管理员开放'}</p>`);
}

/* --------------------------------- boot ----------------------------------- */

navigate('home');
