/* eslint-disable @typescript-eslint/no-require-imports -- Render real management pages through the shared DOM loader. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = React;
const { api } = require('../src/lib/api.ts');
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');

async function mount(t, route) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const Page = require(`../src/app/admin/${route}/page.tsx`).default;
  await act(async () => root.render(React.createElement(ConfirmProvider, null, React.createElement(Page))));
  return host;
}

test('gallery image editing and deletion have image-specific accessible buttons', async t => {
  t.mock.method(api.admin.gallery, 'list', async () => ({ items: [{ id: 'photo', title: '山间留白', url: '/photo.jpg' }], total: 1, page: 1, size: 20 }));
  const host = await mount(t, 'gallery');
  const edit = host.querySelector('button[aria-label="编辑 山间留白"]');
  assert.equal(Boolean(edit), true);
  assert.equal(Boolean(host.querySelector('button[aria-label="删除 山间留白"]')), true);
  await act(async () => edit.click());
  assert.equal(Boolean(document.querySelector('[role="dialog"]')), true);
  assert.match(document.querySelector('[role="dialog"]').textContent, /编辑图片/);
});

test('music background media chooser has a descriptive accessible name', async t => {
  t.mock.method(api.admin.config, 'get', async () => ({ config: {} }));
  const host = await mount(t, 'music-page');
  assert.equal(Boolean(host.querySelector('button[aria-label="选择页面背景图"]')), true);
});
