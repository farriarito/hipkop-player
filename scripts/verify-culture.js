'use strict';
// Actual app/SQLite/Provider acceptance. Happy-path music/API results are not mocked.
// Posting uses a consistent copy of the live SQLite catalog, never user data.
const { chromium } = require('@playwright/test');
const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const base = process.env.HIPKOP_UI_URL || 'http://127.0.0.1:4185';
const output = path.resolve(__dirname, '../docs/culture-verification');
const report = { base, started: new Date().toISOString(), checks: [], pageErrors: [], consoleErrors: [], httpErrors: [], undefinedRequests: [], screenshots: [], performance: [] };
let browser, fixtureHttp, fixtureDirectory;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check(name, work) {
  if (process.env.HIPKOP_CULTURE_ONLY && !name.includes(process.env.HIPKOP_CULTURE_ONLY)) return;
  console.log(`RUN  ${name}`);
  let timer;
  try {
    const evidence = await Promise.race([work(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('acceptance timed out after 90s')), 90000);
    })]);
    report.checks.push({ name, pass: true, evidence }); console.log(`PASS ${name}`);
  }
  catch (e) { report.checks.push({ name, pass: false, error: e.stack }); console.error(`FAIL ${name}: ${e.message}`); }
  finally { clearTimeout(timer); }
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#view') && !document.querySelector('#view').hasAttribute('aria-busy'), null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(850);
}
async function nav(page, tab) {
  await page.bringToFront();
  await page.locator(`[data-tab="${tab}"]`).click();
  await ready(page);
}
async function idle(page, id) {
  await page.waitForFunction(id => document.querySelector(id) && !document.querySelector(id).hasAttribute('aria-busy'), id);
  await page.waitForTimeout(420);
}
async function shot(page, name) {
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file });
  report.screenshots.push(file);
}
async function fixtureServer(storage) {
  console.log('fixture: copying live catalog');
  fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hipkop-culture-'));
  const dbPath = path.join(fixtureDirectory, 'catalog.sqlite');
  const db = new DatabaseSync(storage.path, { readOnly: true });
  db.exec(`VACUUM INTO '${dbPath.replace(/'/g, "''")}'`);
  db.close();
  console.log('fixture: catalog copied');
  // Separate HTTP instance in the verifier process, not a detached child.
  process.env.HIPKOP_DB_PATH = dbPath;
  process.env.HIPKOP_SCHEDULER = 'false';
  fixtureHttp = require('../server').server;
  console.log('fixture: HTTP module ready');
  const port = await new Promise((resolve, reject) => {
    fixtureHttp.once('error', reject);
    fixtureHttp.listen(0, '127.0.0.1', () => resolve(fixtureHttp.address().port));
  });
  console.log(`fixture: listening ${port}`);
  return `http://127.0.0.1:${port}`;
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const health = await (await fetch(`${base}/api/health`)).json();
  report.catalog = { storage: health.storage, stats: health.stats };
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === 'win32' ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' } : {})
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(30000);
  page.on('pageerror', e => report.pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) report.httpErrors.push({ url: r.url(), status: r.status() }); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', e => {
    if (/\/(?:undefined|null)(?:[/?#]|$)/i.test(e.request.url)) report.undefinedRequests.push({ url: e.request.url, initiator: e.initiator });
  });
  await page.goto(`${base}/hipkop`);
  await ready(page);
  await check('live HIPKOP identity and shared center logo', async () => {
    assert.equal(await page.locator('.brand>span').innerText(), 'HIPKOP');
    assert.equal(await page.title(), 'HIPKOP · Culture Feed');
    assert.equal(await page.locator('.art-brand-logo').getAttribute('href'), '/hipkop-logo.svg');
    assert.equal(await page.locator('.sound-glyph img').count(), 0);
    return { route: await page.url(), albums: health.stats.albums, tracks: health.stats.tracks };
  });
  await check('real home playback updates title, cover, progress and rotation', async () => {
    await page.locator('#stagePlay').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing', null, { timeout: 45000 });
    await page.waitForTimeout(600);
    const actual = await page.evaluate(() => ({
      state: window.HipkopPlayer.snapshot(),
      audio: { paused: window.HipkopPlayer.audio.paused, time: window.HipkopPlayer.audio.currentTime, source: window.HipkopPlayer.audio.currentSrc },
      title: document.querySelector('[data-stage-work-title]').textContent,
      cover: document.querySelector('.stage-work img').getAttribute('src'),
      progress: document.querySelector('[data-stage-progress]').getAttribute('style')
    }));
    assert(actual.audio.time > 0 && !actual.audio.paused);
    assert(actual.audio.source.startsWith('https://'));
    assert.equal(actual.title, actual.state.title);
    assert.equal(actual.cover, actual.state.cover);
    const before = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(300);
    assert.notEqual(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), before);
    await page.locator('#stagePlay').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'paused');
    const stop = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), stop);
    return { title: actual.title, time: actual.audio.time, actualRemoteAudio: true };
  });
  await check('podium, remaining ranks, unsupported cycles and actual API order', async () => {
    await nav(page, 'charts');
    assert.equal(await page.locator('.chart-periods button:disabled').count(), 3);
    const runs = [];
    for (const bucket of ['all', 'hiphop', 'kpop']) {
      await page.locator(`[onclick="setChartTab('${bucket}')"]`).click();
      await idle(page, '#chartList');
      for (const sort of ['popularity', 'date', 'score']) {
        await page.selectOption('#chartSort', sort);
        await idle(page, '#chartList');
        const payload = await page.evaluate(async ({ bucket, sort }) => (await fetch(`/api/charts?genre=${bucket}&sort=${sort}&limit=50`)).json(), { bucket, sort });
        assert.equal(await page.locator('.podium-record').count(), Math.min(3, payload.items.length));
        const ids = await page.locator('.podium-record').evaluateAll(elements => elements.map(el => el.getAttribute('data-work-id')));
        assert.deepEqual(ids, payload.items.slice(0, 3).map(item => item.id));
        assert.equal(await page.locator('#chartList .rank').count(), Math.max(0, payload.items.length - 3));
        if (payload.items.length > 3) assert.equal(await page.locator('#chartList .rank-no').first().innerText(), '04');
        assert(await page.locator('#chartInfo').innerText());
        runs.push({ bucket, sort, count: payload.items.length });
      }
    }
    return runs;
  });
  await check('podium playback and favorites remain real', async () => {
    await page.selectOption('#chartSort', 'popularity');
    await idle(page, '#chartList');
    const podium = page.locator('.podium-record').first();
    const id = await podium.getAttribute('data-work-id');
    await podium.locator('.work-save').click();
    assert.equal(await podium.locator('.work-save').getAttribute('aria-pressed'), 'true');
    assert(await page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('hipkop.favorites.v1'))[id]), id));
    await podium.locator('.work-play').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing', null, { timeout: 45000 });
    assert.equal(await podium.getAttribute('data-playing'), 'true');
    await podium.locator('.work-play').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'paused');
    assert.equal(await podium.getAttribute('data-playing'), 'false');
    return { saved: id, actualAudio: true };
  });
  await check('discovery uses both real music buckets and one searchable input', async () => {
    await nav(page, 'discover');
    assert.equal(await page.locator('input').count(), 1);
    assert.equal(await page.locator('.archive-portal[data-bucket=hiphop]').count(), 1);
    assert.equal(await page.locator('.archive-portal[data-bucket=kpop]').count(), 1);
    await page.locator('#discoverInput').fill('法老');
    await page.locator('#discoverInput').press('Enter');
    await idle(page, '#discoverResults');
    assert(await page.locator('.artist-result').count() > 0);
    assert(await page.locator('#discoverResults .card').count() > 0);
    await shot(page, 'discover-search-390');
  });
  await check('filters update in place, preserve search, clear and show empty states', async () => {
    const original = await page.locator('#discoverInput').elementHandle();
    await page.locator('[aria-label="风格筛选"] [onclick="setBrowseBucket(\'kpop\')"]').click();
    await idle(page, '#browseResults');
    assert.equal(await original.evaluate(el => el.isConnected), true);
    assert.equal(await page.locator('#discoverInput').inputValue(), '法老');
    assert.match(await page.locator('#filterStatus').innerText(), /筛选已启用/);
    await page.getByRole('button', { name: '一键清除', exact: false }).click();
    await idle(page, '#browseResults');
    assert.match(await page.locator('#filterStatus').innerText(), /全部档案/);
    await page.evaluate(() => setBrowseYear('1800'));
    await idle(page, '#browseResults');
    assert.match(await page.locator('#browseResults').innerText(), /还没有作品/);
    await page.getByRole('button', { name: '一键清除', exact: false }).click();
    await idle(page, '#browseResults');
  });
  await check('rapid searches never let an old request overwrite the new query', async () => {
    await page.evaluate(() => { void runDiscover('法老'); void runDiscover('aespa'); });
    await page.waitForFunction(() => state.discover?.query === 'aespa' && !document.querySelector('#discoverResults').hasAttribute('aria-busy'));
    assert(await page.locator('#discoverResults .artist-result').count() > 0);
    return { winningQuery: 'aespa', network: 'real local-first Provider API' };
  });
  await check('search result favorites, artists and linked work details remain usable', async () => {
    const save = page.locator('#discoverResults .card .work-save').first();
    await save.click();
    assert.equal(await save.getAttribute('aria-pressed'), 'true');
    await page.locator('.artist-result').first().click();
    await page.waitForSelector('.artist-page');
    await ready(page);
    assert(await page.locator('.artist-page .card').count() > 0);
    await page.locator('.artist-page .card .card-open').first().click();
    await page.waitForSelector('.detail');
    await ready(page);
    assert(await page.locator('.detail h1').innerText());
    assert.equal(await page.evaluate(() => scrollY), 0, 'detail navigation must not inherit the previous artist-page scroll anchor');
  });
  await check('community classifications, author/time/likes and expandable content', async () => {
    await nav(page, 'community');
    for (const topic of ['all', 'release', 'recommend', 'performance', 'review', 'general']) {
      await page.locator(`[onclick="setCommunityTopic('${topic}')"]`).click();
      await idle(page, '#communityFeed');
      const payload = await page.evaluate(async topic => (await fetch(`/api/community/posts?topic=${topic}&limit=40`)).json(), topic);
      assert.equal(await page.locator('#communityFeed .wall-post').count(), payload.items.length);
      if (!payload.items.length) assert(await page.locator('.wall-empty').isVisible());
      for (const post of payload.items) {
        const el = page.locator(`#communityFeed [data-post-id="${post.id}"]`);
        assert.match(await el.locator('.post-author').innerText(), new RegExp(post.author));
        assert.equal(await el.locator('.post-music').count(), post.albumId && post.albumTitle ? 1 : 0);
        assert.match(await el.locator('.wall-footer').innerText(), new RegExp(`${post.likes} 赞`));
      }
    }
    await page.locator('[onclick="setCommunityTopic(\'all\')"]').click();
    await idle(page, '#communityFeed');
    await page.locator('#communityFeed .wall-footer button').first().click();
    assert(await page.locator('.post-detail').isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sheet').isVisible(), false);
  });
  await check('real publish + linked album + persistence in isolated SQLite copy', async () => {
    const fixtureBase = await fixtureServer(health.storage);
    const writer = await browser.newPage({ viewport: { width: 390, height: 844 } });
    writer.setDefaultTimeout(30000);
    writer.setDefaultNavigationTimeout(15000);
    writer.on('pageerror', e => console.log(`fixture page error: ${e.message}`));
    writer.on('requestfailed', r => console.log(`fixture request failed: ${r.url()}`));
    console.log('fixture: browser created');
    await writer.bringToFront();
    try {
    await writer.goto(`${fixtureBase}/hipkop`);
    await ready(writer);
    console.log('fixture: home loaded');
    await nav(writer, 'community');
    await writer.getByRole('button', { name: '发布内容', exact: false }).click();
    const title = `HIPKOP 浏览器验收 ${Date.now()}`;
    await writer.locator('#postTitle').fill(title);
    await writer.locator('#postBody').fill('独立 SQLite 副本中的真实发布，验证话题与音乐附件。');
    await writer.locator('#postAuthor').fill('界面验收');
    await writer.selectOption('#postTopic', 'review');
    const albumId = await writer.locator('#postAlbum option').nth(1).getAttribute('value');
    await writer.selectOption('#postAlbum', albumId);
    const posted = writer.waitForResponse(r => r.url().endsWith('/api/community/posts') && r.request().method() === 'POST');
    await writer.getByRole('button', { name: '发布', exact: true }).click();
    const response = await posted;
    console.log('fixture: post saved');
    assert(response.ok());
    await shot(writer, 'publish-saved');
    await ready(writer);
    console.log('fixture: published page ready');
    // Read durable rows via the real API. Chromium can discard the POST body
    // after a UI repaint; persisted data, not DevTools response retention,
    // is the product contract under test.
    const written = await (await fetch(`${fixtureBase}/api/community/posts?topic=review`)).json();
    const result = written.items.find(item => item.title === title);
    assert(result, 'published row missing from the actual SQLite-backed API');
    console.log('fixture: durable row read');
    assert.equal(await writer.locator(`#communityFeed [data-post-id="${result.id}"] .post-music`).count(), 1);
    await writer.reload();
    console.log('fixture: reloaded');
    await ready(writer);
    await nav(writer, 'community');
    assert(await writer.getByRole('button', { name: title, exact: true }).isVisible());
    const persisted = await writer.evaluate(async id => (await (await fetch('/api/community/posts?topic=review')).json()).items.find(item => item.id === id), result.id);
    assert.equal(persisted.albumId, albumId);
    assert.equal(persisted.author, '界面验收');
    const production = await (await fetch(`${base}/api/health`)).json();
    assert.equal(production.stats.posts, health.stats.posts, 'acceptance must not add test posts to user catalog');
    return { postId: result.id, albumId, isolatedDatabase: true, productionPostsUnchanged: true };
    } finally { await writer.close(); await page.bringToFront(); }
  });
  await check('four pages fit mobile, tablet and desktop with safe last actions', async () => {
    const metrics = [];
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
      for (const key of ['home', 'charts', 'discover', 'community']) {
        await nav(page, key);
        const measure = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          width: document.querySelector('.app').getBoundingClientRect().width,
          navWidth: document.querySelector('.tabbar').getBoundingClientRect().width,
          playerWidth: document.querySelector('#miniPlayer').getBoundingClientRect().width,
          nav: document.querySelector('.tabbar').getBoundingClientRect().top,
          player: document.querySelector('#miniPlayer').getBoundingClientRect().bottom,
          buttons: [...document.querySelectorAll('.tabbar button')].map(button => button.getBoundingClientRect().width)
        }));
        assert.equal(measure.overflow, false, `${key}/${width} overflow`);
        assert(measure.buttons.every(size => size >= 44));
        assert(measure.player <= measure.nav + 1, `${key}/${width} player overlaps navigation`);
        if (width >= 1000) {
          // Desktop shares a 32px outer gutter and a 1200px exhibition limit.
          // At 1024px the correct width is 960px, not a fixed 1000px minimum.
          const expected = Math.min(width - 64, 1200);
          for (const [label, actual] of [
            ['app', measure.width], ['navigation', measure.navWidth], ['player', measure.playerWidth]
          ]) assert(Math.abs(actual - expected) < 1, `${key}/${width} ${label}: expected ${expected}, got ${actual}`);
        }
        await shot(page, `${key}-${width}-top`);
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await page.waitForTimeout(1000);
        const last = await page.evaluate(() => {
          const actions = [...document.querySelectorAll('#view .rank-row-actions,#view .card,#view .wall-post')];
          return actions.at(-1)?.getBoundingClientRect().bottom || 0;
        });
        const playerTop = await page.locator('#miniPlayer').evaluate(el => el.getBoundingClientRect().top);
        assert(last <= playerTop + 2, `${key}/${width} last content hidden by persistent player`);
        metrics.push({ key, viewportWidth: width, ...measure, appWidth: measure.width, lastBottom: last, playerTop });
      }
    }
    return metrics;
  });
  await check('playing sculpture + desktop scroll meets frame budget', async () => {
    await page.bringToFront();
    await nav(page, 'home');
    await page.evaluate(() => window.HipkopPlayer.pause());
    await page.locator('#stagePlay').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing', null, { timeout: 45000 });
    const frames = await page.evaluate(async () => {
      const times = []; let prev;
      await new Promise(resolve => {
        const start = performance.now();
        function frame(now) {
          if (prev) times.push(now - prev);
          prev = now; scrollBy(0, 3);
          if (now - start < 1800) requestAnimationFrame(frame); else resolve(null);
        }
        requestAnimationFrame(frame);
      });
      times.sort((a, b) => a - b);
      return { samples: times.length, p95Ms: times[Math.floor(times.length * .95)], maxMs: times.at(-1), over50: times.filter(t => t > 50).length };
    });
    report.performance.push(frames);
    await page.locator('[data-player-toggle]').click();
    assert(frames.samples > 35 && frames.p95Ms < 50);
    assert(frames.over50 / frames.samples < .08);
    return frames;
  });
  await check('reduced motion retains playback without rotation or scroll triggers', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await nav(page, 'home');
    await page.evaluate(() => window.HipkopPlayer.pause());
    await page.locator('#stagePlay').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing', null, { timeout: 45000 });
    const before = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), before);
    assert.equal(await page.evaluate(() => window.ScrollTrigger.getAll().length), 0);
    await page.locator('[data-player-toggle]').click();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  await check('invalid provider media is prevented rather than hidden with a fake 200', async () => {
    const faulty = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const requests = [], errors = [];
    faulty.on('request', r => { if (/\/undefined(?:[/?]|$)/.test(r.url())) requests.push(r.url()); });
    faulty.on('pageerror', e => errors.push(e.message));
    await faulty.goto(`${base}/hipkop`);
    await ready(faulty);
    const artistId = await faulty.evaluate(() => state.hero[0].artistId);
    await faulty.route(`**/api/artists/${artistId}`, async route => {
      const response = await route.fetch();
      const real = await response.json();
      real.artist.heroUrl = 'undefined'; real.artist.avatarUrl = null;
      await route.fulfill({ response, json: real });
    });
    await faulty.evaluate(id => artistDetail(id), artistId);
    await ready(faulty);
    assert(await faulty.locator('.artist-page h1').isVisible());
    const background = await faulty.locator('.artist-hero').evaluate(el => getComputedStyle(el).backgroundImage);
    assert(background.includes('hipkop-logo.svg'));
    assert.deepEqual(requests, []); assert.deepEqual(errors, []);
    await faulty.close();
    return { method: 'fault injection: missing URL fields in actual artist payload', undefinedRequests: 0 };
  });
  await check('no WebGL or GSAP dependency required to read and operate four pages', async () => {
    const fallback = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await fallback.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return /webgl/i.test(type) ? null : original.call(this, type, ...args);
      };
    });
    await fallback.route('**/vendor/*.js', route => route.abort());
    const errors = []; fallback.on('pageerror', e => errors.push(e.message));
    await fallback.goto(`${base}/hipkop`); await ready(fallback);
    for (const key of ['home', 'charts', 'discover', 'community']) {
      await nav(fallback, key); assert(await fallback.locator('h1').isVisible());
    }
    await nav(fallback, 'discover');
    await fallback.locator('#discoverInput').fill('法老');
    await fallback.locator('#discoverInput').press('Enter');
    await idle(fallback, '#discoverResults');
    assert(await fallback.locator('.artist-result').count() > 0);
    assert.deepEqual(errors, []);
    await fallback.close();
  });
  await check('normal app has no console/page/HTTP errors or /undefined requests', async () => {
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.consoleErrors, []);
    assert.deepEqual(report.httpErrors, []);
    assert.deepEqual(report.undefinedRequests, []);
    return { extensionFreeChromium: true, undefinedInitiators: report.undefinedRequests, errors: 0 };
  });
}
main().catch(e => { report.fatal = e.stack; }).finally(async () => {
  await browser?.close();
  fixtureHttp?.closeAllConnections();
  if (fixtureHttp) await new Promise(resolve => fixtureHttp.close(resolve));
  report.finished = new Date().toISOString();
  report.fixtureDirectory = fixtureDirectory; // local-only evidence, not a deployed dataset
  report.pass = !report.fatal && report.checks.length > 0 && report.checks.every(check => check.pass);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Culture acceptance: ${report.checks.filter(check => check.pass).length}/${report.checks.length}. Report: ${path.join(output, 'report.json')}`);
  process.exitCode = report.pass ? 0 : 1;
});
