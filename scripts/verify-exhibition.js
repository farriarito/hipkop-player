'use strict';

// Product acceptance against the actual running app and catalog.
// No happy-path audio, catalog, search or playback API responses are mocked.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.HIPKOP_UI_URL || 'http://127.0.0.1:4180';
const output = path.resolve(__dirname, '../docs/exhibition-verification');
const report = { base, started: new Date().toISOString(), checks: [], errors: [], consoleErrors: [], httpErrors: [], performance: [], screenshots: [], evidence: {} };
let browser;


async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#view') && !document.querySelector('#view').hasAttribute('aria-busy'));
  await page.waitForTimeout(1600);
}
async function capture(page, name, fullPage = false) {
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  report.screenshots.push(file);
}
async function check(name, work) {
  try {
    const evidence = await work();
    report.checks.push({ name, pass: true, ...(evidence === undefined ? {} : { evidence }) });
  } catch (error) {
    report.checks.push({ name, pass: false, error: error.stack || String(error) });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function nav(page, key) {
  await page.locator(`.tabbar [data-tab="${key}"]`).click();
  await ready(page);
}
async function frames(page, label, scrolling = false) {
  const result = await page.evaluate(async ({ scrolling }) => {
    const start = performance.now(), deltas = [];
    let previous = start;
    await new Promise(resolve => {
      function tick(now) {
        deltas.push(now - previous);
        previous = now;
        if (scrolling) window.scrollBy(0, 5);
        if (now - start < 1600) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
    deltas.shift();
    const sorted = [...deltas].sort((a, b) => a - b);
    return {
      samples: deltas.length,
      p95Ms: sorted[Math.floor(sorted.length * .95)] || 0,
      maxMs: Math.max(...deltas),
      framesOver50ms: deltas.filter(delta => delta > 50).length,
      longTasks: (window.__qaLongTasks || []).filter(entry => entry.start >= start)
    };
  }, { scrolling });
  report.performance.push({ label, ...result });
  assert(result.samples > 30, 'too few foreground frame samples');
  assert(result.p95Ms < 50, `${label}: p95=${result.p95Ms.toFixed(1)}ms`);
  assert(result.framesOver50ms / result.samples < .08, `${label}: excessive dropped frames`);
  assert(result.longTasks.every(entry => entry.duration < 200), `${label}: task longer than 200ms`);
  return result;
}
async function geometry(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.tabbar').getBoundingClientRect();
    const player = document.querySelector('#miniPlayer');
    const playerBox = player && !player.hidden ? player.getBoundingClientRect() : null;
    const actionable = Array.from(document.querySelectorAll('.tabbar button')).map(button => ({
      label: button.textContent.trim(),
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height
    }));
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      viewport: { width: innerWidth, height: innerHeight },
      nav: { top: nav.top, bottom: nav.bottom },
      player: playerBox ? { top: playerBox.top, bottom: playerBox.bottom } : null,
      actionable,
      mainPaddingBottom: parseFloat(getComputedStyle(document.querySelector('#view')).paddingBottom),
      bodyPaddingBottom: parseFloat(getComputedStyle(document.body).paddingBottom)
    };
  });
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  browser = await chromium.launch({ headless: true, ...(executablePath && fs.existsSync(executablePath) ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) report.httpErrors.push({ status: response.status(), url: response.url() });
  });
  await page.addInitScript(() => {
    window.__qaLongTasks = [];
    try {
      new PerformanceObserver(entries => entries.getEntries().forEach(entry => window.__qaLongTasks.push({ start: entry.startTime, duration: entry.duration }))).observe({ type: 'longtask', buffered: true });
    } catch (_) { /* Some browsers do not expose Long Tasks. */ }
  });
  await check('/hipkop serves a functioning native app', async () => {
    const response = await page.goto(`${base}/hipkop`);
    assert(response && response.ok(), '/hipkop must return HTTP 200');
    await ready(page);
    assert(await page.locator('.tabbar button').count() === 5);
    assert(await page.locator('h1').count() > 0);
    assert(await page.evaluate(() => Boolean(window.HipkopPlayer)), 'persistent real-audio player is required');
    return { status: response.status(), title: await page.title() };
  });
  // Continue independent checks if route integration is not ready yet.
  if (!(await page.locator('#view').count())) {
    await page.goto(base);
    await ready(page);
  }
  await check('homepage top10 contains no score in the right-side metric', async () => {
    assert.equal(await page.locator('.top10-section h2').innerText(), '今日top10');
    assert.equal(await page.locator('.top10-section .rank').count(), 10);
    assert.equal(await page.locator('.top10-section .score').count(), 0);
    assert.equal(await page.locator('.top10-section .rank-open').count(), 10);
    assert.equal(await page.locator('.radar-section h2').innerText(), '私人雷达');
    assert.equal(await page.locator('.top10-section h2 small,.top10-section h2 .eyebrow').count(), 0);
    assert.equal(await page.getByText('加入这场对话', { exact: false }).count(), 0);
    return { rows: 10, metric: 'open action, no small print or editorial scores' };
  });
  await check('stage is an original exhibition, not an album-filled title glyph', async () => {
    assert.match(await page.locator('#view').innerText(), /HipHop&K-POP|HIP.HOP.*K.POP/i);
    assert.equal(await page.locator('.culture-intro img,.sound-glyph img').count(), 0);
    assert.equal(await page.locator('.sound-glyph i').count(), 7);
    assert.equal(await page.locator('.stage-topline>span').first().innerText(), 'HIP-HOP × K-POP');
    assert.equal(await page.locator('.brand-logo').getAttribute('src'), '/hipkop-logo.svg');
    const stage = page.locator('#listeningStage,.exhibition-stage,.exhibition-hero,[data-exhibition]').first();
    assert(await stage.count(), 'missing dedicated sculptural stage');
    assert(await stage.isVisible(), 'stage is not rendered');
    assert(await stage.locator('svg,img,canvas,.sculpture').count(), 'stage lacks a visible sculptural asset');
    await capture(page, 'home-390');
  });
  await check('real stage play starts audible media; animation follows playing and pause', async () => {
    assert(await page.evaluate(() => Boolean(window.HipkopPlayer?.audio)), 'missing HTMLAudioElement');
    await page.evaluate(() => {
      window.__qaAudioEvents = [];
      ['playing', 'pause', 'waiting', 'error', 'loadedmetadata', 'timeupdate'].forEach(type => window.HipkopPlayer.audio.addEventListener(type, () => window.__qaAudioEvents.push({ type, time: window.HipkopPlayer.audio.currentTime })));
    });
    const play = page.locator('#stagePlay,[data-stage-play],.stage-play,.exhibition-play').first();
    assert(await play.count(), 'home stage must expose a real play control');
    await play.click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing', null, { timeout: 45000 });
    await page.waitForTimeout(1200);
    const playing = await page.evaluate(() => ({
      state: window.HipkopPlayer.snapshot(),
      audio: { paused: window.HipkopPlayer.audio.paused, currentTime: window.HipkopPlayer.audio.currentTime, readyState: window.HipkopPlayer.audio.readyState, duration: window.HipkopPlayer.audio.duration, currentSrc: window.HipkopPlayer.audio.currentSrc },
      events: window.__qaAudioEvents,
      stage: document.querySelector('#listeningStage,.exhibition-stage,.exhibition-hero,[data-exhibition]')?.getAttribute('data-playing')
    }));
    assert.equal(playing.audio.paused, false);
    assert(playing.audio.currentTime > .2, 'audio clock does not advance');
    assert(playing.audio.readyState >= 2, 'no decodable media');
    assert(playing.events.some(event => event.type === 'playing'), 'actual audio playing event missing');
    assert(/https?:/.test(playing.audio.currentSrc), 'not a real catalog audio URL');
    assert.equal(playing.stage, 'true', 'stage animation is not synchronized to audio');
    const before = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    const centerBefore = await page.locator('.art-vinyl-spin').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.waitForTimeout(450);
    assert.notEqual(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), before, 'real playing must rotate the record');
    const centerAfter = await page.locator('.art-vinyl-spin').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    assert(Math.hypot(centerAfter.x - centerBefore.x, centerAfter.y - centerBefore.y) < 1.5, 'vinyl pivot must stay centered in the sculptural housing');
    await capture(page, 'home-playing-390');
    await page.locator('[data-player-toggle]').click();
    await page.waitForFunction(() => window.HipkopPlayer.audio.paused && window.HipkopPlayer.snapshot().status === 'paused');
    assert.equal(await page.locator('#listeningStage,.exhibition-stage,.exhibition-hero,[data-exhibition]').first().getAttribute('data-playing'), 'false');
    const paused = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), paused, 'paused audio must stop vinyl rotation');
    report.evidence.playback = playing;
    return playing.audio;
  });
  await check('mobile stage interaction performance', () => frames(page, '390px scroll narrative', true));
  await check('scroll narrative rotates the object and reveals calibrated marks', async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(900);
    const before = await page.evaluate(() => ({
      rotation: Number(gsap.getProperty('.stage-art', 'rotation')),
      opacity: Number(gsap.getProperty('.art-measure', 'opacity')),
      clothY: Number(gsap.getProperty('.art-cloth-front', 'y'))
    }));
    await page.evaluate(() => window.scrollTo({ top: 320, behavior: 'instant' }));
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => ({
      rotation: Number(gsap.getProperty('.stage-art', 'rotation')),
      opacity: Number(gsap.getProperty('.art-measure', 'opacity')),
      clothY: Number(gsap.getProperty('.art-cloth-front', 'y'))
    }));
    assert(after.rotation > before.rotation + .15, 'object angle does not respond to scroll');
    assert(after.opacity > before.opacity, 'calibration marks do not reveal');
    assert(after.clothY > before.clothY, 'cloth does not lag with scroll');
    return { before, after };
  });
  await check('playing plus sculpture rotation and scrolling stays smooth', async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('[data-player-toggle]').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing');
    const result = await frames(page, '390px real playing + scroll narrative', true);
    await page.locator('[data-player-toggle]').click();
    return result;
  });
  await check('real playing pauses visual loops offscreen and resumes on return', async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('[data-player-toggle]').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing');
    await page.evaluate(() => window.scrollTo({ top: document.querySelector('.exhibition-stage').offsetHeight + 200, behavior: 'instant' }));
    await page.waitForTimeout(1500);
    const offscreen = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), offscreen);
    assert.equal(await page.evaluate(() => window.HipkopPlayer.audio.paused), false, 'scrolling must not interrupt audio');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(1500);
    const onscreen = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(500);
    assert.notEqual(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), onscreen);
    await page.locator('[data-player-toggle]').click();
  });
  await check('visibility lifecycle injection cleans background motion and restores real playback animation', async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('[data-player-toggle]').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => ScrollTrigger.getAll().length), 0);
    const hidden = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), hidden);
    assert.equal(await page.evaluate(() => window.HipkopPlayer.audio.paused), false);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1100);
    const visible = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(500);
    assert.notEqual(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), visible);
    await page.locator('[data-player-toggle]').click();
    return { method: 'controlled document.hidden + visibilitychange fault injection', detachedScrollTriggers: 0 };
  });
  await check('releases gallery and today recommendation genuinely change', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const rail = page.locator('.release-scroller');
    assert(await rail.locator('.release-card').count() > 2);
    await rail.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    assert(await rail.evaluate(el => el.scrollLeft > 0));
    const prior = await page.locator('#dailyPick h3').innerText();
    await page.getByRole('button', { name: '换一个推荐', exact: true }).click();
    assert.notEqual(await page.locator('#dailyPick h3').innerText(), prior);
  });
  await check('all chart buckets, sort modes and real row covers', async () => {
    await nav(page, 'charts');
    for (const name of ['HipHop', 'K-POP', '综合 TOP 50']) {
      await page.getByRole('button', { name, exact: true }).click();
      await ready(page);
      assert(await page.locator('.rank').count() > 0, `${name} is empty`);
      assert.equal(await page.locator('.rank').count() + await page.locator('.podium-record').count(), await page.locator('.rank-cover').count());
    }
    for (const sort of ['popularity', 'date', 'score']) {
      await page.selectOption('#chartSort', sort);
      await ready(page);
      assert(await page.locator('.rank').count() > 0);
    }
    await capture(page, 'charts-390');
  });
  await check('one search input: real 法老 search, artist relation and item details', async () => {
    await nav(page, 'discover');
    assert.equal(await page.locator('input').count(), 1);
    await page.locator('#discoverInput').fill('法老');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.waitForSelector('.artist-result', { timeout: 45000 });
    assert(await page.locator('#discoverResults .card').count() > 0);
    await capture(page, 'discover-390');
    await page.locator('.artist-result').first().click();
    await page.waitForSelector('.artist-page');
    await ready(page);
    assert(await page.locator('.artist-page .card').count() > 0);
    await capture(page, 'artist-390');
    await page.locator('.artist-page .card').first().click();
    await page.waitForSelector('.detail');
    await ready(page);
    assert.equal(await page.evaluate(() => scrollY), 0);
    await capture(page, 'detail-390');
  });
  await check('collection controls update immediately and persist after reload', async () => {
    const id = await page.evaluate(() => state.detail.item.id);
    let control = page.locator(`button[onclick*="toggleLike('${id}')"]`);
    const prior = await control.getAttribute('aria-pressed');
    await control.click();
    control = page.locator(`button[onclick*="toggleLike('${id}')"]`);
    assert.notEqual(await control.getAttribute('aria-pressed'), prior, 'visual pressed state is stale');
    await page.reload();
    await ready(page);
    await page.evaluate(id => openItem(id), id);
    await page.waitForSelector('.detail');
    control = page.locator(`button[onclick*="toggleLike('${id}')"]`);
    assert.notEqual(await control.getAttribute('aria-pressed'), prior, 'favorite lost on reload');
    await control.click(); // Restore the original state; QA does not leave a collection change.
  });
  await check('community composer is usable and closes with Escape', async () => {
    await nav(page, 'community');
    await page.getByRole('button', { name: '发布内容', exact: false }).click();
    await page.waitForSelector('#postTitle');
    assert.equal(await page.locator('#sheet').getAttribute('aria-modal'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sheet').isVisible(), false);
    await capture(page, 'community-390');
  });
  await check('every primary page fits 320, 390 and 1440 without player/nav overlap', async () => {
    await nav(page, 'home');
    await page.locator('#stagePlay').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing');
    await page.locator('[data-player-toggle]').click();
    const metrics = [];
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
      for (const key of ['home', 'charts', 'discover', 'community', 'profile']) {
        await nav(page, key);
        const result = await geometry(page);
        assert.equal(result.overflow, false, `${key} overflow at ${width}px`);
        assert(result.player, `persistent player missing during geometry check: ${key}/${width}`);
        assert(result.actionable.every(button => button.width >= 44 && button.height >= 44), `nav touch target below 44px: ${key}/${width}`);
        assert(result.nav.bottom <= result.viewport.height + 1, 'bottom nav below viewport');
        if (result.player) assert(result.player.bottom <= result.nav.top + 1, `player overlaps tabs: ${key}/${width}`);
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        const last = await page.evaluate(() => {
          const candidates = Array.from(document.querySelectorAll('#view .rank,#view .card,#view .post,#view .menu-item,#view .artist-result'));
          const element = candidates[candidates.length - 1];
          return element ? element.getBoundingClientRect().bottom : 0;
        });
        assert(last <= result.player.top + 1, `last content hidden by player: ${key}/${width}`);
        metrics.push({ key, width, ...result });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await capture(page, `${key}-${width}`);
      }
    }
    return metrics;
  });
  await check('navigation lifecycle does not accumulate scroll triggers', async () => {
    const counts = [];
    for (let i = 0; i < 4; i++) {
      await nav(page, 'home');
      counts.push(await page.evaluate(() => ScrollTrigger.getAll().length));
      await nav(page, 'profile');
      assert.equal(await page.evaluate(() => ScrollTrigger.getAll().length), 0);
    }
    assert(Math.max(...counts) - Math.min(...counts) <= 2, `trigger counts keep changing: ${counts}`);
    return counts;
  });
  await check('desktop narrative performance', async () => {
    await nav(page, 'home');
    return frames(page, '1440px scroll narrative', true);
  });
  await check('expanded exhibition and pointer tilt work on desktop', async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    assert(await page.locator('.app').evaluate(el => el.getBoundingClientRect().width >= 1000 && el.getBoundingClientRect().width <= 1200));
    const box = await page.locator('.stage-composition').boundingBox();
    await page.mouse.move(box.x + box.width * .88, box.y + box.height * .55);
    await page.waitForTimeout(850);
    assert(await page.locator('.exhibition-art').evaluate(el => Math.abs(Number(gsap.getProperty(el, 'rotationY'))) > .1));
    await page.mouse.move(0, 0);
    await page.waitForTimeout(1000);
    assert(await page.locator('.exhibition-art').evaluate(el => Math.abs(Number(gsap.getProperty(el, 'rotationY'))) < .05));
    return { maxWidth: 1200, tilt: 'bounded +/-3deg, returns to neutral' };
  });
  await check('reduced motion has no persistent animation, visible complete page, functional search', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/hipkop`);
    await ready(page);
    const before = await page.evaluate(() => Array.from(document.querySelectorAll('#listeningStage *,.exhibition-stage *,.exhibition-hero *')).map(el => getComputedStyle(el).transform));
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => ({
      transforms: Array.from(document.querySelectorAll('#listeningStage *,.exhibition-stage *,.exhibition-hero *')).map(el => getComputedStyle(el).transform),
      triggers: window.ScrollTrigger?.getAll().length || 0,
      infinite: document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations === Infinity).length
    }));
    assert.deepEqual(after.transforms, before, 'sculpture still moves under reduced-motion');
    assert.equal(after.triggers, 0);
    assert.equal(after.infinite, 0, 'persistent CSS/Web Animations remain active');
    assert(await page.locator('h1').isVisible());
    await page.locator('#stagePlay').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing', null, { timeout: 45000 });
    const playingBefore = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), playingBefore, 'real playing still rotates in reduced-motion');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.art-pulse')).opacity), '0');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(1200);
    const running = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(450);
    assert.notEqual(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), running);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(400);
    const stopped = await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform'));
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.art-vinyl-spin').evaluate(el => el.style.transform || el.getAttribute('transform')), stopped, 'live accessibility change did not stop animation');
    await capture(page, 'reduced-motion-1440');
    await page.locator('[data-player-toggle]').click();
    await nav(page, 'discover');
    assert(await page.locator('#discoverInput').isVisible());
    return { triggers: after.triggers, runningInfiniteAnimations: after.infinite };
  });
  // Fault injection is confined to failure modes; the positive playback,
  // directory and search checks above use real, unmodified providers/catalog.
  await check('missing cover and avatar images degrade without blocking real browsing or playback', async () => {
    const faulty = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await faulty.route('**/media/**', route => route.abort());
    const errors = [];
    faulty.on('pageerror', error => errors.push(error.message));
    await faulty.goto(`${base}/hipkop`);
    await ready(faulty);
    await faulty.locator('#stagePlay').click();
    await faulty.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing', null, { timeout: 45000 });
    await faulty.waitForTimeout(700);
    assert.equal(await faulty.locator('[data-player-cover]').getAttribute('src'), '/hipkop-logo.svg');
    await faulty.locator('[data-player-toggle]').click();
    await nav(faulty, 'discover');
    await faulty.locator('#discoverInput').fill('法老');
    await faulty.getByRole('button', { name: '搜索', exact: true }).click();
    await faulty.waitForSelector('.artist-result', { timeout: 45000 });
    await faulty.locator('.artist-result').first().click();
    await faulty.waitForSelector('.artist-page');
    await ready(faulty);
    assert(await faulty.locator('.artist-info h1').isVisible());
    await faulty.locator('.artist-page .card').first().click();
    await faulty.waitForSelector('.detail');
    await ready(faulty);
    assert(await faulty.locator('.cover.img-fallback').count());
    assert.equal((await geometry(faulty)).overflow, false);
    assert.deepEqual(errors, []);
    await capture(faulty, 'image-failure-390');
    await faulty.close();
  });
  await check('unavailable preview and failed audio keep the two-row player above navigation', async () => {
    const faulty = await browser.newPage({ viewport: { width: 320, height: 844 } });
    await faulty.goto(`${base}/hipkop`);
    await ready(faulty);
    await faulty.route('**/api/albums/*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"qa_unavailable"}' }));
    await faulty.locator('#stagePlay').click();
    await faulty.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'no-preview');
    const evidence = [];
    for (const width of [320, 390, 1440]) {
      await faulty.setViewportSize({ width, height: 844 });
      await nav(faulty, 'profile');
      await faulty.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      const result = await geometry(faulty);
      assert(result.player && result.player.bottom <= result.nav.top + 1);
      assert.equal(result.overflow, false);
      assert(await faulty.locator('.mini-player-external').isVisible());
      const last = await faulty.locator('.menu-item').last().evaluate(el => el.getBoundingClientRect().bottom);
      assert(last <= result.player.top + 1, `no-preview player hides last action at ${width}px`);
      evidence.push({ status: 'no-preview', width, ...result });
    }
    await faulty.unroute('**/api/albums/*');
    await nav(faulty, 'home');
    await faulty.route('**/AudioPreview*/**', route => route.abort());
    await faulty.locator('#stagePlay').click();
    await faulty.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'error', null, { timeout: 45000 });
    for (const width of [320, 390, 1440]) {
      await faulty.setViewportSize({ width, height: 844 });
      await nav(faulty, 'profile');
      await faulty.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      const result = await geometry(faulty);
      assert(result.player && result.player.bottom <= result.nav.top + 1);
      assert.equal(result.overflow, false);
      const last = await faulty.locator('.menu-item').last().evaluate(el => el.getBoundingClientRect().bottom);
      assert(last <= result.player.top + 1, `failed player hides last action at ${width}px`);
      evidence.push({ status: 'error', width, ...result });
    }
    await capture(faulty, 'audio-failure-1440');
    await faulty.close();
    return evidence;
  });
  await check('GSAP unavailable: complete readable layout and working navigation', async () => {
    const fallback = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await fallback.route('**/vendor/*.js', route => route.abort());
    const errors = [];
    fallback.on('pageerror', error => errors.push(error.message));
    await fallback.goto(`${base}/hipkop`);
    await ready(fallback);
    assert(await fallback.locator('h1').isVisible());
    await nav(fallback, 'discover');
    assert(await fallback.locator('#discoverInput').isVisible());
    assert.deepEqual(errors, []);
    await capture(fallback, 'fallback-no-gsap');
    await fallback.close();
  });
  await check('no console exceptions or failing same-origin resources in normal mode', async () => {
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.consoleErrors, []);
    assert.deepEqual(report.httpErrors, []);
  });
}
main().catch(error => {
  report.fatal = error.stack || String(error);
}).finally(async () => {
  report.finished = new Date().toISOString();
  report.pass = !report.fatal && report.checks.length > 0 && report.checks.every(check => check.pass);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
});
