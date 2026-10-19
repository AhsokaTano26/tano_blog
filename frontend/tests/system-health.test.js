/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the dashboard and authenticated API client. */
require('./dom-setup.js');
const nodeTest = require('node:test');
const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { api } = require('../src/lib/api.ts');
const Dashboard = require('../src/app/admin/page.tsx').default;

function metrics(overrides = {}) {
  return {
    requests: { requests: 0, error_rate: null, p95_ms: null, p95_overflow: false, window_seconds: 300 },
    storage: {
      uploads: { available_bytes: 10 * 1024 ** 3, available_percent: 50 },
      backups: { available_bytes: 4 * 1024 ** 3, available_percent: 20 },
    },
    backup: { running: false, last_success: '2026-10-19T10:00:00Z', last_result: 'completed' },
    alerts: [], ...overrides,
  };
}

async function mount(t, summary = async () => ({ posts: 0, comments: 0, media: 0, pending_comments: 0, pending_links: 0 })) {
  t.mock.method(api.admin.accessLogs, 'overview', async () => ({ stats: null, device: [], browser: [], os: [], hour: [] }));
  t.mock.method(api.admin, 'summary', summary);
  t.mock.method(api, 'getTopViewed', async () => ({ items: [] }));
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  await act(async () => root.render(React.createElement(Dashboard)));
  return { root, host };
}

async function click(label) {
  const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
  assert.equal(Boolean(button), true, `Missing button: ${label}`);
  await act(async () => button.click());
}

test('system health reports a failed metrics request and retry restores a timestamped snapshot', async t => {
  t.mock.getter(document, 'visibilityState', () => 'visible');
  let failed = true;
  t.mock.method(global, 'fetch', async () => failed ? Response.json({ error: 'monitor offline' }, { status: 503 }) : Response.json(metrics()));
  await mount(t);
  assert.match(document.querySelector('section[aria-label="系统健康"] [role="alert"]')?.textContent || '', /monitor offline/);
  assert.equal(document.querySelector('section[aria-label="系统健康"] time') === null, true);
  failed = false;
  await click('重试');
  const panel = document.querySelector('section[aria-label="系统健康"]');
  assert.equal(panel.querySelector('[role="alert"]') === null, true);
  assert.equal(Boolean(panel.querySelector('time')?.getAttribute('datetime')), true);
  assert.match(panel.textContent, /最近检查/);
  assert.match(panel.textContent, /10\.0 GiB/);
});

test('system health localizes actionable alerts and distinguishes idle traffic and failed disk probes', async t => {
  t.mock.getter(document, 'visibilityState', () => 'visible');
  let snapshot = metrics({
    requests: { requests: 20, error_rate: 0.25, p95_ms: 1800000, p95_overflow: true, window_seconds: 300 },
    storage: { uploads: { available_bytes: 1024 ** 3, available_percent: 5 }, backups: { available_bytes: 0, available_percent: 0, error: 'unavailable' } },
    backup: { running: false, last_success: null, last_result: 'failed' },
    alerts: [
      { code: 'disk_low_uploads', severity: 'warning', message: 'Low uploads space.', action: 'Expand disk.' },
      { code: 'backup_missing', severity: 'warning', message: 'No backup.', action: 'Create backup.' },
      { code: 'future_signal', severity: 'warning', message: 'Future server finding', action: 'Inspect future service' },
    ],
  });
  t.mock.method(global, 'fetch', async () => Response.json(snapshot));
  await mount(t);
  const panel = document.querySelector('section[aria-label="系统健康"]');
  assert.match(panel?.textContent || '', /上传.*空间不足/);
  assert.match(panel.textContent, /扩容/);
  assert.match(panel.textContent, /完整备份/);
  assert.match(panel.textContent, /Future server finding.*Inspect future service/s);
  assert.equal(panel.querySelector('[aria-label="5xx错误率"]').textContent, '25.0%');
  assert.match(panel.querySelector('[aria-label="P95响应时间"]').textContent, />.*1,?800,?000 ms/);
  assert.equal(panel.querySelector('[aria-label="备份磁盘余量"]').textContent, '无法读取');
  snapshot = metrics();
  await click('刷新');
  assert.equal(panel.querySelector('[aria-label="5xx错误率"]').textContent, '无流量');
  assert.equal(panel.querySelector('[aria-label="P95响应时间"]').textContent, '无流量');
  assert.doesNotMatch(panel.textContent, /系统健康正常|全部正常/);
});

test('metrics polling pauses while hidden, prevents overlapping requests and aborts on unmount', async t => {
  let visibility = 'hidden';
  t.mock.getter(document, 'visibilityState', () => visibility);
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const signals = [];
  let complete;
  t.mock.method(global, 'fetch', (_url, options) => {
    signals.push(options.signal);
    return new Promise(resolve => { complete = () => resolve(Response.json(metrics())); });
  });
  const { root } = await mount(t);
  await act(async () => t.mock.timers.tick(60000));
  assert.equal(signals.length, 0);
  await act(async () => { visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(signals.length, 1);
  await act(async () => t.mock.timers.tick(60000));
  assert.equal(signals.length, 1, 'a slow request must not overlap the next polling tick');
  await act(async () => complete());
  await act(async () => { visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); t.mock.timers.tick(120000); });
  assert.equal(signals.length, 1);
  await act(async () => { visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(signals.length, 2);
  await act(async () => root.render(null));
  assert.equal(signals[1].aborted, true);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); t.mock.timers.tick(120000); });
  assert.equal(signals.length, 2);
});


test('dashboard does not present failed content totals as zero and supports retry', async t => {
  t.mock.getter(document, 'visibilityState', () => 'hidden');
  let failed = true;
  await mount(t, async () => {
    if (failed) throw new Error('summary offline');
    return { posts: 8, comments: 12, media: 5, pending_comments: 1, pending_links: 2 };
  });
  const total = () => document.querySelector('[aria-label="内容与访问概况"] a strong')?.textContent;
  assert.equal(total(), '—');
  assert.match(document.body.textContent, /summary offline/);
  failed = false;
  await click('重试');
  assert.equal(total(), '8');
  assert.match(document.body.textContent, /3 项内容等待审核/);
  assert.equal(document.querySelector('a.admin-primary-action')?.getAttribute('href'), '/admin/posts?compose=1');
});
