/* eslint-disable @typescript-eslint/no-require-imports -- Node regressions reuse the TypeScript loader. */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { api } = require('../src/lib/api.ts');
const post = (id, title = id) => ({ id, slug: id, title, published_at: '2026-11-19T08:00:00Z', excerpt: id === 'a' ? 'FrontEnd 笔记' : '' });
const groups = [
  { year: 2025, month: 12, count: 1, posts: [post('old', '去年的故事')] },
  { year: 2026, month: 10, count: 1, posts: [post('oct', '秋日记录')] },
  { year: 2026, month: 11, count: 2, posts: [post('a', '界面设计'), post('b', '日常随笔')] },
];

async function mount(t) {
  t.mock.method(api, 'getArchive', async () => ({ items: groups, total: 4, page: 1, size: 50 }));
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await React.act(async () => root.unmount()); host.remove(); });
  await React.act(async () => root.render(React.createElement(require('../src/app/archive/page.tsx').default)));
  return host;
}

test('timeline combines months beneath one year and keeps the API article total', async t => {
  const host = await mount(t);
  assert.deepEqual([...host.querySelectorAll('[data-archive-year]')].map(node => node.dataset.archiveYear), ['2026', '2025']);
  assert.equal(host.querySelector('[data-archive-total]')?.textContent, '4');
  assert.match(host.querySelector('[data-archive-year="2026"] h2').textContent, /本年 3 篇/);
  assert.equal(host.querySelectorAll('a[href^="/posts/"]').length, 4);
});

test('timeline search matches titles and excerpts, then clearing restores all dates', async t => {
  const host = await mount(t);
  await React.act(async () => host.querySelector('button[aria-label="搜索时光"]').click());
  const field = host.querySelector('input[type="search"]');
  await React.act(async () => input(field, 'frontend'));
  assert.equal(host.querySelectorAll('a[href^="/posts/"]').length, 1);
  assert.equal(host.querySelector('a[href^="/posts/"]').getAttribute('href'), '/posts/a');
  await React.act(async () => input(field, '没有这篇文章'));
  assert.match(host.textContent, /没有找到/);
  await React.act(async () => host.querySelector('button[aria-label="清除搜索"]').click());
  assert.equal(host.querySelectorAll('a[href^="/posts/"]').length, 4);
});

test('timeline overview drills into a month and compact mode remains usable', async t => {
  const matchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true });
  t.after(() => { window.matchMedia = matchMedia; });
  const host = await mount(t);
  const button = name => host.querySelector(`button[aria-label="${name}"]`);
  await React.act(async () => button('紧凑视图').click());
  assert.equal(button('紧凑视图').getAttribute('aria-pressed'), 'true');
  await React.act(async () => button('概览视图').click());
  assert.equal(host.querySelectorAll('a[href^="/posts/"]').length, 0);
  await React.act(async () => button('查看 2026 年 11 月的 2 篇文章').click());
  await React.act(async () => new Promise(resolve => setTimeout(resolve, 25)));
  assert.equal(button('舒适视图').getAttribute('aria-pressed'), 'true');
  assert.equal(document.activeElement?.id, 'archive-month-2026-11');
});

test('timeline progress uses calendar days correctly in leap years and at year boundaries', () => {
  const { getTimelineProgress } = require('../src/lib/archive-timeline.ts');
  assert.deepEqual(getTimelineProgress(new Date(2024, 0, 1)), { dayOfYear: 1, yearProgress: 0, dayProgress: 0 });
  const leap = getTimelineProgress(new Date(2024, 1, 29, 12));
  assert.equal(leap.dayOfYear, 60);
  assert.equal(leap.dayProgress, 50);
  assert.ok(Math.abs(leap.yearProgress - 59.5 / 366 * 100) < .001);
  assert.equal(getTimelineProgress(new Date(2025, 11, 31, 23, 59, 59)).dayOfYear, 365);
});
