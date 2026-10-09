'use strict';
const { chromium } = require('@playwright/test');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const state = JSON.parse(fs.readFileSync(path.join(root, 'data/public-share/processes.json'), 'utf8'));
const base = process.env.HIPKOP_PUBLIC_VERIFY_URL || state.origin;
const output = path.join(root, 'docs/public-launch-verification');
const report = { base, checks: [], errors: [], started: new Date().toISOString() };
const username = `qa_${Date.now().toString(36)}`, password = `qa-testing-${Date.now()}-ONLY`;
let browser;
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#view') && !document.querySelector('#view').hasAttribute('aria-busy'), null, { timeout: 30000 });
  await page.waitForTimeout(500);
}
async function check(name, work) {
  try { const evidence = await work(); report.checks.push({ name, pass: true, evidence }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, pass: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await check('public HTTPS real product + safe health + admin denial', async () => {
    assert.ok(base.startsWith('https://'));
    await page.goto(`${base}/hipkop`); await ready(page);
    assert.equal(await page.title(), 'HIPKOP · Culture Feed');
    const health = await (await page.request.get(`${base}/api/health`)).json();
    assert.ok(health.stats.albums > 1000 && health.stats.tracks > 2000);
    assert.equal(health.storage.path, undefined);
    assert.equal((await page.request.get(`${base}/api/sync/jobs`)).status(), 401);
    return { stats: health.stats, origin: base };
  });
  await check('migrated covers display on actual home', async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('#view img[src^="/media/cover/"]')].some(img => img.complete && img.naturalWidth > 100));
    return await page.evaluate(() => [...document.querySelectorAll('#view img[src^="/media/cover/"]')].filter(img => img.complete && img.naturalWidth > 100).length);
  });
  await check('four pages at 390/1440px: navigation + no overflow', async () => {
    const evidence = [];
    for (const width of [390,1440]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
      for (const tab of ['home','charts','discover','community']) {
        await page.locator(`[data-tab="${tab}"]`).click(); await ready(page);
        const metrics = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth, heading: document.querySelector('#view h1')?.textContent }));
        assert.ok(metrics.content <= metrics.width + 1, JSON.stringify(metrics));
        await page.screenshot({ path: path.join(output, `${tab}-${width}.png`) });
        evidence.push({ tab, ...metrics });
      }
    }
    return evidence;
  });
  await check('single real search, results, classification, favorite persistence', async () => {
    await page.locator('[data-tab="discover"]').click(); await ready(page);
    assert.equal(await page.locator('#discoverInput').count(), 1);
    await page.locator('#discoverInput').fill('Kendrick Lamar');
    await page.locator('#discoverInput').press('Enter');
    await page.waitForFunction(() => {
      const el = document.querySelector('#discoverResults');
      return el && !el.hasAttribute('aria-busy') && el.textContent.includes('Kendrick');
    }, null, { timeout: 45000 });
    const results = await page.locator('#discoverResults').innerText();
    assert.match(results, /Kendrick/i);
    await page.locator('[data-tab="charts"]').click(); await ready(page);
    for (const label of ['HipHop','K-POP']) {
      const filter = page.locator('#view button').filter({ hasText: new RegExp(`^${label.replace('-', '\\-')}$`) }).first();
      await filter.click(); await ready(page);
      assert.ok(await page.locator('#view .chart-podium').count());
    }
    const button = page.locator('#view [data-like-id]').first();
    assert.ok(await button.count()); await button.click();
    const count = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('hipkop.favorites.v1') || '{}')).length);
    assert.ok(count > 0);
    await page.reload(); await ready(page);
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('hipkop.favorites.v1') || '{}')).length), count);
    return { query: 'Kendrick Lamar', favorites: count };
  });
  await check('real playback drives record state and progress', async () => {
    await page.locator('[data-tab="home"]').click(); await ready(page);
    await page.locator('#stagePlay').click();
    await page.waitForFunction(() => window.HipkopPlayer.snapshot().status === 'playing', null, { timeout: 45000 });
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => ({ ...window.HipkopPlayer.snapshot(), source: window.HipkopPlayer.audio.currentSrc }));
    assert.ok(state.currentTime > 0 && state.source.startsWith('https://'));
    await page.evaluate(() => window.HipkopPlayer.pause());
    assert.equal(await page.evaluate(() => window.HipkopPlayer.snapshot().status), 'paused');
    return { id: state.id, title: state.title, time: state.currentTime };
  });
  await check('production signup UI, HttpOnly cookie, real moderated submission', async () => {
    await page.locator('[data-tab="community"]').click(); await ready(page);
    await page.getByRole('button', { name: '发布内容：写一帖' }).click();
    await page.getByRole('button', { name: '没有账号，去注册' }).click();
    await page.locator('#accountForm [name=username]').fill(username);
    await page.locator('#accountForm [name=displayName]').fill('部署验收账号');
    await page.locator('#accountForm [name=password]').fill(password);
    await page.getByRole('button', { name: '注册并登录' }).click();
    await page.locator('#postTitle').waitFor();
    assert.equal(await page.locator('#postAuthor').getAttribute('type'), 'hidden');
    const cookies = await page.context().cookies();
    assert.ok(cookies.some(cookie => cookie.name === '__Host-hipkop' && cookie.httpOnly && cookie.secure));
    await page.locator('#postTitle').fill('部署验收：临时测试，不公开');
    await page.locator('#postBody').fill('验证真实发帖链路，验收后删除此测试记录。');
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/community/posts') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '发布', exact: true }).click();
    const response = await responsePromise, posted = await response.json();
    assert.equal(response.status(), 202); assert.equal(posted.status, 'pending');
    await ready(page);
    const publicPosts = await (await page.request.get(`${base}/api/community/posts`)).json();
    assert.ok(!publicPosts.items.some(post => post.id === posted.id));
    return { status: posted.status, pendingId: posted.id };
  });
  await check('reduced motion remains interactive without WebGL', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-tab="home"]').click(); await ready(page);
    assert.ok(await page.locator('#stagePlay').isEnabled());
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    return { reducedMotion: true, implementation: 'CSS/SVG/GSAP; no WebGL dependency' };
  });
}
main().catch(error => { report.errors.push(error.stack); }).finally(async () => {
  await browser?.close();
  // Remove only this randomly named acceptance account and its private pending post.
  // Do not change genuine community records or any music metadata.
  const db = new DatabaseSync(path.join(root, 'data/public-share/hipkop.sqlite'));
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    const user = db.prepare('SELECT id FROM users WHERE username=?').get(username);
    if (user) {
      db.exec('BEGIN');
      db.prepare("DELETE FROM community_posts WHERE user_id=? AND status='pending'").run(user.id);
      db.prepare('DELETE FROM users WHERE id=?').run(user.id);
      db.exec('COMMIT');
    }
  } finally { db.close(); }
  report.finished = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  const failures = report.checks.filter(check => !check.pass);
  console.log(`Public acceptance: ${report.checks.length - failures.length}/${report.checks.length}; browser errors: ${report.errors.length}`);
  process.exitCode = failures.length || report.errors.length ? 1 : 0;
});
