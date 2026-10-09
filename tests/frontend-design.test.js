'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const app = read('public/app.js');
const html = read('public/index.html');

test('brand: the shared headphone logo is used in the header and favicon', () => {
  const logo = read('public/hipkop-logo.svg');
  assert.match(logo, /viewBox="0 0 128 128"/);
  assert.match(logo, /id="heat"/);
  assert.match(html, /class="brand-logo" src="\/hipkop-logo.svg"/);
  assert.match(html, /rel="icon" href="\/hipkop-logo.svg"/);
  assert.match(html, /<span>HIPKOP<\/span>/);
  assert.match(html, /<title>HIPKOP · Culture Feed<\/title>/);
  assert.doesNotMatch(html, /HIPKOP<span class="brand-dot">/);
});

test('home design: title glyph is independent of catalog media', () => {
  const stage = read('public/exhibition.js');
  const intro = stage.slice(stage.indexOf('<div class="stage-heading">'), stage.indexOf('<div class="stage-scenery">'));
  assert.match(stage, /HIP-HOP × K-POP/);
  assert.match(intro, /HEAR EACH OTHER/);
  assert.equal((intro.match(/<i><\/i>/g) || []).length, 7);
  assert.doesNotMatch(intro, /<img|coverUrl|heroSlides/);
});

test('exhibition motion targets the real stage and real playback state', () => {
  const motion = read('public/motion.js');
  assert.match(motion, /\.exhibition-stage/);
  assert.match(motion, /\.art-vinyl-spin/);
  assert.match(motion, /snapshot\(\)\.status === 'playing'/);
  assert.match(motion, /hipkop:player/);
  assert.match(motion, /prefers-reduced-motion: no-preference/);
  assert.match(motion, /media\?\.revert\(\)/);
  assert.doesNotMatch(motion, /\.culture-intro|\.hero-banner/);
});

test('player style uses the persistent actual markup and matching safe-area state', () => {
  const player = read('public/player.js');
  const css = read('public/exhibition.css');
  assert.match(player, /classList\.toggle\('has-player'/);
  for (const cls of ['mini-player-art', 'mini-player-copy', 'mini-player-toggle', 'mini-player-progress']) {
    assert(player.includes(cls), `player markup missing ${cls}`);
    assert(css.includes(`.${cls}`), `missing style for ${cls}`);
  }
  assert.match(css, /#miniPlayer\[hidden\]/);
});

test('home copy: renamed sections and removed closing campaign', () => {
  const home = app.slice(app.indexOf('async function viewHome()'), app.indexOf('async function loadCharts()'));
  assert.match(home, /<h2>私人雷达<\/h2>/);
  assert.match(home, /<h2>今日top10<\/h2>/);
  assert.doesNotMatch(home, /编辑榜 TOP10|编辑分 · 每日更新|culture-outro|找到同类|加入这场对话/);
});

test('charts: genuine podium, snapshot periods and restrained provenance', () => {
  const charts = app.slice(app.indexOf('async function viewCharts()'), app.indexOf('function discoverHint()'));
  assert.match(charts, /<h1>榜单<\/h1>/);
  assert.doesNotMatch(charts, /HIPKOP CHARTS|元数据 Provider/);
  assert.match(charts, /chartInfo/);
  assert.match(charts, /disabled title="尚未保存独立周期榜单"/);
  assert.match(charts, /榜单分类/);
  assert.match(charts, /id="chartSort"/);
});

test('center uses the actual app logo, not the previous invented mark', () => {
  const art = read('public/exhibition-art.js');
  assert.match(art, /class="art-brand-logo" href="\/hipkop-logo.svg"/);
  assert.doesNotMatch(art, /M-24-8h11v-9/);
});

test('filters replace only their results and preserve the search input', () => {
  const filters = app.slice(app.indexOf('async function setBrowse('), app.indexOf('function setBrowseBucket('));
  assert.match(filters, /loadBrowse/);
  assert.match(filters, /filterStatus/);
  assert.doesNotMatch(filters, /await paint/);
  assert.match(app, /一键清除/);
  assert.match(app, /revision !== searchRequest/);
});

test('community presentation never fabricates people, music or engagement', () => {
  const ui = read('public/culture.js');
  assert.match(app, /const FALLBACK_ALBUMS = \[\]/);
  assert.match(app, /const FALLBACK_POSTS = \[\]/);
  assert.match(ui, /Number\.isFinite\(post\.likes\)/);
  assert.match(ui, /post\.albumId && post\.albumTitle/);
  assert.match(app, /albumId: \$\('#postAlbum'\)\.value \|\| null/);
});
