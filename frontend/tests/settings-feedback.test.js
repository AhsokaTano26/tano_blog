/* eslint-disable @typescript-eslint/no-require-imports */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const Settings = require('../src/app/admin/settings/page.tsx').default;

const fixture = { site_title: 'Settings fixture', footer_injection: '<p>Original footer</p>' };
const button = (host, text) => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === text);
const click = async element => act(async () => element.click());
const footer = host => [...host.querySelectorAll('label')].find(element => element.textContent === '页脚注入').parentElement.querySelector('textarea');

async function mount(t, configRequest) {
  t.mock.method(global, 'fetch', async (url, options = {}) => {
    if (String(url).includes('/check-version')) return Response.json({ latest: '' });
    assert.equal(String(url), '/api/v1/admin/config');
    return configRequest(options.method || 'GET', options);
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  await act(async () => root.render(React.createElement(Settings)));
  return host;
}

test('rejected footer saves display the server reason and retain the draft for retry', async t => {
  const reason = '备服务器只允许修改同步配置，请在主服务器修改站点设置';
  let reject = true;
  let stored = { ...fixture };
  const host = await mount(t, (method, options) => {
    if (method === 'GET') return Response.json({ config: stored });
    assert.equal(method, 'PUT');
    if (reject) return Response.json({ error: reason }, { status: 503 });
    stored = JSON.parse(options.body);
    return Response.json({ message: '配置已更新' });
  });
  await click(button(host, '代码注入'));
  await act(async () => input(footer(host), '<p>Keep this footer draft</p>'));
  await click(button(host, '保存设置'));
  assert.match(host.textContent, new RegExp(reason));
  assert.equal(footer(host).value, '<p>Keep this footer draft</p>');
  assert.equal(button(host, '保存设置').disabled, false);
  reject = false;
  await click(button(host, '保存设置'));
  assert.equal(stored.footer_injection, '<p>Keep this footer draft</p>');
  assert.match(host.textContent, /设置已保存/);
});

test('a refresh failure after a confirmed save reports that the settings were saved', async t => {
  let stored = { ...fixture };
  let saved = false;
  const host = await mount(t, (method, options) => {
    if (method === 'PUT') {
      stored = JSON.parse(options.body);
      saved = true;
      return Response.json({ message: '配置已更新' });
    }
    if (saved) return new Response('Service Unavailable', { status: 503 });
    return Response.json({ config: stored });
  });
  await click(button(host, '代码注入'));
  await act(async () => input(footer(host), '<p>Saved footer</p>'));
  await click(button(host, '保存设置'));
  assert.equal(stored.footer_injection, '<p>Saved footer</p>');
  assert.match(host.textContent, /设置已保存/);
  assert.match(host.textContent, /HTTP 503/);
  assert.equal(footer(host).value, '<p>Saved footer</p>');
  assert.equal(button(host, '保存设置').disabled, false);
});
