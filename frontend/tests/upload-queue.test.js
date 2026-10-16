/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests reuse the TypeScript loader. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { api } = require('../src/lib/api.ts');
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');
const AdminMedia = require('../src/app/admin/media/page.tsx').default;

async function mount(t) {
  t.mock.method(api.admin.media, 'list', async () => ({ items: [], total: 0, page: 1, size: 30 }));
  t.mock.method(api.admin.media.tags, 'list', async () => ({ items: [] }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let mounted = true;
  const unmount = async () => { if (mounted) { mounted = false; await React.act(async () => root.unmount()); container.remove(); } };
  t.after(unmount);
  await React.act(async () => root.render(React.createElement(ConfirmProvider, null, React.createElement(AdminMedia))));
  return { unmount };
}

async function selectFiles(names) {
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: names.map(name => new File(['content'], name, { type: 'image/png' })) });
  await React.act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

function pendingUploads(t) {
  const tasks = [];
  t.mock.method(api.admin.media, 'upload', (file, tags, options = {}) => new Promise((resolve, reject) => {
    tasks.push({ file, tags, ...options, resolve, reject });
    options.signal?.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')), { once: true });
  }));
  return tasks;
}

const row = name => document.querySelector(`[data-upload-file="${name}"]`);
async function click(label) {
  const button = document.querySelector(`button[aria-label="${label}"]`) || [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label);
  assert.ok(button, `Missing button: ${label}`);
  await React.act(async () => button.click());
}

test('upload queue shows per-file progress and cancelling pending/active files preserves another successful upload', async t => {
  await mount(t);
  const tasks = pendingUploads(t);
  await selectFiles(['first.png', 'second.png', 'pending.png']);
  assert.equal(tasks.length, 2, 'only two files may upload concurrently');
  assert.ok(row('first.png'));
  await React.act(async () => tasks[0].onProgress({ loaded: 50, total: 100, percent: 50 }));
  assert.equal(row('first.png').querySelector('progress').value, 50);
  await click('取消上传 pending.png');
  await click('取消上传 first.png');
  assert.equal(tasks[0].signal.aborted, true);
  await React.act(async () => tasks[1].resolve({ media: { url: '/uploads/second.png' } }));
  assert.equal(tasks.length, 2, 'cancelled pending files must never start');
  assert.match(row('first.png').textContent, /已取消/);
  assert.match(row('pending.png').textContent, /已取消/);
  assert.match(row('second.png').textContent, /已上传/);
  assert.equal(document.body.textContent.includes('重试失败文件'), false);
  assert.equal(document.body.textContent.includes('Upload cancelled'), false);
});

test('retry uploads only failed files and keeps successful queue entries after a fresh selection', async t => {
  await mount(t);
  const tasks = pendingUploads(t);
  await selectFiles(['done.png', 'failed.png']);
  await React.act(async () => {
    tasks[0].resolve({ media: { url: '/uploads/done.png' } });
    tasks[1].reject(new Error('网络中断'));
  });
  await click('重试失败文件（1）');
  assert.equal(tasks.length, 3);
  assert.equal(tasks[2].file.name, 'failed.png');
  assert.match(row('done.png').textContent, /已上传/);
  await React.act(async () => tasks[2].resolve({ media: { url: '/uploads/failed.png' } }));
  await selectFiles(['new.png']);
  assert.match(row('done.png').textContent, /已上传/);
  assert.match(row('failed.png').textContent, /已上传/);
  await React.act(async () => tasks[3].resolve({ media: { url: '/uploads/new.png' } }));
  assert.equal(document.querySelectorAll('[data-upload-file]').length, 3);
});

test('cancel all aborts the active requests and removes pending requests from the worker queue', async t => {
  await mount(t);
  const tasks = pendingUploads(t);
  await selectFiles(['one.png', 'two.png', 'three.png', 'four.png']);
  await click('取消全部上传');
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every(task => task.signal.aborted));
  assert.equal([...document.querySelectorAll('[data-upload-file]')].filter(item => item.textContent.includes('已取消')).length, 4);
  assert.equal(document.querySelector('input[type="file"]').disabled, false);
});

test('unmounting the media page aborts active uploads without starting queued files', async t => {
  const view = await mount(t);
  const tasks = pendingUploads(t);
  await selectFiles(['one.png', 'two.png', 'three.png']);
  await view.unmount();
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every(task => task.signal?.aborted));
});
