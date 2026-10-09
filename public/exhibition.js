'use strict';

// The listening exhibition is a view component, not a separate application.
// Catalog, routing and audio remain owned by app.js and player.js.
(() => {
  const text = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  function stage(items = []) {
    const featured = items[0];
    const current = featured ? `<button class="stage-work" type="button" onclick="openItem('${text(featured.id)}')" aria-label="打开精选作品 ${text(featured.title)}">
      <img src="${text(window.HipkopCulture.resource(featured.coverUrl, featured.id ? '/media/cover/' + encodeURIComponent(featured.id) : '/hipkop-logo.svg'))}" width="52" height="52" alt="${text(featured.title)}封面" onerror="this.src='/hipkop-logo.svg';this.onerror=null">
      <span><small data-stage-work-kind>本期入场作品</small><b data-stage-work-title>${text(featured.title)}</b><em data-stage-work-artist>${text(featured.artist)}</em></span><span class="work-arrow" aria-hidden="true">↗</span>
    </button>` : '<p class="stage-empty">作品正在入场，稍后再来听。</p>';
    const sculpture = window.HipkopArt?.stage() || `<div class="art-fallback" aria-hidden="true"><div class="fallback-stone"><div class="fallback-disc"></div></div><div class="fallback-cloth"></div></div>`;
    return `<section class="exhibition-stage" id="listeningStage" aria-label="HIPKOP 沉浸式声场">
      <div class="stage-topline"><span>HIP-HOP × K-POP</span><span class="stage-signal"><i aria-hidden="true"></i><span data-play-signal>等待入场</span></span></div>
      <div class="stage-composition">
        <div class="stage-heading"><span class="stage-caption"><span>HEAR EACH OTHER.</span><span class="sound-glyph" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></span><h1><span>NEW</span><span>WAVE<span class="headline-period">.</span></span></h1></div>
        <div class="stage-scenery"><div class="stage-art" id="stageArt">${sculpture}</div></div>
        <span class="stage-side-note" aria-hidden="true">THE LISTENING OBJECT</span>
        <span class="stage-art-note" aria-hidden="true"><i></i> 声音，有了形状。</span>
      </div>
      <div class="stage-bottom">
        <div class="stage-editorial"><div class="stage-deck"><h2>不同风格，<br>同一声场。</h2><p>从街角到舞台，从说唱到流行。<br>好音乐，让我们听见彼此。</p></div>
        <div class="stage-controls"><button id="stagePlay" type="button" class="stage-play" onclick="toggleExhibitionPlayback()" aria-label="播放声场精选试听" aria-pressed="false"><span class="play-shape" aria-hidden="true"></span><span data-stage-play-label>播放声场</span><span class="play-duration">试听</span></button>
        <button type="button" class="stage-open" onclick="openExhibitionQueue()">展开歌单 <span aria-hidden="true">↗</span></button></div>
        <p class="stage-play-note" data-stage-play-note aria-live="polite">精选作品试听，完整版在来源平台收听。</p><div class="stage-progress" aria-hidden="true"><i data-stage-progress></i></div><span class="stage-progress-caption">播放进度 · 非实时振幅分析</span></div>
        ${current}
      </div>
    </section>`;
  }
  // Playback UI is independent of GSAP, including reduced-motion / script-failure
  // modes. The real audio events published by player.js are the only source.
  function syncPlayer(value = window.HipkopPlayer?.snapshot()) {
    const host = document.querySelector('#listeningStage');
    if (!host || !value) return;
    const playing = value.status === 'playing';
    const loading = value.status === 'loading';
    host.setAttribute('data-playing', String(playing));
    const button = host.querySelector('#stagePlay');
    button?.setAttribute('aria-pressed', String(playing));
    button?.setAttribute('aria-busy', String(loading));
    button?.setAttribute('aria-label', playing ? '暂停声场试听' : '播放声场精选试听');
    const label = host.querySelector('[data-stage-play-label]');
    const signal = host.querySelector('[data-play-signal]');
    const note = host.querySelector('[data-stage-play-note]');
    if (label) label.textContent = playing ? '暂停声场' : loading ? '声音入场中' : '播放声场';
    if (signal) signal.textContent = playing ? '正在同频' : loading ? '正在连接' : value.status === 'paused' ? '暂歇片刻' : '等待入场';
    if (note) {
      const next = value.status === 'error' || value.status === 'no-preview'
        ? value.message : value.title && value.status !== 'idle'
          ? `${playing ? '正在试听' : '声场精选'} · ${value.title} — ${value.artist}`
          : '精选作品试听，完整版在来源平台收听。';
      // timeupdate should not repeatedly retrigger the live announcement.
      if (note.textContent !== next) note.textContent = next;
    }
    const progress = /** @type {HTMLElement|null} */ (host.querySelector('[data-stage-progress]'));
    if (progress) progress.style.transform = `scaleX(${value.duration ? Math.min(1, value.currentTime / value.duration) : 0})`;
    // Keep the featured information consistent even if playback starts elsewhere.
    const work = host.querySelector('.stage-work');
    if (work && value.item && value.status !== 'idle') {
      const title = work.querySelector('[data-stage-work-title]');
      const artist = work.querySelector('[data-stage-work-artist]');
      const kind = work.querySelector('[data-stage-work-kind]');
      if (title) title.textContent = value.title;
      if (artist) artist.textContent = value.artist;
      if (kind) kind.textContent = '当前试听作品';
      const image = /** @type {HTMLImageElement|null} */ (work.querySelector('img'));
      const source = window.HipkopCulture.resource(value.cover);
      if (image && image.getAttribute('data-source') !== source) {
        image.setAttribute('data-source', source);
        image.src = source;
        image.alt = `${value.title}封面`;
        image.onerror = () => { image.src = '/hipkop-logo.svg'; image.onerror = null; };
      }
      work.setAttribute('aria-label', `打开当前作品 ${value.title}`);
      work.setAttribute('onclick', `openItem(${JSON.stringify(value.item.albumId || value.id)})`);
    }
  }
  window.addEventListener('hipkop:player', event => syncPlayer(/** @type {CustomEvent<HipkopPlaybackState>} */ (event).detail));
  window.HipkopExhibition = { stage, syncPlayer };
})();
