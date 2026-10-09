'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = { window: { addEventListener() {} }, location: { origin: 'http://127.0.0.1:4185' }, URL, Intl };
vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname, '../public/culture.js'), 'utf8'), ctx);
const ui = ctx.window.HipkopCulture;

test('resource boundary rejects /undefined, /null and unsafe URLs', () => {
  for (const input of [undefined, null, '', 'undefined', 'null', '/undefined', './undefined',
    '/hipkop/undefined', 'http://localhost/null', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>',
    '/%75ndefined', 'https://music.invalid/undefined']) {
    assert.equal(ui.resource(input), '/hipkop-logo.svg', String(input));
  }
  assert.equal(ui.resource('/media/cover/real-id'), '/media/cover/real-id');
  assert.equal(ui.resource('https://example.org/cover.jpg'), 'https://example.org/cover.jpg');
  assert.equal(ui.resource(null, '/media/hero/valid-id'), '/media/hero/valid-id');
  assert.equal(ui.resource(null, '/media/hero/undefined'), '/hipkop-logo.svg');
});
test('chart edition describes actual source and not a invented weekly period', () => {
  const output = ui.chartInfo([{ heatSource: 'apple-rss:kr', syncedAt: '2026-10-08T14:00:00Z' }]);
  assert.match(output, /Apple Music · KR/);
  assert.match(output, /当前目录快照/);
  assert.match(output, /目录同步/);
  assert.doesNotMatch(output, /本周|上升|下降/);
});
test('community posts without a linked album never get a cover or play attachment', () => {
  const output = ui.post({ id: 1, title: '现场', body: '真实文字', author: '听众', likes: 0 }, '演出');
  assert.doesNotMatch(output, /<img|post-music|playWork/);
  assert.match(output, /0 赞/);
  assert.match(output, /真实文字/);
  assert.doesNotMatch(ui.post({ id: 2, title: '未统计' }, '闲聊'), /赞/);
});
test('community music attachment uses the actual linked id and escapes content', () => {
  const output = ui.post({ id: 1, title: '<img onerror=x>', body: '<script>x</script>', albumId: 'album-1', albumTitle: '唱片' }, '乐评');
  assert.match(output, /\/media\/cover\/album-1/);
  assert.match(output, /playWork/);
  assert.doesNotMatch(output, /<script>|<img onerror=x>/);
});
