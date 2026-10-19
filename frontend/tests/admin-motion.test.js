/* eslint-disable @typescript-eslint/no-require-imports */
require('./dom-setup.js');
const nodeTest = require('node:test');
const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'next/navigation') return { usePathname: () => window.location.pathname };
  return originalLoad.call(this, request, ...args);
};
global.sessionStorage = window.sessionStorage;
global.self = window;
const { api } = require('../src/lib/api.ts');
const AdminLayout = require('../src/app/admin/layout.tsx').default;
const { ConfirmProvider, useConfirm } = require('../src/components/ConfirmDialog.tsx');
const user = { id: 'admin', username: 'admin', display_name: 'Administrator', role: 'admin', must_change_password: false };
const button = label => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === label);

async function mount(t, tree) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  t.after(async () => {
    await act(async () => root.unmount()); host.remove(); sessionStorage.clear();
    delete document.documentElement.dataset.adminInput;
  });
  await act(async () => root.render(tree()));
  return async () => act(async () => root.render(tree()));
}

function prepareAdmin(t) {
  window.history.replaceState(null, '', '/admin/posts');
  t.mock.method(api.admin, 'summary', async () => ({ pending_comments: 0, pending_links: 0 }));
  t.mock.method(global, 'fetch', async () => Response.json({ count: 0 }));
}

test('route authentication rechecks preserve the mounted sidebar and unsaved controls', async t => {
  prepareAdmin(t);
  let finish;
  let reads = 0;
  t.mock.method(api, 'getMe', () => ++reads === 1 ? Promise.resolve(user) : new Promise(resolve => { finish = resolve; }));
  const render = await mount(t, () => React.createElement(AdminLayout, null,
    React.createElement('input', { 'aria-label': 'Unsaved filter', defaultValue: 'Keep this filter' })));
  const sidebar = document.querySelector('.admin-sidebar');
  const input = document.querySelector('input[aria-label="Unsaved filter"]');
  try {
    window.history.replaceState(null, '', '/admin/media');
    await render();
    assert.equal(document.querySelector('.admin-sidebar') === sidebar, true, 'navigation must remain mounted during authentication');
    assert.equal(document.querySelector('input[aria-label="Unsaved filter"]') === input, true, 'a background recheck must not destroy controls');
    await act(async () => finish(user));
    assert.equal(document.querySelector('input[aria-label="Unsaved filter"]')?.value, 'Keep this filter');
  } finally { if (finish) await act(async () => finish(user)); }
});

test('a rejected route authentication recheck removes protected content', async t => {
  prepareAdmin(t);
  let reject;
  let reads = 0;
  t.mock.method(api, 'getMe', () => ++reads === 1 ? Promise.resolve(user) : new Promise((_, fail) => { reject = fail; }));
  const render = await mount(t, () => React.createElement(AdminLayout, null, React.createElement('p', null, 'Protected content')));
  window.history.replaceState(null, '', '/admin/media');
  await render();
  await act(async () => reject(new Error('Session expired')));
  assert.doesNotMatch(document.body.textContent, /Protected content/);
});

test('returning from a public login route requires authentication before showing protected content', async t => {
  prepareAdmin(t);
  let finish;
  let reads = 0;
  t.mock.method(api, 'getMe', () => ++reads === 1 ? Promise.resolve(user) : new Promise(resolve => { finish = resolve; }));
  const render = await mount(t, () => React.createElement(AdminLayout, null, React.createElement('p', null, 'Protected content')));
  window.history.replaceState(null, '', '/admin/login');
  await render();
  window.history.replaceState(null, '', '/admin/posts');
  try {
    await render();
    assert.equal(document.querySelector('.admin-shell') === null, true, 'leaving the private layout must clear its authenticated state');
    await act(async () => finish(user));
    assert.match(document.body.textContent, /Protected content/);
  } finally { if (finish) await act(async () => finish(user)); }
});

test('switching an open mobile drawer to desktop restores page scrolling', async t => {
  prepareAdmin(t);
  t.mock.method(api, 'getMe', async () => user);
  let resize;
  const desktop = {
    matches: false,
    addEventListener(_event, handler) { resize = handler; },
    removeEventListener() {},
  };
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: query => query === '(min-width: 1024px)' ? desktop : { matches: false } });
  t.after(() => { delete window.matchMedia; });
  await mount(t, () => React.createElement(AdminLayout, null, 'Content'));
  const menu = document.querySelector('button[aria-label="打开导航"]');
  await act(async () => menu.click());
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(typeof resize, 'function', 'the drawer must respond to a desktop viewport');
  await act(async () => { desktop.matches = true; resize({ matches: true }); });
  assert.equal(document.body.style.overflow, '');
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
});

function ConfirmationHarness() {
  const { confirm } = useConfirm();
  const [result, setResult] = React.useState('Waiting');
  return React.createElement(React.Fragment, null,
    React.createElement('button', { onClick: async () => setResult(String(await confirm('Delete this demo item?'))) }, 'Ask'),
    React.createElement('output', null, result));
}
const confirmation = () => React.createElement(ConfirmProvider, null, React.createElement(ConfirmationHarness));

test('confirmation focuses its safe action and restores focus when cancelled', async t => {
  await mount(t, confirmation);
  const trigger = button('Ask'); trigger.focus();
  await act(async () => trigger.click());
  assert.equal(document.activeElement === button('取消'), true, 'opening a confirmation should focus the safe action');
  await act(async () => button('取消').click());
  assert.equal(document.querySelector('output').textContent, 'false');
  assert.equal(document.activeElement === trigger, true, 'closing must restore focus without waiting for the exit animation');
});

test('Escape dismisses confirmation without confirming the action', async t => {
  await mount(t, confirmation);
  const trigger = button('Ask'); trigger.focus();
  await act(async () => trigger.click());
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('output').textContent, 'false');
  assert.equal(document.querySelector('[role="alertdialog"]') === null, true);
  assert.equal(document.activeElement === trigger, true);
});

test('reopening a confirmation during its exit cannot dismiss the new confirmation', async t => {
  await mount(t, confirmation);
  await act(async () => button('Ask').click());
  await act(async () => button('取消').click());
  await act(async () => button('Ask').click());
  await act(async () => new Promise(resolve => setTimeout(resolve, 200)));
  assert.equal(document.querySelector('[role="alertdialog"]') !== null, true);
  await act(async () => button('确定').click());
  assert.equal(document.querySelector('output').textContent, 'true');
});
