/* eslint-disable @typescript-eslint/no-require-imports -- Node tests render the actual page with the TypeScript loader. */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { api } = require('../src/lib/api.ts');
const Page = require('../src/app/admin/analytics/page.tsx').default;

const overview = name => ({
  stats: { total_requests: 5, unique_ips: 2, total_errors: 0, avg_response_ms: 3, daily_counts: [] },
  path: [{ name, count: 5 }], referrer: [], country: [], status: [], device: [], browser: [], os: [], hour: [],
});

async function mount(t, request) {
  const requests = [];
  t.mock.method(api.admin.accessLogs, 'overview', async params => { requests.push({ ...params }); return request(params); });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await React.act(async () => root.unmount()); container.remove(); });
  await React.act(async () => root.render(React.createElement(Page)));
  return { requests, container };
}

async function changeDates(start, end) {
  const dates = document.querySelectorAll('input[type="date"]');
  await React.act(async () => { input(dates[0], start); input(dates[1], end); });
}

test('changing analytics dates ignores a late successful response from the old range', async t => {
  let finishOld;
  const { container } = await mount(t, params => params.start === '2025-01-01'
    ? Promise.resolve(overview('/new-range'))
    : new Promise(resolve => { finishOld = resolve; }));
  await changeDates('2025-01-01', '2025-01-31');
  assert.match(container.textContent, /\/new-range/);
  await React.act(async () => finishOld(overview('/stale-range')));
  assert.match(container.textContent, /\/new-range/);
  assert.doesNotMatch(container.textContent, /\/stale-range/);
});

test('analytics failures are visible and retry the current range without displaying old results', async t => {
  let fail = false;
  const { requests, container } = await mount(t, async () => {
    if (fail) throw new Error('统计服务暂不可用');
    return overview('/loaded-range');
  });
  fail = true;
  await changeDates('2025-02-01', '2025-02-28');
  assert.match(container.querySelector('[role="alert"]')?.textContent || '', /统计服务暂不可用/);
  assert.doesNotMatch(container.textContent, /\/loaded-range/);
  fail = false;
  const retry = [...container.querySelectorAll('button')].find(button => button.textContent === '重试');
  assert.ok(retry);
  await React.act(async () => retry.click());
  assert.deepEqual(requests.at(-1), { start: '2025-02-01', end: '2025-02-28' });
  assert.equal(container.querySelector('[role="alert"]') === null, true);
  assert.match(container.textContent, /\/loaded-range/);
});

test('a stale analytics failure does not replace the current range or stop its loading indicator', async t => {
  let failOld, finishCurrent;
  const { container } = await mount(t, params => params.start === '2025-03-01'
    ? new Promise(resolve => { finishCurrent = resolve; })
    : new Promise((resolve, reject) => { failOld = reject; }));
  await changeDates('2025-03-01', '2025-03-31');
  await React.act(async () => failOld(new Error('obsolete request failed')));
  assert.match(container.textContent, /加载中/);
  assert.equal(container.querySelector('[role="alert"]') === null, true);
  await React.act(async () => finishCurrent(overview('/march')));
  assert.match(container.textContent, /\/march/);
});

test('analytics rejects empty, inverted and over-year ranges before querying', async t => {
  const { requests, container } = await mount(t, async () => overview('/initial'));
  await changeDates('2024-01-01', '2025-12-31');
  assert.match(container.querySelector('[role="alert"]')?.textContent || '', /366/);
  await changeDates('2026-03-02', '2026-03-01');
  await changeDates('', '2026-03-01');
  assert.equal(requests.length, 1);
  assert.doesNotMatch(container.textContent, /\/initial/);
});
