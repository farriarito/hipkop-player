/* HIPKOP shared presentation components. No generated catalog or social data. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const argument = value => escape(JSON.stringify(String(value ?? '')));

  // Missing provider URLs must never become a relative /undefined request.
  // Use this at every media boundary, including CSS backgrounds and the player.
  function resource(value, fallback = '/hipkop-logo.svg') {
    const safeFallback = () => fallback === '/hipkop-logo.svg' ? fallback : resource(fallback);
    if (typeof value !== 'string' || !value.trim()) return safeFallback();
    const candidate = value.trim();
    if (/^(undefined|null)$/i.test(candidate) || /[\s"'<>\\]/.test(candidate)) return safeFallback();
    try {
      const parsed = new URL(candidate, location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) return safeFallback();
      if (/(^|\/)(undefined|null)(\/|$)/i.test(decodeURIComponent(parsed.pathname))) return safeFallback();
      return candidate;
    } catch { return safeFallback(); }
  }
  function timestamp(value) {
    if (!value || Number.isNaN(Date.parse(value))) return '';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(value));
  }
  function actions(item, liked = false) {
    if (!item?.id) return '';
    const id = argument(item.id);
    return `<div class="work-actions">
      <button type="button" class="work-play" data-play-work="${escape(item.id)}" onclick="event.stopPropagation();playWork(${id})" aria-label="试听 ${escape(item.title)}" aria-pressed="false"><span class="play-shape" aria-hidden="true"></span><span data-work-play-label>试听</span></button>
      <button type="button" class="work-save" data-like-id="${escape(item.id)}" onclick="event.stopPropagation();toggleLike(${id})" aria-pressed="${liked}" aria-label="${liked ? '取消收藏' : '收藏'} ${escape(item.title)}">${liked ? '♥ 已收藏' : '♡ 收藏'}</button>
    </div>`;
  }
  function chartInfo(items, sort = 'popularity') {
    const sources = [...new Set(items.map(item => item.heatSource).filter(Boolean))];
    const dates = items.map(item => item.syncedAt).filter(value => value && !Number.isNaN(Date.parse(value))).sort();
    const apple = sources.filter(source => source.startsWith('apple-rss:'));
    const sourceLabel = sort === 'score' ? '排序：目录编辑分，非用户评分'
      : sort === 'date' ? '排序：作品发行日期'
      : apple.length ? `热度来源：Apple Music · ${apple.map(source => source.split(':')[1].toUpperCase()).join(' / ')}`
      : sources.length ? `热度来源：${sources.join(' / ')}` : '部分作品暂无热度来源';
    return `<div class="chart-edition"><span>当前目录快照</span><span>${escape(sourceLabel)}</span>${dates.length ? `<time datetime="${escape(dates.at(-1))}">目录同步 ${escape(timestamp(dates.at(-1)))}</time>` : ''}</div>`;
  }
  function podium(items, renderCover, isLiked) {
    if (!items.length) return '';
    return `<div class="chart-podium" aria-label="当前排序前三名">
      ${items.slice(0, 3).map((item, index) => `<article class="podium-record podium-${index + 1}" data-work-id="${escape(item.id)}">
        <div class="podium-position"><span>NO.</span><b>${String(index + 1).padStart(2, '0')}</b></div>
        <button type="button" class="podium-art" onclick="openItem(${argument(item.id)})" aria-label="打开第 ${index + 1} 名 ${escape(item.title)}">
          <span class="podium-vinyl" aria-hidden="true"><img src="/hipkop-logo.svg" alt=""></span>${renderCover(item, 'rank-cover podium-cover')}
        </button>
        <div class="podium-copy"><span>${escape(item.genreBucket === 'kpop' ? 'K-POP' : item.genreBucket === 'hiphop' ? 'HIP-HOP' : item.genre || '音乐档案')}</span><h2><button type="button" onclick="openItem(${argument(item.id)})">${escape(item.title)}</button></h2><p>${escape(item.artist)}</p></div>
        ${actions(item, isLiked(item.id))}
      </article>`).join('')}
    </div>`;
  }
  function archive(items, renderCover, isLiked) {
    if (!items.length) return '';
    const selected = [items.find(item => item.genreBucket === 'hiphop'), items.find(item => item.genreBucket === 'kpop')].filter(Boolean);
    if (!selected.length) return '';
    return `<section class="section archive-portals"><div class="section-head"><h2>两种频率，同场入耳。</h2></div><div class="archive-duo">
      ${selected.map(item => `<article class="archive-portal" data-bucket="${escape(item.genreBucket)}"><span class="archive-index">${item.genreBucket === 'kpop' ? '02 / STAGE ENERGY' : '01 / STREET FREQUENCY'}</span><button class="archive-art" type="button" onclick="openItem(${argument(item.id)})" aria-label="探索 ${escape(item.title)}">${renderCover(item)}</button><h3>${escape(item.title)}</h3><p>${escape(item.artist)}</p>${actions(item, isLiked(item.id))}<button class="archive-route" type="button" onclick="setBrowseBucket('${item.genreBucket === 'kpop' ? 'kpop' : 'hiphop'}')">深入${item.genreBucket === 'kpop' ? '舞台' : '街头'}声场 ↗</button></article>`).join('')}
    </div></section>`;
  }
  function post(post, topicName, featured = false) {
    const time = timestamp(post.createdAt);
    const related = post.albumId && post.albumTitle ? `<div class="post-music">
      <button class="post-music-detail" type="button" onclick="openItem(${argument(post.albumId)})" aria-label="打开关联作品 ${escape(post.albumTitle)}"><img src="/media/cover/${encodeURIComponent(post.albumId)}?w=100" alt="${escape(post.albumTitle)}封面" loading="lazy" width="48" height="48" onerror="this.src='/hipkop-logo.svg';this.onerror=null"><span><small>帖子关联作品</small><b>${escape(post.albumTitle)}</b><em>${escape(post.albumArtist || '')}</em></span></button>
      <button type="button" class="track-preview" onclick="playWork(${argument(post.albumId)})" aria-label="试听关联作品 ${escape(post.albumTitle)}"><span class="play-shape" aria-hidden="true"></span></button></div>` : '';
    return `<article class="post wall-post${featured ? ' wall-featured' : ''}" data-post-id="${escape(post.id)}">
      ${featured ? '<div class="wall-feature-label">编辑来信 <span aria-hidden="true">↗</span></div>' : ''}
      <div class="post-meta"><span class="post-author">${escape(post.author || 'HIPKOP 听众')}</span><span class="post-topic">${escape(topicName)}</span>${time ? `<time datetime="${escape(post.createdAt)}">${escape(time)}</time>` : ''}</div>
      <h3><button type="button" onclick="openCommunityPost(${argument(post.id)})">${escape(post.title)}</button></h3><p>${escape(post.body)}</p>
      ${related}${post.artistId && post.artistName ? `<button class="post-artist" type="button" onclick="artistDetail(${argument(post.artistId)})">关联艺人 · ${escape(post.artistName)} ↗</button>` : ''}
      <footer class="wall-footer">${Number.isFinite(post.likes) ? `<span>${Number(post.likes)} 赞</span>` : ''}<button type="button" onclick="openCommunityPost(${argument(post.id)})">展开这段声音 ↗</button></footer>
    </article>`;
  }
  function wall(items, topicName) {
    if (!items.length) return `<div class="wall-empty"><span aria-hidden="true">＋</span><h2>这面墙，等你的声音。</h2><p>聊一张新作，留一段现场，或安利你的私藏。</p><button class="ghost" type="button" onclick="openPostComposer()">写下第一帖 ↗</button></div>`;
    const letter = items.find(item => /编辑/.test(item.author || ''));
    return `${letter ? post(letter, topicName(letter.topic), true) : ''}<div class="wall-timeline">${items.filter(item => item !== letter).map(item => post(item, topicName(item.topic))).join('')}</div>`;
  }
  function syncPlayback(value = window.HipkopPlayer?.snapshot()) {
    if (!value) return;
    document.querySelectorAll('[data-play-work]').forEach(button => {
      const id = button.getAttribute('data-play-work');
      const active = value.status === 'playing' && (value.id === id || value.item?.albumId === id);
      button.setAttribute('aria-pressed', String(active));
      const label = button.querySelector('[data-work-play-label]');
      if (label) label.textContent = active ? '暂停' : '试听';
      button.closest('[data-work-id]')?.setAttribute('data-playing', String(active));
    });
  }
  window.addEventListener('hipkop:player', event => syncPlayback(/** @type {CustomEvent<HipkopPlaybackState>} */ (event).detail));
  window.HipkopCulture = { resource, timestamp, actions, chartInfo, podium, archive, post, wall, syncPlayback };
})();
