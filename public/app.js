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
  homeNewIds: new Set(),
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
const sceneLabel = (scene) => ({ mainstream: '主流', underground: '地下' }[scene] || '');
const yearOf = (item) => item.year || String(item.releaseDate || '').slice(0, 4);
const topicLabel = (key) => {
  const topics = state.community.topics.length ? state.community.topics : DEFAULT_TOPICS;
  const match = topics.find((topic) => topic.key === key);
  return match ? match.label : key;
};

function tagLine(item) {
  const tags = [item.genre, bucketLabel(item.genreBucket), sceneLabel(item.scene)].filter(Boolean);
  const seen = new Set();
  return tags.filter((tag) => {
    const key = String(tag).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Chart "heat": prefer a real provider heat value, otherwise fall back to a
// stable editorial blend so no row ever renders an empty metric.
function heatValue(item) {
  const explicit = Number(item && (item.searchHeat ?? item.heat ?? item.popularity));
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const comments = Number(item && item.comments) || 0;
  const score = Number(item && item.score) || 0;
  const date = item && item.releaseDate ? new Date(item.releaseDate).getTime() : 0;
  const freshness = date ? Math.max(0, (date - Date.now() + 1000 * 86400 * 365) / (1000 * 86400 * 365)) : 0;
  return comments * 1.4 + score * 42 + freshness * 10;
}

function heatPercent(item, collection = state.charts) {
  const values = (collection || []).map(heatValue);
  const max = Math.max(1, ...values);
  return Math.max(1, Math.min(99, Math.round((heatValue(item) / max) * 100)));
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
  const alt = item.title || item.name || '专辑封面';
  return `<div class="cover${extra ? ` ${extra}` : ''}"><img src="${esc(url)}" alt="${esc(alt)}" width="300" height="300" loading="lazy" decoding="async" onerror="this.style.display='none';this.closest('.cover')&&this.closest('.cover').classList.add('img-fallback')"><span>${esc(item.genre || item.kind || '')}</span></div>`;
}

function avatar(item, cls = '') {
  const url = item.avatarUrl || (item.id ? `/media/avatar/${encodeURIComponent(item.id)}` : '');
  const alt = item.name || item.artist || '艺人头像';
  return `<img ${cls ? `class="${cls}" ` : ''}src="${esc(url)}" alt="${esc(alt)}" width="48" height="48" loading="lazy" decoding="async" onerror="this.style.display='none';var host=this.closest('.avatar-wrap,.artist-info,.artist-result,.avatar');if(host)host.classList.add('img-fallback')">`;
}

function albumCard(album) {
  const year = yearOf(album);
  const score = album.score != null ? Number(album.score).toFixed(1) : '—';
  const label = `打开专辑 ${album.title || ''}${album.artist ? ' · ' + album.artist : ''}`;
  return `<article class="card" role="button" tabindex="0" aria-label="${esc(label)}" onclick="openItem('${esc(album.id)}')" onkeydown="activateKey(event)">${cover(album)}<h3>${esc(album.title)}</h3><p>${esc(album.artist)} · ${esc(year)} · <b>${score}</b></p></article>`;
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
  return `<div class="listen-row"><a class="cta" href="${esc(primary.url)}" target="_blank" rel="noopener">在${esc(name)}听完整版 <span aria-hidden="true">↗</span></a><button class="ghost" type="button" onclick="openListenById('${esc(item.id)}')" aria-label="选择收听平台：${esc(item.title || '')}" title="选择收听平台">选择收听平台</button></div>`;
}

function trackRow(track, index, options = {}) {
  const label = track.trackNumber != null ? String(track.trackNumber).padStart(2, '0') : index != null ? String(index + 1).padStart(2, '0') : '♪';
  const listen = options.listen === false ? '' : listenButton(track, '');
  const name = `打开曲目 ${track.title || ''}${track.artist ? ' · ' + track.artist : ''}`;
  return `<div class="track" role="button" tabindex="0" aria-label="${esc(name)}" onclick="openItem('${esc(track.id)}')" onkeydown="activateKey(event)"><span aria-hidden="true">${label}</span><b>${esc(track.title)}</b><em>${esc(track.artist || track.albumTitle || '')}</em>${listen}</div>`;
}

function artistResult(artist) {
  const tags = [artist.genre, sceneLabel(artist.scene)].filter(Boolean).join(' · ');
  return `<div class="artist-result" role="button" tabindex="0" aria-label="查看艺人 ${esc(artist.name || '')}" onclick="artistDetail('${esc(artist.id)}')" onkeydown="activateKey(event)">${avatar(artist)}<div><b>${esc(artist.name)}</b><small>${esc(tags || '艺人')}${artist.region ? ' · ' + esc(artist.region) : ''}</small></div><span aria-hidden="true">→</span></div>`;
}

function postCard(post) {
  const related = [post.albumTitle && `专辑 ${post.albumTitle}`, post.artistName && `艺人 ${post.artistName}`].filter(Boolean).join(' · ');
  return `<article class="post"><div class="post-meta"><span>${esc(post.author || 'HIPKOP')}</span><span>${esc(topicLabel(post.topic))}</span></div><h3>${esc(post.title)}</h3><p>${esc(post.body)}</p>${related ? `<small class="post-related">${esc(related)}</small>` : ''}</article>`;
}

const loading = (text = '正在加载…') => `<section class="section loading-block" role="status" aria-label="${esc(text)}"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></section>`;
const emptyState = (text) => `<p class="empty">${esc(text)}</p>`;

function backButton() {
  return '<span class="back" role="button" tabindex="0" aria-label="返回" onclick="backFromDetail()" onkeydown="activateKey(event)"><span aria-hidden="true">←</span> 返回</span>';
}

function offlineNotice() {
  return state.offline ? `<section class="section" role="status"><div class="discover-hint"><span aria-hidden="true">⚠</span> 无法连接目录服务，当前展示离线示例数据。请确认服务已启动。</div></section>` : '';
}

/* ------------------------------ home pieces -------------------------------- */

function heroSlides() {
  return state.hero.length ? state.hero : FALLBACK_ALBUMS.slice(0, 3);
}

function heroCopy(album) {
  const tags = tagLine(album).join(' · ');
  return `<span class="eyebrow">HIPKOP PICK${tags ? ' · ' + esc(tags) : ''}</span>
        <h1>${esc(album.title)}</h1>
        <p>${esc(album.artist)}${album.releaseDate ? ' · ' + esc(album.releaseDate) : ''}</p>
        <span class="hero-cta">查看专辑 <span aria-hidden="true">→</span></span>`;
}

function heroBanner() {
  const slides = heroSlides();
  if (!slides.length) return '';
  const index = state.heroIndex % slides.length;
  const album = slides[index];
  const image = album.coverUrl || `/media/cover/${encodeURIComponent(album.id)}`;
  const dots = slides
    .map((_, i) => `<button class="hero-dot ${i === index ? 'active' : ''}" type="button" onclick="heroGo(${i})" aria-label="第 ${i + 1} 张：${esc((slides[i] && slides[i].title) || '')}" aria-current="${i === index ? 'true' : 'false'}"></button>`)
    .join('');
  return `<section class="hero-banner" id="heroBanner" role="region" aria-roledescription="轮播" aria-label="编辑精选轮播" aria-live="off">
    <div class="hero-slide" role="button" tabindex="0" aria-label="打开专辑 ${esc(album.title || '')}${album.artist ? ' · ' + esc(album.artist) : ''}" onclick="openItem('${esc(album.id)}')" onkeydown="activateKey(event)">
      <div class="hero-bg" style="background-image:url('${esc(image)}')"></div>
      <div class="hero-copy">
        ${heroCopy(album)}
      </div>
    </div>
    <div class="hero-nav"><button type="button" onclick="heroStep(-1)" aria-label="上一张" title="上一张"><span aria-hidden="true">‹</span></button><div class="hero-dots">${dots}</div><button type="button" onclick="heroStep(1)" aria-label="下一张" title="下一张"><span aria-hidden="true">›</span></button></div>
  </section>`;
}

// Updates the active slide in place so keyboard focus on the carousel controls
// is preserved (the old code replaced the whole banner via outerHTML).
function heroGo(index) {
  const slides = heroSlides();
  if (!slides.length) return;
  const total = slides.length;
  state.heroIndex = ((index % total) + total) % total;
  const node = $('#heroBanner');
  if (!node) return;
  const album = slides[state.heroIndex];
  const image = album.coverUrl || `/media/cover/${encodeURIComponent(album.id)}`;
  const bg = node.querySelector('.hero-bg');
  if (bg) bg.style.backgroundImage = `url('${image}')`;
  const copy = node.querySelector('.hero-copy');
  if (copy) copy.innerHTML = heroCopy(album);
  const slide = node.querySelector('.hero-slide');
  if (slide) {
    slide.setAttribute('aria-label', `打开专辑 ${album.title || ''}${album.artist ? ' · ' + album.artist : ''}`);
    slide.onclick = () => openItem(album.id);
  }
  node.querySelectorAll('.hero-dot').forEach((dot, i) => {
    const active = i === state.heroIndex;
    dot.classList.toggle('active', active);
    dot.setAttribute('aria-current', active ? 'true' : 'false');
  });
}

function heroStep(delta) {
  heroGo(state.heroIndex + delta);
}

function prefersReducedMotion() {
  return Boolean(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

let heroPaused = false;

function heroShouldAdvance() {
  if (state.page !== 'home') return false;
  if (heroPaused || prefersReducedMotion()) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  return Boolean($('#heroBanner'));
}

if (typeof window !== 'undefined') {
  setInterval(() => {
    if (heroShouldAdvance()) heroStep(1);
  }, 6000);
}

if (typeof document !== 'undefined') {
  const inHero = (node) => Boolean(node && node.closest && node.closest('#heroBanner'));
  document.addEventListener('mouseover', (event) => { if (inHero(event.target)) heroPaused = true; });
  document.addEventListener('mouseout', (event) => {
    if (!inHero(event.target)) return;
    if (!inHero(event.relatedTarget)) heroPaused = false;
  });
  document.addEventListener('focusin', (event) => { if (inHero(event.target)) heroPaused = true; });
  document.addEventListener('focusout', (event) => { if (inHero(event.target)) heroPaused = false; });
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
  const label = `今日同频 ${pick.title || ''}${pick.artist ? ' · ' + pick.artist : ''}`;
  return `<div class="pick-card" role="button" tabindex="0" aria-label="${esc(label)}" onclick="openItem('${esc(pick.id)}')" onkeydown="activateKey(event)">${cover(pick, 'pick-cover')}<div><span class="eyebrow">今日同频 · ${kind}</span><h3>${esc(pick.title)}</h3><p>${esc(pick.artist)}${tags ? ' · ' + esc(tags) : ''}</p></div><button type="button" aria-label="换一个推荐" title="换一个推荐" onclick="event.stopPropagation();randomPick();paint();">换一个</button></div>`;
}

function statStrip() {
  const stats = state.stats || { artists: 0, albums: 0, tracks: 0, posts: 0 };
  return `<section class="stat-strip">
    <div><b>${esc(stats.artists)}</b><span>收录歌手</span></div>
    <div><b>${esc(stats.albums)}</b><span>专辑 / 单曲</span></div>
    <div><b>${esc(stats.posts)}</b><span>社区帖子</span></div>
  </section>`;
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

// 三圈层入口：CHART_TABS 里已有 mainstream / underground / kpop 三个真实 tab，
// 因此三张卡都直接切到对应榜单 tab（loadCharts 把 underground 映射为
// genre=hiphop & scene=underground）。
const SCENE_ENTRIES = [
  { key: 'mainstream', en: 'MAINSTREAM HIPHOP', label: '主流 HipHop', sub: '主流发行 · 榜单' },
  { key: 'underground', en: 'UNDERGROUND HIPHOP', label: '地下 HipHop', sub: '地下场景 · 榜单' },
  { key: 'kpop', en: 'K-POP', label: 'K-POP', sub: '流行发行 · 榜单' }
];

function sceneRail() {
  const cards = SCENE_ENTRIES
    .map((scene) => `<div class="feature" role="button" tabindex="0" aria-label="查看${esc(scene.label)}榜单" onclick="goScene('${scene.key}')" onkeydown="activateKey(event)"><b>${esc(scene.en)}</b><h3>${esc(scene.label)}</h3><p>${esc(scene.sub)}</p></div>`)
    .join('');
  return `<section class="section scene-rail"><div class="section-head"><h2>三大圈层</h2></div><div class="feature-grid">${cards}</div></section>`;
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
  state.pick = null;

  const { newReleases, editorsPicks } = splitHomeReleases(state.releases);
  state.homeNewIds = new Set(newReleases.map((item) => item.id));
  const charts = state.charts.slice(0, 10);
  const posts = state.community.items.slice(0, 3);
  return `${offlineNotice()}${heroBanner()}
    ${statStrip()}
    ${sceneRail()}
    <section class="section"><div class="section-head"><h2>新作</h2><a role="button" tabindex="0" aria-label="查看全部新作" onclick="navigate('discover')" onkeydown="activateKey(event)">查看全部 <span aria-hidden="true">→</span></a></div><div class="release-scroller">${newReleases.map(releaseCard).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>今日同频</h2><span class="section-action" role="button" tabindex="0" aria-label="换一个推荐" onclick="randomPick();paint();" onkeydown="activateKey(event)">换一个 <span aria-hidden="true">↻</span></span></div>${pickView()}</section>
    <section class="section"><div class="section-head"><h2>编辑推荐</h2><a role="button" tabindex="0" aria-label="查看全部编辑推荐" onclick="navigate('discover')" onkeydown="activateKey(event)">查看全部 <span aria-hidden="true">→</span></a></div><div class="cards">${editorsPicks.map(albumCard).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>编辑榜 TOP10 <span class="eyebrow">编辑分 · 每日更新</span></h2><a role="button" tabindex="0" aria-label="查看完整榜单" onclick="navigate('charts')" onkeydown="activateKey(event)">完整榜单 <span aria-hidden="true">→</span></a></div><div class="rank-list">${charts.map((album, index) => rankRow(album, index)).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>最新评论</h2><a role="button" tabindex="0" aria-label="进入社区" onclick="navigate('community')" onkeydown="activateKey(event)">进入社区 <span aria-hidden="true">→</span></a></div><div class="community-list">${posts.map(postCard).join('')}</div></section>`;
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

function rankRow(album, index, context) {
  const metric = context === 'charts'
    ? state.chartSort === 'date'
      ? esc(album.releaseDate || yearOf(album) || '—')
      : state.chartSort === 'popularity'
        ? `<span aria-hidden="true">🔥 </span>${heatPercent(album)}%`
        : album.score != null ? Number(album.score).toFixed(1) : '—'
    : album.score != null ? Number(album.score).toFixed(1) : '—';
  const sub = `${esc(album.artist)}${album.genre ? ' · ' + esc(album.genre) : ''}${context === 'charts' && album.year ? ' · ' + esc(album.year) : ''}`;
  return `<div class="rank" role="button" tabindex="0" aria-label="第 ${index + 1} 名 ${esc(album.title || '')} · ${esc(album.artist || '')}" onclick="openItem('${esc(album.id)}')" onkeydown="activateKey(event)"><span class="rank-no" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div><div class="rank-name">${esc(album.title)}</div><div class="rank-artist">${sub}</div></div><span class="score">${metric}</span></div>`;
}

function chartsList() {
  if (!state.charts.length) return emptyState('暂无榜单数据。首次同步完成后将显示真实榜单。');
  return `<div class="rank-list">${state.charts.map((album, index) => rankRow(album, index, 'charts')).join('')}</div>`;
}

async function viewCharts() {
  await loadCharts();
  return `<div class="page-title"><span class="eyebrow">HIPKOP CHARTS</span><h1>榜单</h1><p>综合、主流 HipHop、地下 HipHop 与 K-POP 分桶，来自元数据 Provider 与 Apple 榜单同步。</p>
    <div class="chips" role="group" aria-label="榜单分类">${CHART_TABS.map((tab) => `<button class="chip ${state.chartTab === tab.key ? 'active' : ''}" type="button" aria-pressed="${state.chartTab === tab.key}" onclick="setChartTab('${tab.key}')">${esc(tab.label)}</button>`).join('')}</div>
    <div class="sort-row"><label for="chartSort">排序</label><select id="chartSort" onchange="setChartSort(this.value)">
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
  const chips = (tabs, key, setter, groupLabel) =>
    `<div class="chips" role="group" aria-label="${esc(groupLabel)}">${tabs.map((tab) => `<button class="chip ${key === tab.key ? 'active' : ''}" type="button" aria-pressed="${key === tab.key}" onclick="${setter}('${tab.key}')">${esc(tab.label)}</button>`).join('')}</div>`;
  return `<div class="page-title"><span class="eyebrow">DISCOVER</span><h1>发现</h1><p>搜索任意艺人，或按风格 / 场景 / 年份筛选新发行。</p></div>
    <section class="section discover-search"><div class="inline-search"><input id="discoverInput" aria-label="搜索艺人、专辑、单曲或组合" placeholder="搜索艺人、专辑、单曲或组合" oninput="onDiscoverInput()"><button type="button" onclick="runDiscover()">搜索</button></div><div id="discoverResults" role="region" aria-label="搜索结果">${searchResultsHtml(state.discover)}</div></section>
    ${offlineNotice()}
    <section class="section"><div class="section-head"><h2>筛选</h2><span class="section-action" aria-live="polite">${state.browse.items.length} 张作品</span></div>
      <div class="filter-block"><label>风格</label>${chips(BUCKET_TABS, state.browse.bucket, 'setBrowseBucket', '风格筛选')}</div>
      <div class="filter-block"><label>场景</label>${chips(SCENE_TABS, state.browse.scene, 'setBrowseScene', '场景筛选')}</div>
      <div class="filter-block"><label>年份</label>${chips(years, state.browse.year, 'setBrowseYear', '年份筛选')}</div>
      <div class="sort-row"><label for="browseSort">排序</label><select id="browseSort" onchange="setBrowseSort(this.value)">${SORT_TABS.map((tab) => `<option value="${tab.key}" ${state.browse.sort === tab.key ? 'selected' : ''}>${esc(tab.label)}</option>`).join('')}</select></div>
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
  return `<div class="page-title"><span class="eyebrow">COMMUNITY</span><h1>社区</h1><p>和同样热爱 HipHop 与 K-POP 的人，分享演出、新作和你的宝藏安利。</p><button class="cta" type="button" onclick="openPostComposer()"><span aria-hidden="true">＋</span> 发布内容</button></div>
    ${offlineNotice()}
    <section class="section"><div class="chips" role="group" aria-label="社区话题">${topics.map((topic) => `<button class="chip ${state.community.topic === topic.key ? 'active' : ''}" type="button" aria-pressed="${state.community.topic === topic.key}" onclick="setCommunityTopic('${topic.key}')">${esc(topic.label)}</button>`).join('')}</div>
      <div class="community-list">${state.community.items.map(postCard).join('') || emptyState('这个话题下还没有帖子，来发第一帖。')}</div></section>`;
}

/* --------------------------------- profile -------------------------------- */

function viewProfile() {
  return `<div class="page-title"><span class="eyebrow">MY HIPKOP</span><h1>我的</h1></div><div class="profile-card"><div class="avatar" aria-hidden="true">H</div><div><h2>游客</h2><p>登录后同步你的收藏、乐评与关注</p></div><button class="login" type="button" onclick="toast('本地演示模式：登录功能已禁用')">登录</button></div><div class="menu"><div class="menu-item" role="button" tabindex="0" aria-label="我的收藏" onclick="toast('收藏夹为空')" onkeydown="activateKey(event)">我的收藏 <span aria-hidden="true">→</span></div><div class="menu-item" role="button" tabindex="0" aria-label="我的乐评" onclick="toast('登录后查看我的乐评')" onkeydown="activateKey(event)">我的乐评 <span aria-hidden="true">→</span></div><div class="menu-item" role="button" tabindex="0" aria-label="消息通知" onclick="toast('暂无通知')" onkeydown="activateKey(event)">消息通知 <span aria-hidden="true">→</span></div><div class="menu-item" role="button" tabindex="0" aria-label="目录与 Provider 状态" onclick="showStatus()" onkeydown="activateKey(event)">目录与 Provider 状态 <span aria-hidden="true">→</span></div><div class="menu-item" role="button" tabindex="0" aria-label="关于 HIPKOP PLAYER" onclick="toast('HIPKOP PLAYER v0.3 · 元数据目录')" onkeydown="activateKey(event)">关于 HIPKOP PLAYER <span aria-hidden="true">→</span></div></div>`;
}

/* ------------------------------ navigation -------------------------------- */

async function paint() {
  const view = $('#view');
  document.querySelectorAll('.tabbar button').forEach((button) => {
    const active = button.dataset.tab === state.page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (view) view.setAttribute('aria-busy', 'true');
  try {
    if (state.page === 'home') view.innerHTML = await viewHome();
    else if (state.page === 'charts') view.innerHTML = await viewCharts();
    else if (state.page === 'discover') view.innerHTML = await viewDiscover();
    else if (state.page === 'community') view.innerHTML = await viewCommunity();
    else if (state.page === 'profile') view.innerHTML = viewProfile();
  } finally {
    if (view) view.removeAttribute('aria-busy');
  }
}

async function navigate(page) {
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
  const previous = ['detail', 'artist'].includes(state.page) ? state.lastDetail.page : state.page;
  state.lastDetail = { page: previous || 'home', id };
  state.page = 'detail';
  const view = $('#view');
  view.setAttribute('aria-busy', 'true');
  view.innerHTML = loading('正在打开详情…');
  const data = await safeApi(`/api/albums/${encodeURIComponent(id)}`, null);
  if (!data || !data.album) {
    const trackData = await safeApi(`/api/tracks/${encodeURIComponent(id)}`, null);
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
      <button class="ghost" type="button" aria-pressed="${liked}" aria-label="${liked ? '取消收藏' : '收藏'} ${esc(album.title)}" onclick="toggleLike('${esc(album.id)}')">${liked ? '♥ 已收藏' : '♡ 收藏'}</button>
    </div></div>
    <div class="review-box"><b>HIPKOP 编辑短评</b><p>${esc(album.desc || `${album.title} · ${album.artist}`)}</p>
      <div class="track-box"><h3>曲目列表 (${tracks.length})</h3>${tracks.length ? tracks.map((track, index) => trackRow(track, index)).join('') : '<p class="single-meta">曲目尚未同步，正在后台获取。</p>'}</div>
      ${artists && artists.length ? `<p class="single-meta">艺人：${artistLinks}</p>` : ''}
    </div></div>`;
  $('#view').removeAttribute('aria-busy');
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
      <button class="ghost" type="button" aria-pressed="${liked}" aria-label="${liked ? '取消收藏' : '收藏'} ${esc(track.title)}" onclick="toggleLike('${esc(track.id)}')">${liked ? '♥ 已收藏' : '♡ 收藏'}</button>
    </div></div>
    <div class="review-box"><b>所属专辑</b>${album ? `<p class="single-meta" role="button" tabindex="0" aria-label="打开专辑 ${esc(album.title)}" onclick="openItem('${esc(album.id)}')" onkeydown="activateKey(event)">${esc(album.title)} · ${esc(album.artist)}</p>` : '<p class="single-meta">未关联专辑</p>'}
    ${track.previewUrl ? `<p class="single-meta"><a href="${esc(track.previewUrl)}" target="_blank" rel="noopener">试听片段 <span aria-hidden="true">↗</span></a></p>` : ''}</div></div>`;
  $('#view').removeAttribute('aria-busy');
}

async function artistDetail(id) {
  const previous = ['detail', 'artist'].includes(state.page) ? state.lastDetail.page : state.page;
  state.lastDetail = { page: previous || 'home', id };
  state.page = 'artist';
  const view = $('#view');
  view.setAttribute('aria-busy', 'true');
  view.innerHTML = loading('正在加载艺人资料…');
  const data = await safeApi(`/api/artists/${encodeURIComponent(id)}`, null);
  if (!data || !data.artist) {
    view.removeAttribute('aria-busy');
    view.innerHTML = `${offlineNotice()}${emptyState('无法加载艺人资料。')}${backButton()}`;
    return;
  }
  state.offline = false;
  const { artist, albums, tracks } = data;
  const tags = [artist.genre, bucketLabel(artist.genreBucket), sceneLabel(artist.scene), artist.region].filter(Boolean).join(' · ');
  view.innerHTML = `<div class="artist-page">${backButton()}
    <div class="artist-hero" style="background-image:url('${esc(artist.heroUrl)}')"><div class="artist-overlay"></div>
      <div class="artist-info">${avatar(artist)}<div>
        <span class="eyebrow">${esc(tags || '艺人')}</span>
        <h1>${esc(artist.name)}</h1><p>${esc(artist.bio || '暂无简介，资料来自元数据 Provider。')}</p>
        <button class="cta" type="button" onclick="followArtist()"><span aria-hidden="true">＋</span> 关注艺人</button>
      </div></div></div>
    ${offlineNotice()}
    <section class="section"><div class="section-head"><h2>代表专辑 (${albums.length})</h2></div><div class="cards">${albums.length ? albums.map(albumCard).join('') : emptyState('暂无关联专辑')}</div></section>
    <section class="section"><div class="section-head"><h2>关联单曲 (${tracks.length})</h2></div><div class="track-box">${tracks.length ? tracks.slice(0, 12).map((track, index) => trackRow(track, index, { listen: false })).join('') : emptyState('暂无关联单曲')}</div></section></div>`;
  view.removeAttribute('aria-busy');
}/* ------------------------------ interactions ------------------------------ */

function followArtist() {
  toast('已关注该艺人');
}

function randomPick() {
  const pool = pickPool();
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

function openPostComposer() {
  const topics = (state.community.topics.length ? state.community.topics : DEFAULT_TOPICS).filter((topic) => topic.key !== 'all');
  openSheet(`<h3>发布内容</h3>
    <label class="field"><span>话题</span><select id="postTopic">${topics.map((topic) => `<option value="${topic.key}" ${state.community.topic === topic.key ? 'selected' : ''}>${esc(topic.label)}</option>`).join('')}</select></label>
    <label class="field"><span>标题</span><input id="postTitle" maxlength="120" placeholder="一句话说清你想聊什么"></label>
    <label class="field"><span>正文</span><textarea id="postBody" rows="4" maxlength="2000" placeholder="展开说说，或者安利你的宝藏歌手 / 歌曲…"></textarea></label>
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
  try {
    const response = await fetch('/api/community/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, body })
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
  } catch (error) {
    if (submit) {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      submit.textContent = restore;
    }
    return toast('发布失败，请稍后再试');
  }
  closeSheet();
  toast('已发布');
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
  root.setAttribute('aria-busy', 'true');
  root.innerHTML = '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-card"></div>';
  const data = await safeApi(`/api/search?q=${encodeURIComponent(query)}`, null);
  state.discover = data || { query, counts: { artists: 0, albums: 0, tracks: 0 }, results: { artists: [], albums: [], tracks: [] }, error: 'network' };
  const current = $('#discoverResults');
  if (current) {
    current.innerHTML = searchResultsHtml(state.discover);
    current.removeAttribute('aria-busy');
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
    <p class="sheet-note">一致性检查：${issues.length ? issues.map(([key, value]) => `${esc(key)} ${esc(value)}`).join(' · ') : '全部通过 ✓'}</p>`);
}

/* --------------------------------- boot ----------------------------------- */

navigate('home');