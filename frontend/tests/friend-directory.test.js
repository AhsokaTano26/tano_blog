/* eslint-disable @typescript-eslint/no-require-imports -- Node regressions reuse the TypeScript loader. */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');

const links = [
  { id: 'a', name: '晚风手记', url: 'https://wind.example', description: '记录摄影和日常' },
  { id: 'b', name: 'Blue Hour', url: 'https://blue.example', description: 'Photos and stories' },
  { id: 'c', name: '小林', url: 'https://garden.example', description: '开发笔记' },
];

async function mount(t) {
  const { FriendDirectory } = require('../src/components/FriendDirectory.tsx');
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  t.after(async () => { await React.act(async () => root.unmount()); element.remove(); });
  await React.act(async () => root.render(React.createElement(FriendDirectory, { links })));
  return element;
}

test('friend search matches names, descriptions and domains and recovers from no results', async t => {
  const element = await mount(t);
  const search = element.querySelector('input[type="search"]');
  for (const [query, id] of [['晚风', 'a'], ['PHOTOS', 'b'], ['garden.example', 'c']]) {
    await React.act(async () => input(search, query));
    assert.deepEqual([...element.querySelectorAll('[data-friend-row]')].map(row => row.dataset.friendRow), [id]);
    assert.equal(element.querySelectorAll('[data-friend-star][data-match="true"]').length, 1);
  }
  await React.act(async () => input(search, '没有这个朋友'));
  assert.equal(element.querySelectorAll('[data-friend-row]').length, 0);
  assert.match(element.textContent, /没有找到/);
  await React.act(async () => element.querySelector('button[aria-label="清除搜索"]').click());
  assert.equal(element.querySelectorAll('[data-friend-row]').length, 3);
});

test('friend preview supports keyboard focus, visiting a site and Escape', async t => {
  const element = await mount(t);
  const trigger = element.querySelector('[data-friend-star="a"] a');
  await React.act(async () => trigger.focus());
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  const preview = document.getElementById(trigger.getAttribute('aria-controls'));
  assert.match(preview.textContent, /记录摄影和日常/);
  assert.equal(preview.querySelector('a').href, 'https://wind.example/');
  await React.act(async () => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(preview.hidden, true);
});

test('rearranging the map preserves every friend and their destination', async t => {
  const element = await mount(t);
  const read = () => [...element.querySelectorAll('[data-friend-row]')].map(row => [row.dataset.friendRow, row.href]).sort();
  const before = read();
  await React.act(async () => [...element.querySelectorAll('button')].find(button => button.textContent.includes('换一片星空')).click());
  assert.deepEqual(read(), before);
  assert.equal(new Set([...element.querySelectorAll('[data-friend-star]')].map(node => node.dataset.friendStar)).size, 3);
});
