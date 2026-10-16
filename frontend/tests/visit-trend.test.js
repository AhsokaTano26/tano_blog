/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the real dashboard with its TypeScript loader. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { api } = require('../src/lib/api.ts');
const Dashboard = require('../src/app/admin/page.tsx').default;

const counts = [...Array(23).fill(1000), 120, 180, 90, 240, 160, 300, 210];
const daily = counts.map((count, i) => ({ date: new Date(Date.UTC(2026, 8, 17 + i)).toISOString().slice(0, 10), count }));

async function mount(t, data = daily, unavailable = false) {
  const previousObserver = global.ResizeObserver;
  global.ResizeObserver = class { observe() {} disconnect() {} };
  t.after(() => { global.ResizeObserver = previousObserver; });
  let requests = 0;
  t.mock.method(api.admin.accessLogs, 'overview', async () => {
    requests++;
    if (unavailable) throw new Error('statistics unavailable');
    return { stats: { total_requests: 24300, daily_counts: data }, device: [], browser: [], os: [], hour: [] };
  });
  t.mock.method(api.admin, 'summary', async () => ({}));
  t.mock.method(api, 'getTopViewed', async () => ({ items: [] }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await React.act(() => root.unmount()); container.remove(); });
  await React.act(() => root.render(React.createElement(Dashboard)));
  return { container, requests: () => requests };
}

async function click(container, label) {
  const button = [...container.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === label || el.textContent.replace(/\s/g, '') === label);
  assert.equal(Boolean(button), true, `Missing control: ${label}`);
  await React.act(() => button.click());
}

test('dashboard visit trend shows seven days rather than all thirty returned days', async t => {
  const { container } = await mount(t);
  assert.equal(container.querySelector('output[aria-label="所选时段访问量"]')?.textContent, '1,300');
  const chart = container.querySelector('section[aria-label="访问趋势"]');
  assert.equal(Boolean(chart), true);
  assert.match(chart.textContent, /10月10日.*10月16日/s);
  assert.equal(chart.querySelector('[aria-label="折线图"]').getAttribute('aria-pressed'), 'true');
});

test('period and chart mode switches reuse existing data and update the visible total', async t => {
  const { container, requests } = await mount(t);
  await click(container, '近30天');
  assert.equal(container.querySelector('output[aria-label="所选时段访问量"]')?.textContent, '24,300');
  await click(container, '柱状图');
  assert.equal(container.querySelector('[aria-label="柱状图"]').getAttribute('aria-pressed'), 'true');
  await click(container, '近7天');
  assert.equal(container.querySelector('output[aria-label="所选时段访问量"]')?.textContent, '1,300');
  assert.equal(requests(), 1);
});

test('single-day charts keep every SVG coordinate finite in both modes', async t => {
  const { container } = await mount(t, [{ date: '2026-10-16', count: 5 }]);
  await click(container, '折线图');
  const plot = container.querySelector('section[aria-label="访问趋势"] svg');
  assert.equal(Boolean(plot), true);
  assert.doesNotMatch(plot.outerHTML, /NaN|Infinity/);
  await click(container, '柱状图');
  assert.doesNotMatch(container.querySelector('section[aria-label="访问趋势"] svg').outerHTML, /NaN|Infinity/);
});

test('zero and missing records have a visible empty state rather than invented bars', async t => {
  const { container } = await mount(t, daily.map(item => ({ ...item, count: 0 })));
  assert.match(container.textContent, /所选日期还没有访问记录/);
  assert.equal(container.querySelector('output[aria-label="所选时段访问量"]')?.textContent, '0');
});

test('keyboard users can inspect daily values and dismiss the tooltip', async t => {
  const { container } = await mount(t);
  const plot = container.querySelector('[role="group"][tabindex="0"]');
  assert.equal(Boolean(plot), true);
  await React.act(() => plot.focus());
  await React.act(() => plot.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  assert.match(container.querySelector('[role="tooltip"]').textContent, /10月15日/);
  assert.match(container.querySelector('[role="tooltip"]').textContent, /300/);
  await React.act(() => plot.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  assert.match(container.querySelector('[role="tooltip"]').textContent, /10月10日/);
  await React.act(() => plot.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(container.querySelector('[role="tooltip"]') === null, true);
});

test('a failed statistics request is distinguished from an empty date range', async t => {
  const { container } = await mount(t, [], true);
  assert.match(container.textContent, /暂时无法读取访问数据/);
  assert.doesNotMatch(container.textContent, /所选日期还没有访问记录/);
});

test('pointer selection survives touch exit before the chart receives focus', async t => {
  const { container } = await mount(t);
  const plot = container.querySelector('[role="group"][tabindex="0"]');
  assert.equal(Boolean(plot), true);
  await React.act(() => {
    plot.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 0, bubbles: true }));
    // Chromium ends a touch pointer before dispatching its synthetic mouse focus.
    const leave = new window.MouseEvent('pointerout', { bubbles: true });
    Object.defineProperty(leave, 'pointerType', { value: 'touch' });
    plot.dispatchEvent(leave);
    plot.focus();
  });
  assert.match(container.querySelector('[role="tooltip"]').textContent, /10月10日/);
});
