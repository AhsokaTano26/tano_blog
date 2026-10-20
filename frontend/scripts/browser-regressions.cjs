'use strict';
require('./browser-process-scope.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, webkit, expect } = require('@playwright/test');
const { SITE, OUT, startServices, stopServices } = require('./browser-environment.cjs');

const checks = [];
const gates = [];
let browser, page;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const editorFor = target => target.getByPlaceholder('输入 Markdown 内容，可直接粘贴截图或拖入多张图片自动上传...');
const frames = target => target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
function pass(engine, name) { checks.push({ engine, name, passed: true }); process.stdout.write(`PASS ${engine}: ${name}\n`); }
function verifyProcessGroup(engine) {
  const rows = execFileSync('ps', ['-axo', 'pid,ppid,pgid'], { encoding: 'utf8', timeout: 1500, maxBuffer: 2 * 1024 * 1024 })
    .trim().split('\n').slice(1).map(line => line.trim().split(/\s+/).map(Number));
  const descendants = new Set([process.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parent] of rows) if (descendants.has(parent) && !descendants.has(pid)) { descendants.add(pid); changed = true; }
  }
  assert(rows.every(([pid, , group]) => !descendants.has(pid) || group === process.pid), 'A browser/server descendant escaped the watchdog process group');
  pass(engine, 'live browser and server descendants belong to the watchdog process group');
}
async function request(context, method, route, data) {
  const csrf = (await context.cookies(SITE)).find(cookie => cookie.name === 'csrf_token')?.value || '';
  const response = await context.request.fetch(`${SITE}${route}`, { method, data, timeout: 10000, headers: { 'X-CSRF-Token': csrf } });
  assert(response.ok(), `${method} ${route.split('?')[0]} returned ${response.status()}`);
  return response.json();
}
async function noOverflow(target) {
  const extra = await target.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(extra < 4, `Page overflows horizontally by ${extra}px`);
}
async function isolateRequests(context) {
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === SITE) return route.continue();
    process.stderr.write('Blocked a request outside the isolated test site; verify the build environment.\n');
    return route.abort('blockedbyclient');
  });
}
async function screenshot(engine, name) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(OUT, `${engine}-${name}.png`), timeout: 5000 });
}

async function verifyEngine(engine, launcher, password) {
  browser = await launcher.launch({ headless: true });
  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await isolateRequests(admin);
  const pageErrors = [];
  admin.on('page', p => p.on('pageerror', error => { if (pageErrors.length < 10) pageErrors.push(error.message.slice(0, 300)); }));
  page = await admin.newPage();
  page.setDefaultTimeout(7000);
  await page.goto(`${SITE}/admin/login`);
  // SSR inputs can appear before their controlled React handlers are hydrated.
  await page.waitForLoadState('networkidle');
  await page.locator('input[autocomplete="username"]').fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(`${SITE}/admin`);
  const articlesLink = page.locator('a[href="/admin/posts"]:visible').first();
  // The URL changes before the layout finishes validating the session and
  // showing its welcome animation. Navigate through the ready UI like a user.
  await expect(articlesLink).toBeVisible({ timeout: 15000 });
  pass(engine, 'real UI login');
  verifyProcessGroup(engine);

  await articlesLink.click();
  await page.getByRole('button', { name: '新建', exact: true }).first().click();
  let editor = editorFor(page);
  const slug = `browser-${engine}`;
  await page.getByPlaceholder('请输入标题').fill(`Browser ${engine}`);
  await page.getByPlaceholder('url-slug').fill(slug);
  await editor.fill('Recoverable local draft');
  await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('post_autosave_') && JSON.parse(localStorage.getItem(key) || '{}').content === 'Recoverable local draft'));
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: '新建', exact: true }).first().click();
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await expect(editor).toHaveValue('Recoverable local draft');
  await expect(page.getByPlaceholder('url-slug')).toHaveValue(slug);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toBeHidden();
  const list = await request(admin, 'GET', '/api/v1/admin/posts');
  const post = list.items.find(item => item.slug === slug);
  assert(post?.id, 'UI save did not persist the restored article');
  pass(engine, 'debounced draft survives actual reload and saves');

  await page.locator('button[title="编辑"]').first().click();
  const second = await admin.newPage();
  await second.goto(`${SITE}/admin/posts`);
  await second.locator('button[title="编辑"]').first().click();
  await editor.fill('First window accepted content');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toBeHidden();
  await editorFor(second).fill('Second window preserved content');
  await second.getByRole('button', { name: '保存', exact: true }).click();
  await expect(second.getByText('First window accepted content', { exact: true })).toBeVisible();
  await expect(editorFor(second)).toHaveValue('Second window preserved content');
  await second.getByRole('button', { name: '确认保留本地并重试', exact: true }).click();
  await expect(editorFor(second)).toBeHidden();
  const saved = await request(admin, 'GET', `/api/v1/admin/posts/${post.id}`);
  assert(saved.post.content === 'Second window preserved content', 'Reviewed retry did not save the local content');
  await second.close();
  pass(engine, 'two real windows reject stale saves and retain reviewed edits');

  await page.locator('a[href="/admin"]:visible').first().click();
  await expect(page.getByRole('region', { name: '系统健康', exact: true })).toBeVisible();
  await expect(page.getByText('尚无成功的完整备份记录', { exact: false })).toBeVisible();
  await page.locator('a[href="/admin/posts"]:visible').first().click();
  await page.locator('button[title="编辑"]').first().click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreTestStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('post_autosave_')) throw new DOMException('Fixture quota exhausted', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await editor.fill('Quota failure must preserve this unsaved text');
  await expect(page.getByRole('alert').filter({ hasText: '本地草稿保存失败' })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByText('本地草稿保存失败，离开可能丢失当前修改。确定离开编辑器？', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).last().click();
  await expect(editor).toHaveValue('Quota failure must preserve this unsaved text');
  await expect(page).toHaveURL(`${SITE}/admin/posts`);
  await page.evaluate(() => history.back());
  await page.getByRole('button', { name: '确定', exact: true }).last().click();
  await expect(page).toHaveURL(`${SITE}/admin`);
  await page.evaluate(() => { window.restoreTestStorage(); delete window.restoreTestStorage; });
  pass(engine, 'failed draft storage protects SPA Back until explicit approval; health alerts render');

  await page.locator('a[href="/admin/posts"]:visible').first().click();
  await page.locator('button[title="编辑"]').first().click();
  editor = editorFor(page);
  await editor.fill('Clipboard upload below\n\n');
  const uploaded = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/admin/upload');
  await editor.evaluate(element => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32;
    canvas.getContext('2d').fillRect(0, 0, 64, 32);
    const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
    const data = new DataTransfer(); data.items.add(new File([bytes], 'browser-paste.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  const uploadResponse = await uploaded;
  assert(uploadResponse.ok(), 'Clipboard image upload failed');
  const media = (await uploadResponse.json()).media;
  assert(media.url && media.thumbnail_url, 'Upload did not generate gallery thumbnail');
  const preview = page.getByLabel('文章预览', { exact: true });
  await preview.locator('img').first().click();
  await page.getByRole('button', { name: '小', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(editor).toHaveValue(/width: 50%/);
  await expect.poll(() => preview.locator('img').first().evaluate(image => {
    const parentWidth = image.parentElement.getBoundingClientRect().width;
    return Math.abs(image.getBoundingClientRect().width / parentWidth - 0.5);
  })).toBeLessThan(0.02);
  pass(engine, 'clipboard image uploads, thumbnail exists, selected size changes source/render');

  let releaseImage;
  const held = new Promise(resolve => { releaseImage = resolve; }); gates.push(releaseImage);
  await page.route('**/uploads/browser-tall.svg*', async route => { await held; await route.continue(); });
  const paragraphs = Array.from({ length: 100 }, (_, i) => `Paragraph ${i}: source and preview must stay synchronized.`);
  await editor.fill(`${paragraphs.slice(0, 3).join('\n\n')}\n\n<img src="/uploads/browser-tall.svg" alt="Tall geometry"/>\n\n${paragraphs.slice(3).join('\n\n')}`);
  await expect(preview.locator('img[alt="Tall geometry"]')).toBeAttached();
  // fill() places the caret at the end, and scroll sync can move the preview
  // away from this lazy image. Bring it into view before releasing its request.
  await preview.locator('img[alt="Tall geometry"]').scrollIntoViewIfNeeded();
  await frames(page);
  const before = await preview.evaluate(element => element.scrollHeight);
  releaseImage();
  await expect.poll(() => preview.locator('img[alt="Tall geometry"]').evaluate(image => image.naturalHeight), { message: 'Delayed tall image must load in the visible preview' }).toBe(1800);
  await frames(page);
  assert(await preview.evaluate(element => element.scrollHeight) > before + 800, 'Delayed image did not change layout');
  await editor.hover();
  await page.mouse.wheel(0, 100000);
  await page.waitForFunction(() => { const p = document.querySelector('[aria-label="文章预览"]'); return p && Math.abs(p.scrollHeight - p.clientHeight - p.scrollTop) < 5; });
  await frames(page);
  await preview.hover();
  await page.mouse.wheel(0, -100000);
  await page.waitForFunction(() => document.querySelector('textarea[placeholder^="输入 Markdown"]')?.scrollTop < 5);
  await editor.fill('Aligned browser paragraph');
  await editor.selectText();
  await page.getByRole('button', { name: '居中', exact: true }).click();
  await expect(preview.locator('div[style*="text-align"]')).toHaveCSS('text-align', 'center');
  await noOverflow(page);
  await screenshot(engine, 'editor');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toBeHidden();
  pass(engine, 'alignment and bidirectional scroll account for delayed tall image');

  await request(admin, 'PATCH', `/api/v1/admin/posts/${post.id}/status`, { status: 'published' });
  await request(admin, 'PUT', '/api/v1/admin/config', { comment_enabled: 'false' });
  const protectedPost = await request(admin, 'POST', '/api/v1/admin/posts', { title: 'Protected browser article', slug: `protected-${engine}`, content: 'UNLOCKED-BROWSER-BODY', status: 'published', password: 'browser-secret' });
  assert(protectedPost.post.id, 'Protected fixture not created');
  const anonymous = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await isolateRequests(anonymous);
  page = await anonymous.newPage();
  page.on('pageerror', error => pageErrors.push(error.message.slice(0, 300)));
  const publicPlayerReady = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/config/music' && response.ok());
  await page.goto(`${SITE}/posts/${slug}`);
  await expect(page.getByRole('heading', { name: `Browser ${engine}`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '提交评论', exact: true })).toBeDisabled();
  await noOverflow(page);
  await screenshot(engine, 'mobile-article');
  // The player starts after idle, so networkidle alone can precede its fetch.
  // Finish hydration requests before discarding the document: WebKit reports
  // fetches from a discarded document as access-control page errors.
  await publicPlayerReady;
  await page.waitForLoadState('networkidle');
  const protectedPlayerReady = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/config/music' && response.ok());
  await page.goto(`${SITE}/posts/protected-${engine}`);
  await expect(page.getByText('UNLOCKED-BROWSER-BODY', { exact: true })).toHaveCount(0);
  assert((await anonymous.request.get(`${SITE}/api/v1/admin/posts`)).status() === 401, 'Anonymous admin access was allowed');
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await protectedPlayerReady;
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="password"]').fill('browser-secret');
  await page.locator('input[type="password"]').press('Enter');
  await expect(page.getByText('UNLOCKED-BROWSER-BODY', { exact: true })).toBeVisible();
  await screenshot(engine, 'mobile-protected-unlocked');
  assert(pageErrors.length === 0, `Browser runtime error: ${pageErrors.join('; ')}`);
  pass(engine, 'mobile rendering, comment policy, anonymous denial and password unlock');
  await anonymous.close(); await admin.close(); await browser.close(); browser = undefined;
}

(async () => {
  let failure;
  try {
    const { password } = await startServices();
    const selected = process.env.TANO_BROWSER_ENGINE || 'all';
    for (const [name, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
      if (selected === 'all' || selected === name) await verifyEngine(name, launcher, password);
    }
  } catch (error) {
    failure = String(error?.message || error).slice(0, 3000);
    if (page && !page.isClosed()) {
      const positions = await page.evaluate(() => Array.from(document.querySelectorAll('textarea[placeholder^="输入 Markdown"], [aria-label="文章预览"]'))
        .map(element => ({ label: element.tagName, top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight }))).catch(() => []);
      if (positions.length) failure += `\nScroll geometry: ${JSON.stringify(positions)}`;
    }
    process.stderr.write(`FAIL ${failure}\n`);
    await screenshot('failure', 'page').catch(() => {});
    process.exitCode = 1;
  } finally {
    for (const release of gates) release();
    if (browser) await browser.close().catch(() => {});
    await stopServices();
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({
      run_id: process.env.TANO_BROWSER_SCHEMA, status: 'running',
      browser_status: failure ? 'failed' : 'passed', checks, failure: failure || null,
    }, null, 2));
  }
})();
