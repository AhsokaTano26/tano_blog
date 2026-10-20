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
  const dates = document.querySelectorAll('input[aria-label="开始日期"], input[aria-label="结束日期"]');
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

test('analytics defaults to seven inclusive UTC+8 calendar days', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T16:15:00Z') });
  const { requests } = await mount(t, async () => overview('/initial'));
  assert.deepEqual(requests[0], { start: '2026-10-14', end: '2026-10-20' });
});

test('custom-range trends retain all 366 days and keep zero days at the baseline', async t => {
  const daily = Array.from({ length: 366 }, (_, index) => ({ date: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10), count: index === 365 ? 0 : 1 }));
  const data = overview('/annual');
  data.stats = { ...data.stats, total_requests: 365, daily_counts: daily };
  const { container } = await mount(t, async () => data);
  await changeDates('2024-01-01', '2024-12-31');
  const chart = container.querySelector('section[aria-label="每日请求趋势"]');
  assert.equal(Boolean(chart), true, 'the selected date range needs a readable interactive chart');
  assert.equal(chart.querySelector('output[aria-label="所选时段访问量"]').textContent, '365');
  assert.equal(chart.querySelectorAll('tbody tr').length, 366, 'the chart must not silently reduce a custom range to seven or thirty days');
  assert.equal(chart.querySelectorAll('[data-axis="x"] text').length <= 8, true, 'date labels must not crowd the plot');
  const bars = chart.querySelector('button[aria-label="柱状图"]');
  await React.act(async () => bars.click());
  const rectangles = chart.querySelectorAll('rect[data-count]');
  assert.equal(rectangles.length, 366);
  assert.equal(rectangles[365].getAttribute('height'), '0', 'zero requests must not be drawn as a positive column');
  assert.doesNotMatch(chart.querySelector('svg').outerHTML, /NaN|Infinity/);
});

test('ranking percentages use all requests rather than the displayed top rows', async t => {
  const data = overview('/popular');
  data.stats.total_requests = 200;
  data.path = [{ name: '/popular', count: 60 }, { name: '/second', count: 20 }];
  const { container } = await mount(t, async () => data);
  const ranking = container.querySelector('section[aria-label="页面排行"]');
  assert.equal(Boolean(ranking), true);
  assert.match(ranking.textContent, /30%/);
  assert.match(ranking.textContent, /10%/);
  assert.doesNotMatch(ranking.textContent, /75%|25%/);
});

test('hourly charts expose zero-filled hours and support keyboard inspection', async t => {
  const data = overview('/hour');
  data.stats.total_requests = 7;
  data.hour = [{ hour: 1, count: 7 }];
  const { container } = await mount(t, async () => data);
  const chart = container.querySelector('section[aria-label="时段分布"]');
  assert.equal(Boolean(chart), true);
  assert.equal(chart.querySelectorAll('tbody tr').length, 24);
  const plot = chart.querySelector('[role="group"][tabindex="0"]');
  await React.act(async () => {
    plot.focus();
    plot.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    plot.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  assert.match(chart.querySelector('[role="tooltip"]').textContent, /01:00.*02:00/);
  assert.match(chart.querySelector('[role="tooltip"]').textContent, /7/);
  await React.act(async () => plot.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true })));
  assert.match(chart.querySelector('[role="tooltip"]').textContent, /23:00.*24:00/);
  await React.act(async () => plot.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(chart.querySelector('[role="tooltip"]') === null, true);
});

test('range shortcuts query the exact inclusive calendar range in one request', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T16:15:00Z') });
  const { requests, container } = await mount(t, async () => overview('/shortcut'));
  for (const days of [30, 90, 7]) {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent === `近 ${days} 天`);
    assert.equal(Boolean(button), true);
    const before = requests.length;
    await React.act(async () => button.click());
    assert.equal(requests.length, before + 1);
    const range = requests.at(-1);
    assert.equal(range.end, '2026-10-20');
    assert.equal((Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1, days);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
  }
});

test('long rankings can reveal and collapse remaining paths without changing their shares', async t => {
  const data = overview('/ranking');
  data.stats.total_requests = 210;
  data.path = Array.from({ length: 20 }, (_, i) => ({ name: `/path-${i}`, count: 20 - i }));
  const { container } = await mount(t, async () => data);
  const ranking = container.querySelector('section[aria-label="页面排行"]');
  assert.equal(ranking.querySelectorAll('li').length, 8);
  const expand = ranking.querySelector('button');
  await React.act(async () => expand.click());
  assert.equal(ranking.querySelectorAll('li').length, 20);
  assert.equal(expand.getAttribute('aria-expanded'), 'true');
  assert.match(ranking.querySelector('li:last-child').textContent, /0\.5%/);
  await React.act(async () => expand.click());
  assert.equal(ranking.querySelectorAll('li').length, 8);
  assert.equal(expand.getAttribute('aria-expanded'), 'false');
});

test('narrow charts reduce date labels and keep keyboard tooltips inside the plot', async t => {
  const previousObserver = global.ResizeObserver;
  global.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() { this.callback([{ contentRect: { width: 280 } }]); }
    disconnect() {}
  };
  t.after(() => { global.ResizeObserver = previousObserver; });
  const data = overview('/narrow');
  data.stats.daily_counts = Array.from({ length: 31 }, (_, i) => ({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, count: i + 1 }));
  const { container } = await mount(t, async () => data);
  await changeDates('2025-01-01', '2025-01-31');
  const chart = container.querySelector('section[aria-label="每日请求趋势"]');
  assert.equal(chart.querySelectorAll('[data-axis="x"] text').length <= 4, true);
  const plot = chart.querySelector('[role="group"][tabindex="0"]');
  await React.act(async () => plot.focus());
  const tooltip = chart.querySelector('[role="tooltip"]');
  assert.equal(Boolean(tooltip), true);
  assert.equal(parseFloat(tooltip.style.left) >= 0, true);
  assert.equal(parseFloat(tooltip.style.left) + parseFloat(tooltip.style.width) <= 280, true);
});
