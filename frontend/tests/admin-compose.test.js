/* eslint-disable @typescript-eslint/no-require-imports */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const Module = require('node:module');
const { api } = require('../src/lib/api.ts');
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');
// Keep this route lifecycle regression independent of lazy editor loading.
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'next/dynamic') return () => function Editor({ onClose }) {
    return React.createElement('button', { onClick: onClose, 'aria-label': '关闭测试编辑器' }, 'Editor');
  };
  return originalLoad.call(this, request, ...args);
};
const Posts = require('../src/app/admin/posts/page.tsx').default;
Module._load = originalLoad;

test('compose deep link survives an auth remount and is consumed only when the editor closes', { timeout: 5000 }, async t => {
  const previousURL = window.location.href;
  window.history.replaceState(null, '', '/admin/posts?compose=1&from=overview#writing');
  t.mock.method(api.admin.posts, 'list', async () => ({ items: [], total: 0 }));
  t.mock.method(api, 'getCategories', async () => ({ items: [] }));
  t.mock.method(api, 'getTags', async () => ({ items: [] }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => {
    await act(async () => root.unmount());
    host.remove();
    window.history.replaceState(null, '', previousURL);
  });
  const render = key => act(async () => root.render(React.createElement(ConfirmProvider, null, React.createElement(Posts, { key }))));
  const editor = () => document.querySelector('[aria-label="关闭测试编辑器"]');
  await render('initial');
  assert.equal(editor() !== null, true);
  assert.equal(new URLSearchParams(window.location.search).get('compose'), '1');
  await render('auth-ready');
  assert.equal(editor() !== null, true);
  await act(async () => editor().click());
  assert.equal(editor() === null, true);
  assert.equal(window.location.search, '?from=overview');
  assert.equal(window.location.hash, '#writing');
  await render('later');
  assert.equal(editor() === null, true);
});
