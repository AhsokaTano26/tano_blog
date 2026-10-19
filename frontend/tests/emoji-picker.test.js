/* eslint-disable @typescript-eslint/no-require-imports */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { EmojiPickerButton } = require('../src/components/EmojiPicker.tsx');

async function mount(t, props = {}) {
  localStorage.clear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); });
  const chosen = [];
  await act(async () => root.render(React.createElement(EmojiPickerButton, { onSelect: emoji => chosen.push(emoji), ...props })));
  const trigger = host.querySelector('button');
  await act(async () => trigger.click());
  return { host, chosen, trigger };
}

test('picker searches Chinese names and remembers a chosen emoji on its next opening', async t => {
  const { chosen, trigger } = await mount(t);
  const search = document.querySelector('[aria-label="搜索表情"]');
  assert.equal(search !== null, true, 'the picker needs a labelled emoji search');
  await act(async () => input(search, '彩虹'));
  const results = [...document.querySelectorAll('[data-emoji]')];
  assert.deepEqual(results.map(button => button.dataset.emoji), ['🌈']);
  const imageSource = results[0].querySelector('img')?.getAttribute('src');
  assert.equal(typeof imageSource, 'string');
  const imageURL = new URL(imageSource, window.location.href);
  assert.equal(imageURL.pathname, '/emoji/twemoji/1f308.svg');
  assert.equal(imageURL.origin, window.location.origin);
  await act(async () => results[0].click());
  assert.deepEqual(chosen, ['🌈']);
  assert.equal(document.querySelector('[role="dialog"]') === null, true);
  assert.equal(document.activeElement === trigger, true);
  await act(async () => trigger.click());
  assert.equal(document.querySelector('[aria-label="最近使用"] [data-emoji]')?.dataset.emoji, '🌈');
});

test('a missing icon falls back to the original emoji and remains selectable', async t => {
  const { chosen } = await mount(t);
  const thumb = [...document.querySelectorAll('[data-emoji]')].find(button => button.dataset.emoji === '👍');
  const image = thumb.querySelector('img');
  assert.equal(image !== null, true, 'known emojis should use the bundled icon set');
  await act(async () => image.dispatchEvent(new Event('error')));
  assert.equal(thumb.querySelector('img') === null, true);
  assert.equal(thumb.textContent, '👍');
  await act(async () => thumb.click());
  assert.deepEqual(chosen, ['👍']);
});

test('BanG Dream stickers can be browsed, searched by character or band, and remembered', async t => {
  const { chosen, trigger } = await mount(t);
  const category = [...document.querySelectorAll('[aria-label="表情分类"] button')].find(button => button.textContent === 'BanG Dream!');
  assert.equal(category !== undefined, true, 'the new pack needs its own category');
  await act(async () => category.click());
  assert.equal(document.querySelectorAll('[data-emoji]').length, 40);
  const search = document.querySelector('[aria-label="搜索表情"]');
  await act(async () => input(search, 'MyGO'));
  assert.equal(document.querySelectorAll('[data-emoji]').length, 5);
  await act(async () => input(search, '户山香澄'));
  const results = [...document.querySelectorAll('[data-emoji]')];
  assert.equal(results.length, 1);
  assert.equal(results[0].getAttribute('aria-label'), '贴上香澄·期待');
  assert.equal(new URL(results[0].querySelector('img').src).pathname, '/emoji/bangdream/bd24-01.webp');
  await act(async () => results[0].click());
  assert.deepEqual(chosen, ['bd24:01']);
  await act(async () => trigger.click());
  assert.equal(document.querySelector('[aria-label="最近使用"] [data-emoji]')?.dataset.emoji, 'bd24:01');
});

test('sticker grid arrow keys follow the four-column layout', async t => {
  await mount(t);
  const category = [...document.querySelectorAll('[aria-label="表情分类"] button')].find(button => button.textContent === 'BanG Dream!');
  assert.equal(category !== undefined, true);
  await act(async () => category.click());
  const options = [...document.querySelectorAll('[data-emoji]')];
  options[0].focus();
  await act(async () => options[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  assert.equal(document.activeElement === options[4], true);
});

test('a missing sticker shows its readable name instead of its storage key', async t => {
  await mount(t);
  const search = document.querySelector('[aria-label="搜索表情"]');
  await act(async () => input(search, '户山香澄'));
  const option = document.querySelector('[data-emoji]');
  assert.equal(option !== null, true);
  await act(async () => option.querySelector('img').dispatchEvent(new Event('error')));
  assert.equal(option.querySelector('img') === null, true);
  assert.equal(option.textContent.includes('香澄·期待'), true);
  assert.equal(option.textContent.includes('bd24:01'), false);
});

test('picker supports grid arrow keys, selected state, and Escape focus restoration', async t => {
  const { trigger } = await mount(t, { selected: ['👍'] });
  const first = [...document.querySelectorAll('[data-emoji]')].find(button => button.dataset.emoji === '👍');
  assert.equal(first?.getAttribute('aria-pressed'), 'true');
  first.focus();
  await act(async () => first.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  assert.equal(document.activeElement.dataset.emoji, '❤️');
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]') === null, true);
  assert.equal(document.activeElement === trigger, true);
});

test('picker stays inside a narrow viewport and follows viewport resize', async t => {
  const beforeWidth = window.innerWidth, beforeHeight = window.innerHeight;
  window.innerWidth = 320; window.innerHeight = 640;
  t.after(() => { window.innerWidth = beforeWidth; window.innerHeight = beforeHeight; });
  t.mock.method(HTMLElement.prototype, 'getBoundingClientRect', function () {
    return this.tagName === 'BUTTON'
      ? { left: 290, right: 318, top: 500, bottom: 528, width: 28, height: 28 }
      : { left: 0, right: 304, top: 0, bottom: 360, width: 304, height: 360 };
  });
  await mount(t);
  const popup = document.querySelector('[role="dialog"]');
  assert.equal(popup !== null, true, 'the picker needs a semantic popup');
  assert.equal(Number.parseFloat(popup.style.left) >= 8, true);
  assert.equal(Number.parseFloat(popup.style.left) + Number.parseFloat(popup.style.width) <= 312, true);
  assert.equal(Number.parseFloat(popup.style.top) + 360 <= 632, true);
  await act(async () => {
    window.innerWidth = 280;
    window.dispatchEvent(new Event('resize'));
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  assert.equal(Number.parseFloat(popup.style.left) + Number.parseFloat(popup.style.width) <= 272, true);
});

test('viewport resize constrains the picker immediately when animation frames are paused', async t => {
  const beforeWidth = window.innerWidth;
  t.after(() => { window.innerWidth = beforeWidth; });
  t.mock.method(global, 'requestAnimationFrame', () => 1);
  t.mock.method(global, 'cancelAnimationFrame', () => {});
  t.mock.method(HTMLElement.prototype, 'getBoundingClientRect', function () {
    return this.tagName === 'BUTTON'
      ? { left: 290, right: 318, top: 200, bottom: 236, width: 28, height: 36 }
      : { left: 0, right: 320, top: 0, bottom: 360, width: 320, height: 360 };
  });
  await mount(t);
  await act(async () => { window.innerWidth = 280; window.dispatchEvent(new Event('resize')); });
  const popup = document.querySelector('[role="dialog"]');
  assert.equal(Number.parseFloat(popup.style.left) + Number.parseFloat(popup.style.width) <= 272, true);
});

test('picker stays in the visible viewport when scrolling moves its trigger above the screen', async t => {
  let anchorTop = 200;
  t.mock.method(HTMLElement.prototype, 'getBoundingClientRect', function () {
    return this.tagName === 'BUTTON'
      ? { left: 20, right: 60, top: anchorTop, bottom: anchorTop + 36, width: 40, height: 36 }
      : { left: 0, right: 320, top: 0, bottom: 360, width: 320, height: 360 };
  });
  await mount(t);
  await act(async () => {
    anchorTop = -120;
    window.dispatchEvent(new Event('scroll'));
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  const popup = document.querySelector('[role="dialog"]');
  assert.equal(Number.parseFloat(popup.style.top) >= 8, true);
});

test('outside press closes the picker without stealing focus from the destination', async t => {
  await mount(t);
  assert.equal(document.querySelector('[role="dialog"]') !== null, true);
  const outside = document.createElement('button');
  document.body.append(outside);
  t.after(() => outside.remove());
  await act(async () => { outside.focus(); outside.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
  assert.equal(document.querySelector('[role="dialog"]') === null, true);
  assert.equal(document.activeElement === outside, true);
});

test('pressing the trigger closes an open picker after focus leaves the popup', async t => {
  const { trigger } = await mount(t);
  assert.equal(document.querySelector('[role="dialog"]') !== null, true);
  // A real pointer press focuses its destination before dispatching click.
  await act(async () => trigger.focus());
  await act(async () => trigger.click());
  assert.equal(document.querySelector('[role="dialog"]') === null, true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});

test('category changes clear search, empty searches recover, and unavailable storage does not block selection', async t => {
  t.mock.method(window.Storage.prototype, 'getItem', () => { throw new Error('Storage blocked'); });
  t.mock.method(window.Storage.prototype, 'setItem', () => { throw new Error('Storage blocked'); });
  const { chosen } = await mount(t);
  const search = document.querySelector('[aria-label="搜索表情"]');
  await act(async () => input(search, '没有这个表情'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /没有找到/);
  const animals = [...document.querySelectorAll('[aria-label="表情分类"] button')].find(button => button.textContent === '动物');
  await act(async () => animals.click());
  assert.equal(search.value, '');
  const dog = [...document.querySelectorAll('[data-emoji]')].find(button => button.dataset.emoji === '🐶');
  assert.equal(dog !== undefined, true);
  await act(async () => dog.click());
  assert.deepEqual(chosen, ['🐶']);
});
