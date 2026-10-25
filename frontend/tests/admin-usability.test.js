/* eslint-disable @typescript-eslint/no-require-imports */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const Module = require('node:module');
const originalLoad = Module._load;
let searchQuery = 'token=test-reset-token';
Module._load = function (request, ...args) {
  if (request === 'next/navigation') return { useSearchParams: () => new URLSearchParams(searchQuery) };
  return originalLoad.call(this, request, ...args);
};
const { api } = require('../src/lib/api.ts');
async function mount(t, route) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const Page = require(`../src/app/admin/${route}/page.tsx`).default;
  await act(async () => root.render(React.createElement(Page)));
  return { rerender: () => act(async () => root.render(React.createElement(Page))) };
}
const labelled = text => [...document.querySelectorAll('label')].find(node => node.textContent.trim() === text)?.control;

test('login fields retain visible names and the password visibility action has an accessible name', async t => {
  await mount(t, 'login');
  assert.equal(labelled('用户名或邮箱地址')?.getAttribute('autoComplete'), 'username');
  assert.equal(labelled('密码')?.type, 'password');
  const toggle = document.querySelector('button[aria-label="显示密码"]');
  assert.equal(!!toggle, true);
  await act(async () => toggle.click());
  assert.equal(labelled('密码')?.type, 'text');
  assert.equal(!!document.querySelector('button[aria-label="隐藏密码"]'), true);
});

test('password recovery has a visible email label and keeps entered email after a rejection', async t => {
  t.mock.method(api, 'forgotPassword', async () => { throw new Error('mail offline'); });
  await mount(t, 'forgot-password');
  const email = labelled('注册邮箱');
  assert.equal(!!email, true);
  await act(async () => input(email, 'writer@example.test'));
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(email.value, 'writer@example.test');
  assert.match(document.querySelector('[role="alert"]')?.textContent || '', /mail offline/);
});

test('reset password inputs have visible names and mismatch is announced without a request', async t => {
  let writes = 0;
  t.mock.method(api, 'resetPassword', async () => { writes++; });
  await mount(t, 'reset-password');
  const password = labelled('新密码');
  const confirmation = labelled('确认新密码');
  assert.equal(!!password && !!confirmation, true);
  await act(async () => { input(password, 'new-password'); input(confirmation, 'different-password'); });
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.match(document.querySelector('[role="alert"]')?.textContent || '', /两次密码不一致/);
  assert.equal(writes, 0);
});

test('reset password retains the initial token when Next synchronizes the cleaned URL', async t => {
  const calls = [];
  t.mock.method(api, 'resetPassword', async (...args) => { calls.push(args); return { message: '重置成功' }; });
  t.after(() => { searchQuery = 'token=test-reset-token'; });
  const page = await mount(t, 'reset-password');
  searchQuery = '';
  await page.rerender();
  const password = labelled('新密码');
  assert.equal(!!password, true, 'cleaning the URL must keep the reset form available');
  await act(async () => { input(password, 'new-password'); input(labelled('确认新密码'), 'new-password'); });
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.deepEqual(calls, [['test-reset-token', 'new-password']]);
  assert.match(document.querySelector('[role="status"]')?.textContent || '', /重置成功/);
});

test('calendar month navigation is named and updates the queried month', async t => {
  const calls = [];
  t.mock.method(api.admin.posts, 'calendar', async query => { calls.push(query); return { items: [] }; });
  await mount(t, 'calendar');
  const initial = calls.at(-1);
  const next = document.querySelector('button[aria-label="下个月"]');
  assert.equal(!!next, true);
  assert.equal(!!document.querySelector('button[aria-label="上个月"]'), true);
  await act(async () => next.click());
  assert.notDeepEqual(calls.at(-1), initial);
});

test('settings section buttons expose the current selection to assistive technology', async t => {
  t.mock.method(api.admin.config, 'get', async () => ({ config: {} }));
  t.mock.method(api.admin, 'checkVersion', async () => ({ latest: '' }));
  await mount(t, 'settings');
  const navigation = document.querySelector('[aria-label="设置分区"]');
  assert.equal(!!navigation, true);
  const buttons = [...navigation.querySelectorAll('button')];
  assert.equal(buttons.filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
  await act(async () => buttons[1].click());
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
});

test('compact calendar opens all articles for a date, including dates with fewer than four articles', async t => {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  t.mock.method(api.admin.posts, 'calendar', async () => ({ items: [
    { id: 'post-1', title: '当天的草稿', date, status: 'draft' },
    { id: 'post-2', title: '当天已发布文章', date, status: 'published' },
  ] }));
  await mount(t, 'calendar');
  const day = document.querySelector(`button[aria-label="${date}，共 2 篇文章"]`);
  assert.equal(!!day, true);
  await act(async () => day.click());
  const dialog = document.querySelector('[role="dialog"]');
  assert.equal(!!dialog, true);
  assert.match(dialog.textContent, /当天的草稿/);
  assert.match(dialog.textContent, /当天已发布文章/);
  await act(async () => document.querySelector('button[aria-label="关闭日期详情"]').click());
  assert.equal(document.querySelector('[role="dialog"]') === null, true);
});
