/* eslint-disable @typescript-eslint/no-require-imports */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { api } = require('../src/lib/api.ts');
const { EntryAnimationSettings } = require('../src/components/EntryAnimationSettings.tsx');
const { EntryAnimationPreviewContext } = require('../src/lib/entry-animation.tsx');

const fixture = {
  overrides: { welcome_prefix: '自定义前缀' }, icon_data_url: '', site_title: '站点名字',
  fields: [
    { key: 'welcome_title', group: '欢迎页', label: '欢迎标题', default: '站点名字', max_length: 80 },
    { key: 'welcome_prefix', group: '欢迎页', label: '欢迎前缀', default: '默认前缀', max_length: 80 },
  ],
};
async function mount(t, onPreview = () => {}) {
  t.mock.method(api.admin.entryAnimation, 'get', async () => structuredClone(fixture));
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  await act(async () => root.render(React.createElement(EntryAnimationPreviewContext.Provider, { value: onPreview }, React.createElement(EntryAnimationSettings))));
  return host;
}
const button = (host, label) => [...host.querySelectorAll('button')].find(element => element.textContent.includes(label));
const click = async element => act(async () => element.click());
async function change(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

test('blank welcome title uses server site title and only explicit save persists drafts', async t => {
  let saved;
  t.mock.method(api.admin.entryAnimation, 'update', async data => { saved = structuredClone(data); return { ...fixture, ...data }; });
  const host = await mount(t);
  const title = host.querySelector('#entry-field-welcome_title');
  assert.equal(title.value, '');
  assert.equal(title.placeholder, '站点名字');
  await change(title, '自定义标题');
  assert.equal(saved, undefined);
  await click(button(host, '保存动画设置'));
  assert.equal(saved.overrides.welcome_title, '自定义标题');
  assert.match(host.textContent, /动画设置已保存/);
  await click(button(host, '恢复默认'));
  assert.equal(title.value, '');
  assert.equal(saved.overrides.welcome_title, '自定义标题');
  await click(button(host, '保存动画设置'));
  assert.deepEqual(saved, { overrides: {}, icon_data_url: '' });
});

test('preview sends current draft and preserves unsaved input without saving', async t => {
  let previewed, document;
  t.mock.method(api.admin.entryAnimation, 'preview', async data => {
    previewed = structuredClone(data);
    return { html: 'private document', duration_ms: 12200 };
  });
  t.mock.method(api.admin.entryAnimation, 'update', async () => { assert.fail('preview must not save'); });
  const host = await mount(t, value => { document = value; });
  await change(host.querySelector('#entry-field-welcome_title'), '草稿标题');
  await click(button(host, '预览当前草稿'));
  assert.equal(previewed.overrides.welcome_title, '草稿标题');
  assert.equal(document.html, 'private document');
  assert.equal(host.querySelector('#entry-field-welcome_title').value, '草稿标题');
});

test('icon picker rejects unsupported files without calling public uploads', async t => {
  const host = await mount(t);
  const input = host.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { configurable: true, value: [new window.File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' })] });
  await act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
  assert.match(host.querySelector('[role=alert]').textContent, /PNG/);
  assert.equal(host.querySelector('img') === null, true);
});

test('failed saves retain draft and expose a useful error', async t => {
  t.mock.method(api.admin.entryAnimation, 'update', async () => { throw new Error('图标尺寸超过限制'); });
  const host = await mount(t);
  await change(host.querySelector('#entry-field-welcome_title'), '保留草稿');
  await click(button(host, '保存动画设置'));
  assert.equal(host.querySelector('#entry-field-welcome_title').value, '保留草稿');
  assert.match(host.querySelector('[role=alert]').textContent, /图标尺寸/);
  assert.equal(button(host, '保存动画设置').disabled, false);
});
