'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/player.js'), 'utf8');

function playerFixture({ tracks = [], blocked = false } = {}) {
  class AudioStub {
    constructor() {
      this.listeners = new Map();
      this.paused = true;
      this.ended = false;
      this.currentTime = 0;
      this.duration = 30;
      this.src = '';
    }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    emit(name) { this.listeners.get(name)?.(); }
    pause() { this.paused = true; this.emit('pause'); }
    load() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    async play() {
      if (blocked) throw new Error('Media failed');
      this.paused = false;
      this.emit('playing');
    }
  }
  const window = { dispatchEvent() {} };
  const sandbox = {
    window, Audio: AudioStub, AbortSignal, CustomEvent: class {},
    document: { readyState: 'complete', getElementById: () => null, body: { append() {} } },
    fetch: async () => ({ ok: true, json: async () => ({ tracks }) }),
    console
  };
  vm.runInNewContext(source, sandbox);
  return window.HipkopPlayer;
}

const playable = { id: 'itunes-track-1', title: 'Real preview', artist: 'Artist', previewUrl: 'https://audio.example.com/preview.m4a' };

test('player: state follows actual media events, pause and resume', async () => {
  const player = playerFixture();
  assert.equal(player.snapshot().status, 'idle');
  assert.equal(await player.playItem(playable), true);
  assert.equal(player.snapshot().status, 'playing');
  assert.equal(player.audio.paused, false);
  player.pause();
  assert.equal(player.snapshot().status, 'paused');
  assert.equal(player.audio.paused, true);
  await player.toggle();
  assert.equal(player.snapshot().status, 'playing');
});

test('player: album resolves real tracks, skips absent previews and duplicates', async () => {
  const player = playerFixture({ tracks: [
    { id: 'itunes-track-missing', title: 'Unavailable' }, playable, playable,
    { ...playable, id: 'itunes-track-2', title: 'Second' }
  ] });
  await player.playQueue([{ id: 'itunes-album-1', title: 'Album' }]);
  assert.equal(player.snapshot().queue.length, 2);
  assert.equal(player.snapshot().id, playable.id);
  await player.next();
  assert.equal(player.snapshot().id, 'itunes-track-2');
  await player.previous();
  assert.equal(player.snapshot().id, playable.id);
});

test('player: no preview is honest and retains usable platform destination', async () => {
  const player = playerFixture();
  assert.equal(await player.playItem({ id: 'itunes-album-none', title: 'Not available', externalUrl: 'https://music.apple.com/album/none' }), false);
  assert.equal(player.snapshot().status, 'no-preview');
  assert.equal(player.audio.paused, true);
  assert.match(player.snapshot().message, /暂无试听/);
  assert.equal(player.snapshot().externalUrl, 'https://music.apple.com/album/none');
  assert.equal(player.snapshot().queue.length, 0);
});

test('player: failed actual play promise never sets playing', async () => {
  const player = playerFixture({ blocked: true });
  assert.equal(await player.playItem(playable), false);
  assert.equal(player.snapshot().status, 'error');
  assert.match(player.snapshot().message, /试听加载失败/);
});

test('player: empty queue never produces simulated sound', async () => {
  const player = playerFixture();
  assert.equal(await player.playQueue([]), false);
  assert.equal(player.snapshot().status, 'no-preview');
  assert.equal(player.audio.src, '');
});

test('player: subscriptions are cleaned up and ended is not playing', async () => {
  const player = playerFixture();
  const states = [];
  const stop = player.on(value => states.push(value.status));
  await player.playItem(playable);
  player.audio.emit('ended');
  assert.equal(player.snapshot().status, 'ended');
  const count = states.length;
  stop();
  player.audio.emit('playing');
  assert.equal(states.length, count);
});
