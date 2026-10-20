/* eslint-disable @typescript-eslint/no-require-imports -- Header interactions use the existing DOM test harness. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const Module = require('node:module');
let pathname = '/';
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'next/navigation') return { usePathname: () => pathname };
  if (request === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
  return originalLoad.call(this, request, ...args);
};
const { Header } = require('../src/components/Header.tsx');
Module._load = originalLoad;
const { api } = require('../src/lib/api.ts');
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

async function mount(t, route = '/', items = []) {
  pathname = route;
  t.mock.method(api, 'getNavLinks', async () => ({ items }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  await act(async () => root.render(React.createElement(Header)));
  return host;
}

test('header identifies the current section on nested routes without marking home active', async t => {
  const host = await mount(t, '/gallery/album');
  const current = [...host.querySelectorAll('a[aria-current="page"]')];
  assert.equal(current.length, 1);
  assert.equal(current[0].getAttribute('href'), '/gallery');
});

test('header preserves defaults and lists each custom destination once', async t => {
  const host = await mount(t, '/', [
    { title: '重复首页', url: '/' },
    { title: '主题专栏', url: '/series' },
    { title: '重复专栏', url: '/series' },
  ]);
  const nav = host.querySelector('nav[aria-label="主导航"]');
  assert.equal(nav === null, false);
  assert.equal(nav.querySelectorAll('a[href="/"]').length, 1);
  assert.equal(nav.querySelectorAll('a[href="/series"]').length, 1);
  assert.equal(nav.querySelectorAll('a[href="/admin"]').length, 1);
});

test('menu exposes its state, closes with Escape, and returns keyboard focus', async t => {
  const host = await mount(t);
  const trigger = host.querySelector('button[aria-controls="site-mobile-menu"]');
  assert.equal(trigger === null, false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  await act(async () => trigger.click());
  const menu = host.querySelector('#site-mobile-menu');
  assert.equal(menu === null, false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  menu.querySelector('a').focus();
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(host.querySelector('#site-mobile-menu') === null, true);
  assert.equal(document.activeElement === trigger, true);
});

test('menu dismisses after choosing a destination or clicking outside the header', async t => {
  const host = await mount(t);
  const trigger = host.querySelector('button[aria-controls="site-mobile-menu"]');
  assert.equal(trigger === null, false);
  await act(async () => trigger.click());
  const destination = host.querySelector('#site-mobile-menu a[href="/gallery"]');
  destination.addEventListener('click', event => event.preventDefault());
  await act(async () => destination.click());
  assert.equal(host.querySelector('#site-mobile-menu') === null, true);
  await act(async () => trigger.click());
  await act(async () => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  assert.equal(host.querySelector('#site-mobile-menu') === null, true);
});

test('crossing the desktop breakpoint dismisses a menu instead of reopening it on return', async t => {
  const listeners = new Set();
  t.mock.method(window, 'matchMedia', () => ({
    matches: false,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  }));
  const host = await mount(t);
  await act(async () => host.querySelector('button[aria-controls="site-mobile-menu"]').click());
  await act(async () => { for (const listener of listeners) listener({ matches: true }); });
  assert.equal(host.querySelector('#site-mobile-menu') === null, true);
  assert.equal(listeners.size, 0);
});
