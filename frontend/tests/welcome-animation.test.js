/* eslint-disable @typescript-eslint/no-require-imports */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { WelcomeAnimation } = require('../src/components/WelcomeAnimation.tsx');

const { api } = require('../src/lib/api.ts');
const ENTRY_DURATION = 12200;
const privateDocument = { html: '<html><body>private fixture</body></html>', duration_ms: ENTRY_DURATION };

async function mount(t, { reduced = false, strict = false, onEnd = () => {}, player = async () => privateDocument, start = true } = {}) {
  t.mock.method(api.admin.entryAnimation, 'player', player);
  const listeners = new Set();
  const motion = {
    matches: reduced,
    addEventListener: (_event, listener) => listeners.add(listener),
    removeEventListener: (_event, listener) => listeners.delete(listener),
  };
  t.mock.method(window, 'matchMedia', () => motion);
  // Finishing must work even when rendering frames are suspended.
  t.mock.method(global, 'requestAnimationFrame', () => 1);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let unmounted = false;
  const unmount = async () => {
    if (unmounted) return;
    await act(async () => root.unmount());
    unmounted = true;
    host.remove();
  };
  t.after(unmount);
  const render = async callback => act(async () => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, null, React.createElement(WelcomeAnimation, {
    user: { username: 'tano', display_name: '测试管理员' }, onEnd: callback,
  }))));
  await render(onEnd);
  const message = async (type, source = host.querySelector('iframe')?.contentWindow) => act(async () => window.dispatchEvent(new window.MessageEvent('message', { source, data: { type } })));
  if (start && !reduced) await message('entry:started');
  return { host, render, unmount, motion, listeners, message, advance: async ms => act(async () => t.mock.timers.tick(ms)) };
}

// JSDOM does not supply matchMedia by default.
window.matchMedia = () => ({ matches: false });

test('the entry sequence completes once even with animation frames suspended', async t => {
  let completed = 0;
  const view = await mount(t, { onEnd: () => completed++ });
  assert.equal(view.host.querySelector('[role="dialog"]') !== null, true);
  assert.equal(view.host.querySelector('iframe').getAttribute('srcdoc'), privateDocument.html);
  assert.equal(view.host.querySelector('iframe').getAttribute('sandbox'), 'allow-scripts');
  await view.advance(ENTRY_DURATION - 1);
  assert.equal(completed, 0);
  await view.advance(1);
  assert.equal(completed, 1);
  await view.advance(ENTRY_DURATION + 1000);
  assert.equal(completed, 1);
});

test('skipping is immediate and cannot complete the sequence twice', async t => {
  let completed = 0;
  const view = await mount(t, { onEnd: () => completed++ });
  const skip = view.host.querySelector('button[aria-label="跳过进入动画"]');
  assert.equal(skip !== null, true);
  assert.equal(document.activeElement === skip, true);
  await act(async () => { skip.click(); skip.click(); });
  assert.equal(completed, 1);
  await view.advance(ENTRY_DURATION + 1000);
  assert.equal(completed, 1);
});

test('Escape exits without waiting for the reveal', async t => {
  let completed = 0;
  await mount(t, { onEnd: () => completed++ });
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(completed, 1);
});

test('reduced motion enters the admin without a timed introduction', async t => {
  let completed = 0;
  const view = await mount(t, { reduced: true, onEnd: () => completed++ });
  assert.equal(completed, 1);
  await view.advance(ENTRY_DURATION + 1000);
  assert.equal(completed, 1);
});

test('StrictMode effect replay completes a reduced-motion introduction only once', async t => {
  let completed = 0;
  const view = await mount(t, { strict: true, reduced: true, onEnd: () => completed++ });
  assert.equal(completed, 1);
  await view.advance(ENTRY_DURATION + 1000);
  assert.equal(completed, 1);
});

test('StrictMode effect replay preserves ordinary timed completion', async t => {
  let completed = 0;
  const view = await mount(t, { strict: true, onEnd: () => completed++ });
  await view.advance(ENTRY_DURATION);
  assert.equal(completed, 1);
});

test('enabling reduced motion during playback ends the sequence', async t => {
  let completed = 0;
  const view = await mount(t, { onEnd: () => completed++ });
  await act(async () => {
    view.motion.matches = true;
    for (const listener of view.listeners) listener({ matches: true });
  });
  assert.equal(completed, 1);
});

test('unmount cancels completion and restores the previous focus', async t => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  t.after(() => trigger.remove());
  trigger.focus();
  let completed = 0;
  const view = await mount(t, { onEnd: () => completed++ });
  await view.unmount();
  await view.advance(ENTRY_DURATION + 1000);
  assert.equal(completed, 0);
  assert.equal(view.listeners.size, 0);
  assert.equal(document.activeElement === trigger, true);
});

test('a callback update does not restart the sequence and uses the latest callback', async t => {
  let oldCalls = 0, newCalls = 0;
  const view = await mount(t, { onEnd: () => oldCalls++ });
  await view.advance(ENTRY_DURATION - 1000);
  await view.render(() => newCalls++);
  await view.advance(1000);
  assert.equal(oldCalls, 0);
  assert.equal(newCalls, 1);
});


test('document failures release the overlay', async t => {
  let completed = 0;
  await mount(t, { player: async () => { throw new Error('offline'); }, start: false, onEnd: () => completed++ });
  assert.equal(completed, 1);
});

test('untrusted frame messages cannot end or start the sequence', async t => {
  let completed = 0;
  const view = await mount(t, { start: false, onEnd: () => completed++ });
  await view.message('entry:finish', window);
  assert.equal(completed, 0);
  await view.message('entry:started');
  await view.message('entry:finish');
  assert.equal(completed, 1);
});

test('theme changes update the existing private frame', async t => {
  const view = await mount(t);
  const frame = view.host.querySelector('iframe');
  const messages = [];
  t.mock.method(frame.contentWindow, 'postMessage', value => messages.push(value));
  await act(async () => {
    document.documentElement.classList.add('light');
    document.documentElement.style.setProperty('--accent-hue', '135');
  });
  assert.equal(messages.at(-1).mode, 'light');
  assert.equal(messages.at(-1).hue, 135);
  assert.equal(view.host.querySelector('iframe') === frame, true);
  t.after(() => { document.documentElement.classList.remove('light'); document.documentElement.style.removeProperty('--accent-hue'); });
});

test('reduced motion does not fetch private player content', async t => {
  let reads = 0;
  await mount(t, { reduced: true, player: async () => { reads++; return privateDocument; } });
  assert.equal(reads, 0);
});

test('a stalled frame cannot trap the interface', async t => {
  let completed = 0;
  const view = await mount(t, { start: false, onEnd: () => completed++ });
  await view.advance(8000);
  assert.equal(completed, 1);
});
