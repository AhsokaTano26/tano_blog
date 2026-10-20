'use strict';
const { expect } = require('@playwright/test');

// Read-only UI checks: each form is cancelled and no destructive action is sent.
async function verifyAdminControls(page, site, screenshot = async () => {}) {
  const capture = async name => {
    await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {}))));
    await screenshot(name);
  };
  await page.goto(`${site}/admin/posts`);
  await expect(page.getByRole('heading', { name: '文章', exact: true })).toBeVisible();
  const status = page.getByRole('combobox', { name: '状态筛选' });
  await status.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: '全部状态', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);

  const rowCheckbox = page.getByRole('checkbox', { name: /^选择文章 / }).first();
  if (await rowCheckbox.count()) {
    await rowCheckbox.check();
    await expect(page.getByRole('checkbox', { name: '选择全部文章', exact: true })).toHaveAttribute('aria-checked', 'mixed');
    await rowCheckbox.uncheck();
  }

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

  await page.goto(`${site}/admin/access-logs`);
  const date = page.getByRole('textbox', { name: '开始日期', exact: true });
  await expect(date).toBeVisible();
  await page.getByRole('button', { name: '选择开始日期', exact: true }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(page.getByRole('gridcell').first()).toBeVisible();
  await capture('admin-dark-calendar');
  await page.keyboard.press('Escape');

  await page.goto(`${site}/admin/backup`);
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

  await page.goto(`${site}/admin/posts`);
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
  await page.goto(`${site}/admin`);
}

module.exports = { verifyAdminControls };
