'use strict';
const { randomUUID } = require('node:crypto');
const { expect } = require('@playwright/test');

// CI starts with an empty schema. Two owned drafts are needed for both row
// actions and the mixed-state checkbox; remove them before editor regressions.
async function withAdminControlPosts(request, engine, check) {
  const ids = [];
  let failure;
  try {
    for (let index = 1; index <= 2; index++) {
      const { post } = await request('POST', '/api/v1/admin/posts', {
        title: `Admin controls ${engine} ${index}`,
        slug: `admin-controls-${engine}-${randomUUID()}`,
        content: 'Isolated article for admin control regression checks.',
        status: 'draft',
      });
      if (typeof post?.id !== 'string' || !post.id) throw new Error('Admin control fixture was not created');
      ids.push(post.id);
    }
    await check();
  } catch (error) {
    failure = error;
  }
  for (const id of ids) {
    try { await request('DELETE', `/api/v1/admin/posts/${encodeURIComponent(id)}`); }
    catch (error) { failure ||= error; }
  }
  if (failure) throw failure;
}

async function navigateAdmin(page, site, route) {
  // Keep the document alive while Next's sidebar prefetches settle. Replacing it
  // with goto() makes Linux WebKit report discarded RSC requests as CORS errors.
  // The first link can still be covered by the authenticated entry animation.
  await page.locator(`a[href="${route}"]:visible`).first().click({ timeout: 25000 });
  await page.waitForURL(`${site}${route}`);
}

// Read-only UI checks: each form is cancelled and no destructive action is sent.
async function verifyAdminControls(page, site, screenshot = async () => {}) {
  const capture = async name => {
    await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {}))));
    await screenshot(name);
  };
  await navigateAdmin(page, site, '/admin/posts');
  await expect(page.getByRole('heading', { name: '文章', exact: true })).toBeVisible();
  const status = page.getByRole('combobox', { name: '状态筛选' });
  await status.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: '全部状态', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);

  const rows = page.getByRole('checkbox', { name: /^选择文章 / });
  await expect.poll(() => rows.count(), { message: 'Admin control checks require at least two fixture articles' }).toBeGreaterThanOrEqual(2);
  const rowCheckbox = rows.first();
  await rowCheckbox.check();
  await expect(page.getByRole('checkbox', { name: '选择全部文章', exact: true })).toHaveAttribute('aria-checked', 'mixed');
  await rowCheckbox.uncheck();

  await page.locator('button[data-tooltip="设置"]').first().click();
  const settings = page.getByRole('dialog', { name: '文章详情与设置', exact: true });
  await expect(settings).toBeVisible();
  const category = settings.getByRole('combobox', { name: '文章分类' });
  await category.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await capture('admin-dark-select');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);

  // A real destructive action must wait for the custom confirmation.
  await page.locator('button[data-tooltip="删除"]').first().click();
  const confirmation = page.getByRole('alertdialog', { name: '确认操作' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(confirmation).toHaveCount(0);

  await navigateAdmin(page, site, '/admin/access-logs');
  const date = page.getByRole('textbox', { name: '开始日期', exact: true });
  await expect(date).toBeVisible();
  await page.getByRole('button', { name: '选择开始日期', exact: true }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(page.getByRole('gridcell').first()).toBeVisible();
  await capture('admin-dark-calendar');
  await page.keyboard.press('Escape');

  await navigateAdmin(page, site, '/admin/backup');
  await page.getByRole('button', { name: '跨机同步', exact: true }).click();
  const plan = page.getByRole('combobox', { name: '计划类型' });
  await expect(plan).toBeVisible();
  await plan.click();
  await page.getByRole('option', { name: '每周计划', exact: true }).click();
  await page.getByRole('button', { name: '选择执行时间', exact: true }).click();
  await page.getByRole('combobox', { name: '小时', exact: true }).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '选择执行时间', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '数据恢复', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择备份文件', exact: true })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveClass(/admin-ui-file-input/);

  await navigateAdmin(page, site, '/admin/posts');
  await page.getByRole('button', { name: '日间模式', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.locator('button[data-tooltip="设置"]').first().click();
  await expect(page.getByRole('dialog', { name: '文章详情与设置', exact: true })).toBeVisible();
  await capture('admin-light-dialog');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('button[data-tooltip="设置"]').first().click();
  const mobile = page.getByRole('dialog', { name: '文章详情与设置', exact: true });
  await expect(mobile).toBeVisible();
  const box = await mobile.boundingBox();
  if (!box || box.x < 0 || box.x + box.width > 391 || box.y < 0 || box.y + box.height > 845) {
    throw new Error('The mobile dialog extends outside the viewport');
  }
  const save = await mobile.getByRole('button', { name: '保存设置', exact: true }).boundingBox();
  const body = await mobile.locator('fieldset').locator('..').boundingBox();
  if (!save || !body || body.y + body.height > save.y + 1) throw new Error('The scrolling form overlaps the dialog actions');
  await capture('admin-mobile-dialog');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigateAdmin(page, site, '/admin');
}

module.exports = { verifyAdminControls, withAdminControlPosts, navigateAdmin };
