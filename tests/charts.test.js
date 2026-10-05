'use strict';

// Network-free tests for the multi-storefront chart merge. The RSS feeds are
// per country, so merging them (and keeping each album's best rank) is what
// gives K-POP titles a real popularity instead of a null.

const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const stamp = `${process.pid}-${Date.now()}`;
process.env.HIPKOP_DB_PATH = path.join(os.tmpdir(), `hipkop-charts-${stamp}.sqlite`);
process.env.HIPKOP_MEDIA_DIR = path.join(os.tmpdir(), `hipkop-charts-media-${stamp}`);
process.env.HIPKOP_DISABLED_PROVIDERS = 'itunes,deezer,musicbrainz,lastfm';
process.env.HIPKOP_SCHEDULER = '0';

const { chartFeedUrl, chartEntry, chartEntriesForFeed, mergeChartFeeds } = require('../src/sync');

const item = (id, name, artistName) => ({
  id,
  name,
  artistName,
  artistId: `artist-${id}`,
  artworkUrl100: 'https://is1.mzstatic.com/image/thumb/x/100x100bb.jpg',
  releaseDate: '2026-04-01T07:00:00Z',
  genres: [{ name: 'Hip-Hop/Rap' }],
  url: `https://music.apple.com/album/${id}`
});

test('charts: feed url follows the storefront', () => {
  assert.match(chartFeedUrl('kr'), /\/api\/v2\/kr\/music\/most-played\/100\/albums\.json$/);
  assert.match(chartFeedUrl('jp'), /\/api\/v2\/jp\//);
});

test('charts: the top of a feed scores 100 and the tail scores 1', () => {
  const results = Array.from({ length: 100 }, (_, index) => item(`a${index}`, `Album ${index}`, 'Someone'));
  const entries = chartEntriesForFeed('us', results);
  assert.equal(entries.length, 100);
  assert.equal(entries[0].popularity, 100);
  assert.equal(entries[99].popularity, 1);
  assert.ok(entries.every((entry, index) => index === 0 || entries[index - 1].popularity > entry.popularity));
});

test('charts: a storefront label and a 900px cover are stamped on every entry', () => {
  const entry = chartEntry(item('1', 'Album', 'Artist'), 0, 10, 'kr');
  assert.equal(entry.chartSource, 'apple-rss:kr');
  assert.equal(entry.coverUrl, 'https://is1.mzstatic.com/image/thumb/x/900x900bb.jpg');
  assert.equal(entry.kind, 'album');
});

test('charts: feed rows without an id are skipped', () => {
  const entries = chartEntriesForFeed('us', [item('1', 'A', 'X'), { name: 'no id' }, null, item('2', 'B', 'Y')]);
  assert.deepEqual(entries.map((entry) => entry.providerId), ['1', '2']);
});

test('charts: merging keeps the better rank for a duplicate album', () => {
  const us = [item('shared', 'Shared', 'Artist'), item('us-only', 'US Only', 'Artist')];
  const kr = [item('kr-only', 'KR Only', 'Artist'), item('shared', 'Shared', 'Artist')];
  const merged = mergeChartFeeds([
    { storefront: 'us', results: us },
    { storefront: 'kr', results: kr }
  ]);
  assert.equal(merged.size, 3);
  const shared = merged.get('shared');
  assert.equal(shared.popularity, 100);
  assert.equal(shared.chartSource, 'apple-rss:us');
  assert.equal(merged.get('kr-only').chartSource, 'apple-rss:kr');
});

test('charts: a later storefront can improve an earlier rank', () => {
  const short = [item('x', 'X', 'A')];
  const long = [item('other', 'O', 'B'), item('x', 'X', 'A')];
  const merged = mergeChartFeeds([
    { storefront: 'us', results: long },
    { storefront: 'kr', results: short }
  ]);
  assert.equal(merged.get('x').popularity, 100);
  assert.equal(merged.get('x').chartSource, 'apple-rss:kr');
});

test('charts: empty or absent feeds merge to nothing', () => {
  assert.equal(mergeChartFeeds([]).size, 0);
  assert.equal(mergeChartFeeds([{ storefront: 'us' }]).size, 0);
  assert.equal(mergeChartFeeds(undefined).size, 0);
});