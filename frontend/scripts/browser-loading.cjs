'use strict';
const { expect } = require('@playwright/test');
const { navigateAdmin } = require('./browser-admin-controls.cjs');

async function verifyLoadingMotion(page, site) {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const pattern = '**/api/v1/admin/gallery*';
  const hold = async route => { await pending; await route.continue(); };
  await page.route(pattern, hold);
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await navigateAdmin(page, site, '/admin/gallery');
    const loading = page.getByRole('status').filter({ hasText: '加载中' });
    await expect(loading).toBeVisible();
    const squares = loading.locator('svg rect');
    await expect(squares).toHaveCount(9);
    await expect(squares.first()).toHaveCSS('animation-name', 'none');
    await expect(squares.first()).toHaveCSS('transform', 'none');

    // A live OS preference change should resume the wave, then stop it again.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(() => squares.first().evaluate(element => {
      const animation = element.getAnimations()[0];
      return animation?.playState === 'running' && animation.currentTime > 100;
    })).toBe(true);
    await expect(squares.first()).toHaveCSS('animation-duration', '2.4s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(squares.first()).toHaveCSS('animation-name', 'none');
    await expect(squares.first()).toHaveCSS('transform', 'none');
    release();
    await expect(loading).toBeHidden();
  } finally {
    release();
    await page.unroute(pattern, hold);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  await navigateAdmin(page, site, '/admin');
}

module.exports = { verifyLoadingMotion };
