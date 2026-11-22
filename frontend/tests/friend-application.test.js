/* eslint-disable @typescript-eslint/no-require-imports -- Node regressions reuse the TypeScript loader. */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { api } = require('../src/lib/api.ts');
const LinksPage = require('../src/app/links/page.tsx').default;

async function mount(t, config = {}) {
  t.mock.method(api, 'getLinks', async () => ({ items: [] }));
  t.mock.method(api, 'getPublicConfig', async () => ({ config }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await React.act(async () => root.unmount()); host.remove(); });
  await React.act(async () => root.render(React.createElement(LinksPage)));
  const trigger = [...host.querySelectorAll('button')].find(button => button.textContent.trim() === '申请友链');
  assert.equal(Boolean(trigger), true);
  const open = () => React.act(async () => { trigger.focus(); trigger.click(); });
  return { trigger, open };
}

test('friend application opens on demand, returns focus and retains an unfinished form', async t => {
  const { trigger, open } = await mount(t);
  assert.equal(document.querySelector('form') === null, true);
  await open();
  assert.equal(document.querySelector('[role="dialog"]') !== null, true);
  await React.act(async () => input(document.getElementById('friend-name'), '未写完的网站'));
  await React.act(async () => document.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]') === null, true);
  // Radix restores focus on the task after its focus scope unmounts.
  await React.act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  assert.equal(document.activeElement === trigger, true);
  await open();
  assert.equal(document.getElementById('friend-name').value, '未写完的网站');
});

test('friend application keeps failed input, prevents duplicate submits and confirms success in the dialog', async t => {
  const { open } = await mount(t);
  const pending = [];
  t.mock.method(api, 'applyLink', data => new Promise((resolve, reject) => pending.push({ data, resolve, reject })));
  await open();
  await React.act(async () => {
    input(document.getElementById('friend-name'), '我的博客');
    input(document.getElementById('friend-url'), 'https://example.com');
  });
  const submit = () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await React.act(async () => { submit(); submit(); });
  assert.equal(pending.length, 1);
  await React.act(async () => pending[0].reject(new Error('暂时离线')));
  assert.match(document.querySelector('[role="alert"]').textContent, /暂时离线/);
  assert.equal(document.getElementById('friend-name').value, '我的博客');
  await React.act(async () => submit());
  assert.equal(pending[1].data.url, 'https://example.com');
  await React.act(async () => pending[1].resolve({}));
  assert.match(document.querySelector('[role="dialog"]').textContent, /申请已提交/);
  assert.equal(document.querySelector('form') === null, true);
});

test('closing and reopening a friend application removes and recreates its captcha', async t => {
  let renders = 0;
  let removes = 0;
  window.turnstile = { render() { renders++; return `captcha-${renders}`; }, remove() { removes++; } };
  t.after(() => { delete window.turnstile; });
  const { open } = await mount(t, { turnstile_enabled: 'true', turnstile_sitekey: 'test-key', turnstile_modules: 'link' });
  assert.equal(renders, 0);
  await open();
  assert.equal(renders, 1);
  await React.act(async () => document.querySelector('button[aria-label="关闭申请弹窗"]').click());
  assert.equal(removes, 1);
  await open();
  assert.equal(renders, 2);
});
