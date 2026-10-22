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
  t.mock.method(api.admin.entryAnimation, 'player', async () => ({ html: '<html></html>', duration_ms: 12200 }));
  window.history.replaceState(null, '', '/admin/posts');
  t.mock.method(api.admin, 'summary', async () => ({ pending_comments: 0, pending_links: 0 }));
  t.mock.method(global, 'fetch', async () => Response.json({ count: 0 }));
}

test('fresh login loads the workbench under the entry overlay and preserves it when skipped', async t => {
  prepareAdmin(t);
  t.mock.method(api, 'getMe', async () => user);
  const previousMatchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  t.after(() => { window.matchMedia = previousMatchMedia; });
  sessionStorage.setItem('jl', '1');
  let mounts = 0;
  function Workbench() {
    React.useEffect(() => { mounts++; }, []);
    return React.createElement('input', { 'aria-label': 'Workbench filter', defaultValue: 'Preserved' });
  }
  const render = await mount(t, () => React.createElement(AdminLayout, null, React.createElement(Workbench)));
  const shell = document.querySelector('.admin-shell');
  const input = document.querySelector('input[aria-label="Workbench filter"]');
  assert.equal(shell !== null, true, 'the workbench must load while the animation plays');
  assert.equal(shell.hasAttribute('inert'), true, 'covered controls must not receive interaction');
  assert.equal(sessionStorage.getItem('jl'), null, 'fresh-login playback is consumed once');
  await act(async () => document.querySelector('button[aria-label="跳过进入动画"]').click());
  assert.equal(document.querySelector('.admin-shell') === shell, true);
  assert.equal(document.querySelector('input[aria-label="Workbench filter"]') === input, true);
  assert.equal(shell.hasAttribute('inert'), false);
  assert.equal(mounts, 1);
  await render();
  assert.equal(document.querySelector('.admin-entry') === null, true, 'ordinary rerenders do not replay the intro');
});

test('the sidebar can replay the introduction without reloading the workbench', async t => {
  prepareAdmin(t);
  t.mock.method(api, 'getMe', async () => user);
  await mount(t, () => React.createElement(AdminLayout, null,
    React.createElement('input', { 'aria-label': 'Replay filter', defaultValue: 'Unsaved' })));
  const input = document.querySelector('input[aria-label="Replay filter"]');
  const replay = document.querySelector('button[aria-label="重播进入动画"]');
  await act(async () => replay.focus());
  await act(async () => replay.click());
  assert.equal(document.querySelector('.admin-entry') !== null, true);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('.admin-entry') === null, true);
  assert.equal(document.querySelector('input[aria-label="Replay filter"]') === input, true);
  assert.equal(input.value, 'Unsaved');
  assert.equal(document.activeElement === replay, true);
});

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

test('replaying from mobile navigation closes the drawer and releases scrolling after the intro', async t => {
  prepareAdmin(t);
  t.mock.method(api, 'getMe', async () => user);
  const previousMatchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  t.after(() => { window.matchMedia = previousMatchMedia; });
  await mount(t, () => React.createElement(AdminLayout, null, 'Content'));
  await act(async () => document.querySelector('button[aria-label="打开导航"]').click());
  await act(async () => button('重播进入动画').click());
  assert.equal(document.querySelector('.admin-entry') !== null, true);
  assert.equal(document.querySelector('button[aria-label="打开导航"]').getAttribute('aria-expanded'), 'false');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.body.style.overflow, '');
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

test('standby sessions show a persistent notice before any editing request', async t => {
  prepareAdmin(t);
  t.mock.method(api, 'getMe', async () => user);
  t.mock.method(api.admin.sync, 'status', async () => ({ enabled: true, role: 'standby', running: false }));
  await mount(t, () => React.createElement(AdminLayout, null, 'Workbench'));
  assert.match(document.body.textContent, /备服务器.*只读/);
  assert.match(document.body.textContent, /主服务器/);
});

test('server status can refresh after a role change without reloading unsaved controls', async t => {
  prepareAdmin(t);
  t.mock.method(api, 'getMe', async () => user);
  let role = 'standby';
  t.mock.method(api.admin.sync, 'status', async () => ({ enabled: true, role, running: false }));
  await mount(t, () => React.createElement(AdminLayout, null,
    React.createElement('input', { 'aria-label': 'Role change draft', defaultValue: 'Unsaved' })));
  const input = document.querySelector('[aria-label="Role change draft"]');
  assert.match(document.body.textContent, /备服务器.*只读/);
  role = 'primary';
  const refresh = button('刷新主备状态');
  assert.equal(!!refresh, true, 'the notice must allow refreshing server status');
  await act(async () => refresh.click());
  assert.doesNotMatch(document.body.textContent, /备服务器.*只读/);
  assert.equal(document.querySelector('[aria-label="Role change draft"]') === input, true);
  assert.equal(input.value, 'Unsaved');
});

test('failed logout remains on the workbench and displays the revocation error', async t => {
  prepareAdmin(t);
  t.mock.method(api, 'getMe', async () => user);
  t.mock.method(api, 'logout', async () => { throw new Error('revocation offline'); });
  await mount(t, () => React.createElement(AdminLayout, null, 'Preserved workbench'));
  await act(async () => document.querySelector('[aria-label="退出登录"]').click());
  assert.match(document.querySelector('[role=alert]')?.textContent || '', /revocation offline/);
  assert.match(document.body.textContent, /Preserved workbench/);
});

test('failed authentication checks expose service errors and retry without claiming an expired session', async t => {
  prepareAdmin(t);
  let failed = true;
  t.mock.method(api, 'getMe', async () => { if (failed) throw new Error('authentication service offline'); return user; });
  await mount(t, () => React.createElement(AdminLayout, null, 'Recovered workbench'));
  assert.match(document.querySelector('[role=alert]')?.textContent || '', /authentication service offline/);
  failed = false;
  await act(async () => button('重试').click());
  assert.match(document.body.textContent, /Recovered workbench/);
});

test('failed background counters are marked with their reasons and can recover', async t => {
  prepareAdmin(t);
  t.mock.method(api, 'getMe', async () => user);
  let failed = true;
  t.mock.method(api.admin, 'summary', async () => { if (failed) throw new Error('summary offline'); return { pending_comments: 0, pending_links: 0 }; });
  t.mock.method(api, 'getUnreadCount', async () => { if (failed) throw new Error('unread count offline'); return { count: 0 }; });
  await mount(t, () => React.createElement(AdminLayout, null, 'Workbench'));
  const errors = () => [...document.querySelectorAll('[role=alert]')].map(node => node.textContent).join(' ');
  assert.match(errors(), /summary offline/);
  assert.match(errors(), /unread count offline/);
  failed = false;
  await act(async () => button('重试').click());
  assert.doesNotMatch(errors(), /summary offline|unread count offline/);
});
