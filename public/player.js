// @ts-check
'use strict';

/**
 * One persistent media element for the entire native SPA. Nothing marks a
 * record "playing" until the browser's real audio `playing` event arrives.
 * Apple metadata previews are excerpts, not a substitute for licensed audio.
 */
(() => {
  /** @typedef {{id:string,title?:string,artist?:string,coverUrl?:string|null,previewUrl?:string|null,kind?:string,albumId?:string|null,externalUrl?:string|null,listen?:{platforms?:Array<{url:string,exact?:boolean}>}}} PlayerItem */
  /** @typedef {'idle'|'loading'|'playing'|'paused'|'ended'|'error'|'no-preview'} PlayerStatus */
  /** @typedef {{item:PlayerItem|null,id:string|null,title:string,artist:string,cover:string,status:PlayerStatus,currentTime:number,duration:number,queue:PlayerItem[],index:number,message:string,externalUrl:string|null}} PlayerState */
  const audio = new Audio();
  audio.id = 'hipkopAudio';
  audio.hidden = true;
  audio.preload = 'metadata';
  /** @type {Set<(state:PlayerState)=>void>} */
  const listeners = new Set();
  /** @type {PlayerState} */
  let state = {
    item: null, id: null, title: '', artist: '', cover: '', status: 'idle',
    currentTime: 0, duration: 0, queue: [], index: -1, message: '', externalUrl: null
  };
  /** @type {PlayerItem[]} */
  let featured = [];
  let request = 0;
  let loadedSource = '';
  const failedCovers = new Set();
  /** @type {HTMLElement|null} */
  let host = null;
  const clock = (/** @type {number} */ value) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  const snapshot = () => ({ ...state, item: state.item ? { ...state.item } : null, queue: [...state.queue] });
  function publish() {
    render();
    const value = snapshot();
    listeners.forEach(listener => listener(value));
    window.dispatchEvent(new CustomEvent('hipkop:player', { detail: value }));
  }
  function update(/** @type {Partial<PlayerState>} */ patch) {
    state = { ...state, ...patch };
    publish();
  }
  function externalUrl(/** @type {PlayerItem} */ item) {
    const candidates = [item.externalUrl, ...(item.listen?.platforms || []).filter(p => p.exact).map(p => p.url), ...(item.listen?.platforms || []).map(p => p.url)];
    return candidates.find(url => typeof url === 'string' && /^https?:\/\//.test(url)) || null;
  }
  function mount() {
    document.body.append(audio);
    host = document.getElementById('miniPlayer');
    if (!host) return;
    host.innerHTML = `<div class="mini-player-art"><img data-player-cover alt="" src="/hipkop-logo.svg"></div>
      <div class="mini-player-copy"><strong data-player-title></strong><span data-player-caption></span></div>
      <a data-player-external class="mini-player-external" target="_blank" rel="noopener noreferrer" hidden>平台收听</a>
      <button type="button" data-player-previous aria-label="上一首"><span aria-hidden="true">‹</span></button>
      <button type="button" data-player-toggle class="mini-player-toggle" aria-label="播放"><span data-player-symbol aria-hidden="true">▶</span></button>
      <button type="button" data-player-next aria-label="下一首"><span aria-hidden="true">›</span></button>
      <div class="mini-player-progress" aria-hidden="true"><i data-player-progress></i></div>
      <span class="sr-only" data-player-announcement role="status" aria-live="polite"></span>`;
    host.querySelector('[data-player-toggle]')?.addEventListener('click', () => void toggle());
    host.querySelector('[data-player-next]')?.addEventListener('click', () => void next());
    host.querySelector('[data-player-previous]')?.addEventListener('click', () => void previous());
    const image = /** @type {HTMLImageElement|null} */ (host.querySelector('[data-player-cover]'));
    image?.addEventListener('error', () => {
      if (image && !image.src.endsWith('/hipkop-logo.svg')) {
        failedCovers.add(image.getAttribute('src'));
        image.src = '/hipkop-logo.svg';
      }
    });
    render();
  }
  function render() {
    if (!host) return;
    host.hidden = state.status === 'idle';
    document.body.classList.toggle('has-player', state.status !== 'idle');
    host.dataset.status = state.status;
    const title = host.querySelector('[data-player-title]');
    const caption = host.querySelector('[data-player-caption]');
    const announcement = host.querySelector('[data-player-announcement]');
    const symbol = host.querySelector('[data-player-symbol]');
    const image = /** @type {HTMLImageElement|null} */ (host.querySelector('[data-player-cover]'));
    const link = /** @type {HTMLAnchorElement|null} */ (host.querySelector('[data-player-external]'));
    const button = /** @type {HTMLButtonElement|null} */ (host.querySelector('[data-player-toggle]'));
    const progress = /** @type {HTMLElement|null} */ (host.querySelector('[data-player-progress]'));
    const description = state.status === 'error' || state.status === 'no-preview'
      ? state.message : `${state.artist} · 试听 ${clock(state.currentTime)} / ${clock(state.duration)}`;
    if (title) title.textContent = state.title;
    if (caption) caption.textContent = description;
    if (announcement && announcement.getAttribute('data-state') !== state.status) {
      announcement.textContent = state.status === 'playing' ? `正在试听 ${state.title}` : state.message;
      announcement.setAttribute('data-state', state.status);
    }
    const rawCover = state.cover && !failedCovers.has(state.cover) ? state.cover : '/hipkop-logo.svg';
    const cover = window.HipkopCulture?.resource(rawCover) || '/hipkop-logo.svg';
    if (image && image.getAttribute('src') !== cover) image.src = cover;
    if (symbol) symbol.textContent = state.status === 'playing' ? 'Ⅱ' : state.status === 'loading' ? '…' : '▶';
    if (button) {
      button.setAttribute('aria-label', state.status === 'playing' ? '暂停试听' : '播放试听');
      button.disabled = state.status === 'loading' || state.status === 'no-preview';
    }
    if (link) {
      link.hidden = !state.externalUrl;
      link.href = state.externalUrl || '#';
    }
    if (progress) progress.style.transform = `scaleX(${state.duration ? Math.min(1, state.currentTime / state.duration) : 0})`;
    for (const direction of ['previous', 'next']) {
      const control = /** @type {HTMLButtonElement|null} */ (host.querySelector(`[data-player-${direction}]`));
      if (control) control.disabled = state.queue.length < 2 || state.status === 'loading';
    }
  }
  async function getJSON(/** @type {string} */ url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('暂时无法加载试听');
    return response.json();
  }
  async function resolve(/** @type {PlayerItem|string} */ value) {
    const item = typeof value === 'string' ? { id: value } : value;
    if (item.previewUrl && /^https?:\/\//.test(item.previewUrl)) return [item];
    if (item.id.includes('-track-') || item.albumId) {
      const data = await getJSON(`/api/tracks/${encodeURIComponent(item.id)}`);
      return data.track ? [data.track] : [];
    }
    const data = await getJSON(`/api/albums/${encodeURIComponent(item.id)}`);
    return (data.tracks || []).map((/** @type {PlayerItem} */ track) => ({
      ...track, artist: track.artist || data.album?.artist || item.artist,
      coverUrl: track.coverUrl || data.album?.coverUrl || item.coverUrl
    }));
  }
  async function start(/** @type {number} */ index, /** @type {number} */ token) {
    const item = state.queue[index];
    if (!item || token !== request) return false;
    audio.pause();
    loadedSource = item.previewUrl || '';
    update({
      item, id: item.id, title: item.title || '未命名曲目', artist: item.artist || '',
      cover: item.coverUrl || '', status: 'loading', index, currentTime: 0, duration: 0,
      message: '', externalUrl: externalUrl(item)
    });
    audio.src = loadedSource;
    audio.load();
    try {
      await audio.play();
      return token === request && !audio.paused;
    } catch (error) {
      if (token !== request) return false;
      update({
        status: 'error',
        message: error instanceof Error && error.name === 'NotAllowedError'
          ? '浏览器需要手动播放，请再点一次。' : '试听加载失败，可前往平台收听。'
      });
      return false;
    }
  }
  async function playQueue(/** @type {(PlayerItem|string)[]} */ items) {
    const token = ++request;
    audio.pause();
    const first = typeof items[0] === 'object' ? items[0] : { id: items[0] || '' };
    update({
      item: first, id: first.id, title: first.title || '正在找寻声音', artist: first.artist || '',
      cover: first.coverUrl || '', queue: [], index: -1, status: 'loading',
      currentTime: 0, duration: 0, message: '', externalUrl: externalUrl(first)
    });
    try {
      const results = await Promise.all(items.slice(0, 6).map(value => resolve(value).catch(() => [])));
      if (token !== request) return false;
      const all = results.flat();
      const ids = new Set();
      const queue = all.filter(item => {
        if (!item.previewUrl || !/^https?:\/\//.test(item.previewUrl) || ids.has(item.id)) return false;
        ids.add(item.id);
        return true;
      });
      if (!queue.length) {
        loadedSource = '';
        audio.removeAttribute('src');
        audio.load();
        update({ status: 'no-preview', message: '此作品暂无试听，前往平台听完整版。' });
        return false;
      }
      state.queue = queue;
      return start(0, token);
    } catch (error) {
      if (token === request) update({ status: 'error', message: '试听暂不可用，可前往平台收听。' });
      return false;
    }
  }
  async function playItem(/** @type {PlayerItem|string} */ item) { return playQueue([item]); }
  async function toggle() {
    if (state.status === 'playing') {
      audio.pause();
      return false;
    }
    if (state.status === 'loading') return false;
    if (!loadedSource || !state.queue.length) return featured.length ? playQueue(featured) : false;
    if (state.status === 'ended') audio.currentTime = 0;
    const token = request;
    update({ status: 'loading', message: '' });
    try { await audio.play(); return !audio.paused; }
    catch (error) {
      if (token === request) update({ status: 'error', message: '试听加载失败，请再试一次或前往平台。' });
      return false;
    }
  }
  async function next() {
    if (!state.queue.length) return false;
    return start((state.index + 1) % state.queue.length, ++request);
  }
  async function previous() {
    if (!state.queue.length) return false;
    return start((state.index - 1 + state.queue.length) % state.queue.length, ++request);
  }
  audio.addEventListener('playing', () => update({ status: 'playing', message: '' }));
  audio.addEventListener('pause', () => {
    if (state.status === 'playing' && !audio.ended) update({ status: 'paused' });
  });
  audio.addEventListener('waiting', () => {
    if (state.status === 'playing') update({ status: 'loading' });
  });
  audio.addEventListener('ended', () => update({ status: 'ended', currentTime: audio.duration || 0 }));
  audio.addEventListener('error', () => {
    if (loadedSource && state.status !== 'idle' && state.status !== 'no-preview') {
      update({ status: 'error', message: '试听音源暂不可用，可前往平台收听。' });
    }
  });
  audio.addEventListener('loadedmetadata', () => update({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }));
  audio.addEventListener('timeupdate', () => update({ currentTime: audio.currentTime || 0 }));
  window.HipkopPlayer = {
    playItem, playQueue, toggle, next, previous, snapshot,
    setFeatured: (/** @type {PlayerItem[]} */ items) => { featured = [...items]; },
    toggleFeatured: () => state.status === 'playing' || loadedSource ? toggle() : playQueue(featured),
    on: (/** @type {(value:PlayerState)=>void} */ listener) => {
      listeners.add(listener);
      listener(snapshot());
      return () => { listeners.delete(listener); };
    },
    pause: () => { ++request; audio.pause(); if (state.item) update({ status: 'paused' }); },
    get audio() { return audio; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
