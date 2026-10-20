/* eslint-disable @typescript-eslint/no-require-imports -- Shared DOM regression harness. */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { MediaPreview } = require('../src/components/ui/MediaPreview.tsx');

async function mount(t, props = {}) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  await act(async () => root.render(React.createElement(MediaPreview, { src: '/song.mp3', type: 'audio', ...props })));
  return host;
}

test('custom media controls show playback errors and allow retry without native controls', async t => {
  let attempts = 0;
  t.mock.method(window.HTMLMediaElement.prototype, 'play', async () => { if (++attempts === 1) throw new Error('not ready'); });
  t.mock.method(window.HTMLMediaElement.prototype, 'load', () => {});
  const host = await mount(t);
  assert.equal(host.querySelector('audio').controls, false);
  const play = () => host.querySelector('button[aria-label="播放音频"]');
  await act(async () => play().click());
  assert.match(host.querySelector('[role="alert"]').textContent, /播放失败/);
  await act(async () => play().click());
  assert.equal(attempts, 2);
  assert.equal(host.querySelector('[role="alert"]') === null, true);
  assert.equal(host.querySelector('button[aria-label="暂停音频"]') !== null, true);
});

test('a paused preview can seek and mute through its custom controls', async t => {
  const host = await mount(t, { type: 'video', src: '/film.mp4' });
  const media = host.querySelector('video');
  Object.defineProperty(media, 'duration', { configurable: true, value: 120 });
  await act(async () => media.dispatchEvent(new Event('loadedmetadata')));
  await act(async () => input(host.querySelector('input[aria-label="视频播放进度"]'), '45'));
  assert.equal(media.currentTime, 45);
  await act(async () => host.querySelector('button[aria-label="静音"]').click());
  assert.equal(media.muted, true);
  assert.equal(host.querySelector('button[aria-label="取消静音"]') !== null, true);
  assert.equal(media.controls, false);
});
