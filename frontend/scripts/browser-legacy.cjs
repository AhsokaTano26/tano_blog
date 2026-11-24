'use strict';

const assert = require('node:assert/strict');
const { expect } = require('@playwright/test');
const { navigateAdmin } = require('./browser-admin-controls.cjs');

async function verifyLegacyPortal(admin, visitor, site, articleSlug, protectedSlug, adminPassword) {
  const legacy = visitor.getByTestId('legacy-shell');
  await visitor.bringToFront();
  await visitor.goto(site);
  await expect(visitor.locator('[data-site-footer]')).toBeVisible();
  await visitor.waitForLoadState('networkidle');
  await expect(visitor.getByRole('link', { name: '旧版入口', exact: true })).toHaveCount(0);
  for (const path of ['/legacy', '/legacy/archive', '/legacy/login', `/legacy/posts/${articleSlug}`]) {
    const response = await visitor.request.get(site + path);
    assert.equal(response.status(), 404);
    assert.doesNotMatch(await response.text(), /data-testid="legacy-shell"/);
  }

  await admin.bringToFront();
  await navigateAdmin(admin, site, '/admin/settings');
  await admin.getByRole('button', { name: '外观设置', exact: true }).click();
  const toggle = admin.getByRole('checkbox', { name: '开放旧版界面', exact: true });
  const save = admin.getByRole('button', { name: '保存设置', exact: true });
  await expect(toggle).not.toBeChecked();

  async function setAvailability(enabled) {
    await admin.bringToFront();
    await toggle.setChecked(enabled);
    const saved = admin.waitForResponse(response => response.request().method() === 'PUT'
      && new URL(response.url()).pathname === '/api/v1/admin/config' && response.ok());
    await save.click();
    await saved;
    await expect(admin.getByText('设置已保存', { exact: true })).toBeVisible();
  }

  await setAvailability(true);
  await visitor.bringToFront();
  await visitor.evaluate(() => window.dispatchEvent(new Event('focus')));
  await visitor.getByRole('link', { name: '旧版入口', exact: true }).click();
  await expect(legacy).toBeVisible();
  await expect(visitor.getByRole('heading', { name: '最新文章', exact: true })).toBeVisible();
  await expect(visitor.locator('[data-site-footer]')).toHaveCount(0);
  const notice = visitor.getByRole('group', { name: '旧版发布提示', exact: true });
  const releaseLink = notice.getByRole('link', { name: '旧版门户上线', exact: true });
  await expect(releaseLink).toHaveAttribute('href', '/legacy/about#legacy-edition');
  await expect(notice.getByRole('button')).toHaveCount(0);
  await releaseLink.focus();
  await expect(releaseLink).toHaveCSS('animation-play-state', 'paused');
  await releaseLink.blur();

  const keyword = visitor.getByRole('textbox', { name: '搜索文章', exact: true });
  await keyword.fill('Protected browser article');
  await visitor.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(visitor.getByRole('heading', { name: '文章检索', exact: true })).toBeVisible();
  await visitor.locator(`a[href="/legacy/posts/${protectedSlug}"]`).click();
  const password = visitor.getByLabel('请输入文章密码');
  await expect(password).toBeVisible();
  await expect(visitor.getByText('UNLOCKED-BROWSER-BODY', { exact: true })).toHaveCount(0);
  await visitor.waitForLoadState('networkidle');
  await password.fill('browser-secret');
  await visitor.getByRole('button', { name: '阅读文章', exact: true }).click();
  await expect(visitor.getByText('UNLOCKED-BROWSER-BODY', { exact: true })).toBeVisible();
  assert.ok(await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  const login = await visitor.context().newPage();
  try {
    await login.bringToFront();
    await login.goto(site + '/legacy/login');
    await expect(login.getByRole('heading', { name: '用户登录', exact: true })).toBeVisible();
    await login.waitForLoadState('networkidle');
    await login.getByLabel('用户名或邮箱', { exact: true }).fill('admin');
    await login.getByLabel('密码', { exact: true }).fill(adminPassword);
    await login.getByRole('button', { name: '登录', exact: true }).click();
    await login.waitForURL(site + '/admin');
    await expect(login.locator('a[href="/admin/posts"]:visible').first()).toBeVisible({ timeout: 15000 });
  } finally {
    await login.close();
  }

  await setAvailability(false);
  await visitor.bringToFront();
  await visitor.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(legacy).toHaveCount(0);
  await expect(visitor.getByRole('heading', { name: '页面不见了', exact: true })).toBeVisible();
  for (const path of ['/legacy', '/legacy/posts', '/legacy/archive', '/legacy/gallery', '/legacy/links', '/legacy/about', '/legacy/login', `/legacy/posts/${articleSlug}`]) {
    assert.equal((await visitor.request.get(site + path)).status(), 404);
  }
  await visitor.goto(site);
  await visitor.waitForLoadState('networkidle');
  await expect(visitor.getByRole('link', { name: '旧版入口', exact: true })).toHaveCount(0);
}

module.exports = { verifyLegacyPortal };
