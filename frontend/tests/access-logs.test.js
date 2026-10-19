/* eslint-disable @typescript-eslint/no-require-imports -- Node tests render the real page through the TypeScript loader. */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { api } = require('../src/lib/api.ts');
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');
const Page = require('../src/app/admin/access-logs/page.tsx').default;

const stats = { total_requests: 200, unique_ips: 5, total_errors: 2, avg_response_ms: 3, daily_counts: [] };
const log = path => ({ id: path, path, created_at: '2026-10-01T00:00:00Z', method: 'GET', ip_address: '127.0.0.1', status_code: 200, response_time: 2 });
const response = (params, path = `/page-${params.page}`) => ({ items: [log(path)], total: 200, page: Number(params.page), size: 20, next_cursor: `after-${params.page}` });

async function mount(t, list = async params => response(params), overview = async () => ({ stats })) {
  const lists = [], overviews = [];
  t.mock.method(api.admin.accessLogs, 'list', async params => { lists.push({ ...params }); return list(params); });
  t.mock.method(api.admin.accessLogs, 'overview', async params => { overviews.push({ ...params }); return overview(params); });
  t.mock.method(api.admin.accessLogs, 'stats', async () => stats);
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  t.after(async () => { await React.act(async () => root.unmount()); element.remove(); });
  await React.act(async () => root.render(React.createElement(ConfirmProvider, null, React.createElement(Page))));
  return { lists, overviews };
}

async function click(label) {
  const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === label || item.getAttribute('aria-label') === label);
  assert.ok(button, `Missing button: ${label}`);
  await React.act(async () => button.click());
}

async function change(selector, value) {
  await React.act(async () => input(document.querySelector(selector), value));
}

test('logs default to a visible inclusive 30-day range shared by the overview', async t => {
  const { lists, overviews } = await mount(t);
  const dates = [...document.querySelectorAll('input[type="date"]')].map(element => element.value);
  assert.ok(dates.every(Boolean), 'default dates must be visible');
  assert.equal((Date.parse(dates[1]) - Date.parse(dates[0])) / 86400000, 29);
  assert.deepEqual({ start: lists[0].start, end: lists[0].end }, { start: dates[0], end: dates[1] });
  assert.deepEqual(overviews, [{ start: dates[0], end: dates[1] }]);
});

test('applying a filter on a later page issues one page-one request with the edited range', async t => {
  const { lists, overviews } = await mount(t, async params => response(params, `${params.path || '/all'}-${params.page}`));
  await click('下一页');
  await change('input[placeholder="搜索路径..."]', '/filtered');
  const dates = document.querySelectorAll('input[type="date"]');
  await React.act(async () => { input(dates[0], '2025-01-01'); input(dates[1], '2025-01-31'); });
  const before = lists.length;
  await click('筛选');
  assert.equal(lists.length, before + 1);
  assert.deepEqual(lists.at(-1), { page: '1', page_size: '20', path: '/filtered', start: '2025-01-01', end: '2025-01-31' });
  assert.deepEqual(overviews.at(-1), { start: '2025-01-01', end: '2025-01-31' });
  assert.match(document.querySelector('tbody').textContent, /\/filtered-1/);
});

test('next and previously visited pages use cursors while a new numbered jump keeps page fallback', async t => {
  const { lists } = await mount(t);
  await click('下一页');
  assert.equal(lists.at(-1).cursor, 'after-1');
  await click('下一页');
  assert.equal(lists.at(-1).cursor, 'after-2');
  await click('上一页');
  assert.equal(lists.at(-1).cursor, 'after-1');
  await click('8');
  assert.equal(lists.at(-1).page, '8');
  assert.equal(lists.at(-1).cursor, undefined);
});

test('late responses cannot overwrite a newly applied filter and reset uses fresh defaults', async t => {
  let finishOld;
  const { lists } = await mount(t, params => params.page === '2'
    ? new Promise(resolve => { finishOld = resolve; })
    : Promise.resolve(response(params, params.path || '/all')));
  await click('下一页');
  await change('input[placeholder="搜索路径..."]', '/latest');
  await click('筛选');
  await React.act(async () => finishOld(response({ page: '2' }, '/stale')));
  assert.match(document.querySelector('tbody').textContent, /\/latest/);
  assert.doesNotMatch(document.querySelector('tbody').textContent, /\/stale/);
  const before = lists.length;
  await click('重置筛选');
  assert.equal(lists.length, before + 1);
  assert.equal(lists.at(-1).path, undefined);
  assert.equal(lists.at(-1).page, '1');
  assert.equal(lists.at(-1).cursor, undefined);
  assert.match(document.querySelector('tbody').textContent, /\/all/);
});

test('list and overview failures remain visible and can retry the applied query', async t => {
  let fail = true;
  const { lists, overviews } = await mount(t,
    async params => { if (fail) throw new Error('列表暂不可用'); return response(params); },
    async () => { if (fail) throw new Error('统计暂不可用'); return { stats }; });
  assert.match(document.body.textContent, /列表暂不可用/);
  assert.match(document.body.textContent, /统计暂不可用/);
  await change('input[placeholder="搜索路径..."]', '/unapplied');
  fail = false;
  await click('重试日志');
  await click('重试统计');
  assert.deepEqual(lists[1], lists[0]);
  assert.deepEqual(overviews[1], overviews[0]);
  assert.equal(document.querySelectorAll('[role="alert"]').length, 0);
  assert.match(document.querySelector('tbody').textContent, /\/page-1/);
});

test('invalid or over-366-day ranges do not send queries', async t => {
  const { lists, overviews } = await mount(t);
  const dates = document.querySelectorAll('input[type="date"]');
  await React.act(async () => { input(dates[0], '2024-01-01'); input(dates[1], '2025-12-31'); });
  await click('筛选');
  assert.match(document.querySelector('[role="alert"]').textContent, /366/);
  assert.equal(lists.length, 1);
  assert.equal(overviews.length, 1);
  await React.act(async () => { input(dates[0], '2026-01-02'); input(dates[1], '2026-01-01'); });
  await click('筛选');
  assert.equal(lists.length, 1);
});

test('a single-day line chart has finite coordinates and measures the chart when opened', async t => {
  const previousObserver = global.ResizeObserver;
  let observations = 0;
  global.ResizeObserver = class { observe() { observations++; } disconnect() {} };
  t.after(() => { global.ResizeObserver = previousObserver; });
  await mount(t, undefined, async () => ({ stats: { ...stats, daily_counts: [{ date: '2026-10-01', count: 5 }] } }));
  await click('折线图');
  const line = document.querySelector('section[aria-label="每日请求趋势"] path[stroke="var(--primary)"]');
  assert.ok(line);
  assert.doesNotMatch(line.getAttribute('d'), /NaN|Infinity/);
  assert.equal(observations, 1);
});
