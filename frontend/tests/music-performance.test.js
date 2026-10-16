/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests use the CommonJS TypeScript loader. */
require('./load-typescript.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const { act } = React;
const { JSDOM } = require('jsdom');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, parent, ...rest);
};
const originalLoad = Module._load;
const router = { push() {} };
let pathname = '/';
Module._load = function (request, ...args) {
  if (request === 'next/navigation') return { useRouter: () => router, usePathname: () => pathname };
  return originalLoad.call(this, request, ...args);
};

const tracks = Array.from({ length: 500 }, (_, i) => ({ title: `Track ${i}`, url: `/audio/${i}.mp3`, cover: `/cover/${i}.jpg` }));
const { api } = require('../src/lib/api.ts');
const getConfig = async () => ({ config: { music_page_config: JSON.stringify({ playlists: [{ id: 'main', name: 'Main', tracks }] }) } });
api.getPublicConfig = getConfig;
api.getMusicConfig = getConfig;
api.getNavLinks = async () => ({ items: [] });

async function mount(Component, props, configure = () => {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const { window } = dom;
  for (const name of ['window', 'self', 'document', 'localStorage', 'sessionStorage', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement']) global[name] = name === 'window' || name === 'self' ? window : window[name];
  const { createRoot } = require('react-dom/client');
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const media = new window.EventTarget();
  media.matches = false;
  window.matchMedia = () => media;
  let frameId = 0;
  const frames = new Map();
  global.requestAnimationFrame = window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  global.cancelAnimationFrame = window.cancelAnimationFrame = id => frames.delete(id);
  window.HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new window.Event('play')); return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new window.Event('pause')); };
  window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, beginPath() {}, arc() {}, fill() {} });
  configure(window);
  const root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(Component, props)); });
  return {
    window, media, frames, root,
    async frame() {
      const pending = [...frames.values()]; frames.clear();
      await act(async () => pending.forEach(callback => callback(performance.now())));
    },
    async click(selector) {
      const element = document.querySelector(selector);
      assert.ok(element, `Missing control: ${selector}`);
      await act(async () => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    },
    async cleanup() { await act(async () => root.unmount()); dom.window.close(); },
  };
}

test('collapsed player does not mount playlist covers; opening is bounded and lazy', async () => {
  const { MusicPlayer } = require('../src/components/MusicPlayer.tsx');
  const view = await mount(MusicPlayer);
  try {
    assert.equal(document.querySelectorAll('img').length, 0, 'closed player must not load covers');
    const open = document.querySelector('[title="打开音乐播放器"]');
    await act(async () => {
      open.dispatchEvent(new view.window.MouseEvent('mousedown', { bubbles: true }));
      view.window.dispatchEvent(new view.window.MouseEvent('mouseup', { bubbles: true }));
    });
    await view.click('[title="播放列表"]');
    const covers = [...document.querySelectorAll('img')];
    assert.ok(covers.length > 1 && covers.length <= 51, 'opening should mount at most one page of tracks');
    assert.ok(covers.slice(1).every(image => image.getAttribute('loading') === 'lazy'));
    const nextPage = [...document.querySelectorAll('button')].find(button => button.textContent === '下一页');
    await act(async () => nextPage.click());
    const track = [...document.querySelectorAll('button')].find(button => button.textContent === 'Track 50');
    await act(async () => track.click());
    assert.equal(document.querySelector('audio').getAttribute('data-src'), '/audio/50.mp3');
    await view.click('[title="关闭"]');
    assert.equal(document.querySelectorAll('img').length, 0);
  } finally { await view.cleanup(); }
});

test('hiding the floating player retains its audio element and selected track', async () => {
  const { MusicPlayer } = require('../src/components/MusicPlayer.tsx');
  const view = await mount(MusicPlayer);
  try {
    const audio = document.querySelector('audio');
    assert.equal(audio.volume, 0.5, 'audio should receive the displayed initial volume after mounting');
    await act(async () => { audio.dispatchEvent(new view.window.Event('play')); });
    audio.currentTime = 42;
    await act(async () => view.root.render(React.createElement(MusicPlayer, { hidden: true })));
    assert.equal(document.querySelector('audio'), audio);
    assert.equal(document.querySelectorAll('button').length, 0);
    await act(async () => view.root.render(React.createElement(MusicPlayer, { hidden: false })));
    assert.equal(document.querySelector('audio'), audio);
    assert.equal(audio.currentTime, 42);
    assert.equal(audio.getAttribute('data-src'), '/audio/0.mp3');
  } finally { await view.cleanup(); }
});

test('layout defers the player until idle and preserves playback across public routes', async () => {
  const idleCallbacks = new Map();
  let idleId = 0;
  pathname = '/';
  const Layout = () => React.createElement(require('../src/components/ClientLayout.tsx').ClientLayout, {}, React.createElement('p', {}, pathname));
  const view = await mount(Layout, {}, window => {
    window.requestIdleCallback = callback => { idleCallbacks.set(++idleId, callback); return idleId; };
    window.cancelIdleCallback = id => idleCallbacks.delete(id);
  });
  try {
    assert.equal(document.querySelector('audio'), null);
    await act(async () => { for (const callback of idleCallbacks.values()) callback(); });
    const audio = document.querySelector('audio');
    assert.ok(audio);
    await act(async () => audio.play());
    audio.currentTime = 42;
    let pauses = 0;
    audio.addEventListener('pause', () => pauses++);
    for (const route of ['/posts/example', '/archive', '/']) {
      pathname = route;
      await act(async () => view.root.render(React.createElement(Layout)));
      assert.equal(document.querySelector('audio'), audio, 'navigation must retain the playing audio element');
      assert.equal(audio.currentTime, 42);
    }
    assert.equal(pauses, 0, 'ordinary navigation must not interrupt playback');
    pathname = '/music';
    await act(async () => view.root.render(React.createElement(Layout)));
    assert.equal(document.querySelector('audio'), audio);
    assert.equal(pauses, 1, 'entering the dedicated music page pauses the floating player');
    assert.equal(document.querySelector('[title="打开音乐播放器"]'), null);
  } finally { pathname = '/'; await view.cleanup(); }
});

test('spectrum reuses the analyser buffer and draws without React commits', async () => {
  const { MusicSpectrum } = require('../src/components/music/MusicSpectrum.tsx');
  const inputBuffers = [];
  const analyserRef = { current: { frequencyBinCount: 1024, getByteFrequencyData(buffer) { inputBuffers.push(buffer); buffer.fill(255); } } };
  const frequenciesRef = { current: new Uint8Array(128) };
  let commits = 0;
  const Spectrum = () => React.createElement(React.Profiler, { id: 'spectrum', onRender() { commits++; } },
    React.createElement(MusicSpectrum, { analyserRef, frequenciesRef, active: true, mobile: false }));
  const view = await mount(Spectrum);
  try {
    const initialCommits = commits;
    await view.frame();
    assert.equal(frequenciesRef.current[0], 89);
    await view.frame();
    assert.equal(frequenciesRef.current[0], 147);
    assert.equal(inputBuffers.length, 2);
    assert.equal(inputBuffers[0], inputBuffers[1], 'FFT input storage should be reused');
    assert.equal(commits, initialCommits, 'animation frames must not render React');
    await act(async () => view.root.render(React.createElement(MusicSpectrum, { analyserRef, frequenciesRef, active: false, mobile: false })));
    assert.equal(view.frames.size, 0);
    assert.ok(frequenciesRef.current.every(value => value === 0));
  } finally { await view.cleanup(); }
});

test('idle music page schedules no perpetual animation frames', async () => {
  const MusicPage = require('../src/app/music/page.tsx').default;
  const view = await mount(MusicPage);
  try {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)); });
    assert.equal(document.querySelector('audio').getAttribute('data-src'), '/audio/0.mp3');
    await view.frame();
    assert.equal(view.frames.size, 0, 'paused particles and analyser must not keep requesting frames');
  } finally { await view.cleanup(); }
});

test('music page animation updates do not commit the React page', async () => {
  const MusicPage = require('../src/app/music/page.tsx').default;
  const previousAudioContext = global.AudioContext;
  const inputBuffers = [];
  global.AudioContext = class {
    destination = {};
    createAnalyser() { return { frequencyBinCount: 1024, connect() {}, getByteFrequencyData(buffer) { inputBuffers.push(buffer); buffer.fill(255); } }; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    createMediaElementSource() { return { connect() {} }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  };
  let commits = 0;
  const Page = () => React.createElement(React.Profiler, { id: 'music-page', onRender() { commits++; } }, React.createElement(MusicPage));
  const view = await mount(Page);
  try {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)); });
    const play = document.querySelector('button:has(svg.lucide-play)');
    await act(async () => play.click());
    const initialCommits = commits;
    await view.frame();
    await view.frame();
    assert.equal(inputBuffers.length, 2);
    assert.equal(inputBuffers[0], inputBuffers[1]);
    assert.equal(commits, initialCommits, 'particles and frequency bars must not render the page per frame');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 70)); });
    assert.equal(commits, initialCommits, 'background color changes must not render the page');
    await act(async () => document.querySelector('audio').pause());
    assert.equal(view.frames.size, 0);
  } finally { await view.cleanup(); global.AudioContext = previousAudioContext; }
});

test('switching music playlists preserves a shared first-track audio URL', async () => {
  const MusicPage = require('../src/app/music/page.tsx').default;
  api.getMusicConfig = async () => ({ config: { music_page_config: JSON.stringify({ playlists: [
    { id: 'one', name: 'First playlist', tracks: [tracks[0]] },
    { id: 'two', name: 'Second playlist', tracks: [tracks[0]] },
  ] }) } });
  const view = await mount(MusicPage);
  try {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)); });
    const audio = document.querySelector('audio');
    assert.equal(audio.getAttribute('src'), '/audio/0.mp3');
    const selector = [...document.querySelectorAll('button')].find(button => button.textContent === 'First playlist');
    await act(async () => selector.click());
    const second = [...document.querySelectorAll('button')].find(button => button.textContent.startsWith('Second playlist'));
    await act(async () => second.click());
    assert.equal(audio.getAttribute('src'), '/audio/0.mp3', 'switching playlists must not leave a cleared audio source');
  } finally { api.getMusicConfig = getConfig; await view.cleanup(); }
});

test('music password gate uses the protected response and accepts an authorized playlist', async () => {
  const MusicPage = require('../src/app/music/page.tsx').default;
  const originalVerify = api.verifyMusicPassword;
  api.getMusicConfig = async () => ({ config: { music_password_protected: true } });
  api.verifyMusicPassword = async () => {
    api.getMusicConfig = async () => {
      const response = await getConfig();
      return { config: { ...response.config, music_password_protected: true } };
    };
  };
  const view = await mount(MusicPage);
  try {
    assert.ok(document.querySelector('input[type="password"]'));
    assert.equal(document.querySelector('audio'), null);
    const enter = [...document.querySelectorAll('button')].find(button => button.textContent === '进入音乐馆');
    await act(async () => enter.click());
    assert.equal(document.querySelector('input[type="password"]'), null);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)); });
    assert.equal(document.querySelector('audio').getAttribute('data-src'), '/audio/0.mp3');
  } finally {
    api.getMusicConfig = getConfig;
    api.verifyMusicPassword = originalVerify;
    await view.cleanup();
  }
});

test('music animation stops when hidden or reduced motion is requested', async () => {
  const MusicPage = require('../src/app/music/page.tsx').default;
  const view = await mount(MusicPage);
  try {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)); });
    await act(async () => document.querySelector('audio').dispatchEvent(new view.window.Event('play')));
    assert.ok(view.frames.size > 0);
    await act(async () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new view.window.Event('visibilitychange'));
    });
    assert.equal(view.frames.size, 0);
    await act(async () => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new view.window.Event('visibilitychange'));
    });
    assert.ok(view.frames.size > 0);
    await act(async () => {
      view.media.matches = true;
      view.media.dispatchEvent(new view.window.Event('change'));
    });
    assert.equal(view.frames.size, 0);
  } finally { await view.cleanup(); }
});

test('reading progress coalesces scroll events and recalculates on resize', async () => {
  const { ReadingProgress } = require('../src/components/ReadingProgress.tsx');
  const view = await mount(ReadingProgress);
  try {
    await view.frame();
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(view.window, 'innerHeight', { value: 1000, configurable: true });
    Object.defineProperty(view.window, 'scrollY', { value: 500, configurable: true });
    await act(async () => { for (let i = 0; i < 20; i++) view.window.dispatchEvent(new view.window.Event('scroll')); });
    assert.equal(view.frames.size, 1, 'scroll work should be coalesced into a single frame');
    await view.frame();
    const bar = document.querySelector('#root > div > div');
    assert.equal(bar.style.transform, 'scaleX(0.5)');
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 800, configurable: true });
    await act(async () => view.window.dispatchEvent(new view.window.Event('resize')));
    await view.frame();
    assert.equal(bar.style.transform, 'scaleX(0)');
  } finally { await view.cleanup(); }
});
