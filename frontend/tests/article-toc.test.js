/* eslint-disable @typescript-eslint/no-require-imports -- Node regressions reuse the TypeScript loader. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');

async function mount(t, markup = '<h2 id="intro">开始</h2><h3 id="detail">细节</h3><h2 id="end">结语</h2>', desktop = true) {
  const { ArticleToc } = require('../src/components/ArticleToc.tsx');
  const content = document.createElement('div');
  content.innerHTML = markup;
  document.body.append(content);
  let scroll = 0;
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scroll });
  content.getBoundingClientRect = () => ({ top: 300 - scroll, bottom: 2700 - scroll, height: 2400 });
  [...content.querySelectorAll('h2,h3,h4,h5,h6')].forEach((heading, index) => {
    heading.getBoundingClientRect = () => ({ top: 350 + index * 700 - scroll, bottom: 380 + index * 700 - scroll, height: 30 });
  });
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = query => ({ matches: query.includes('min-width') ? desktop : true, addEventListener() {}, removeEventListener() {} });
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  t.after(async () => {
    await React.act(async () => root.unmount());
    content.remove(); element.remove();
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0, writable: true });
    window.history.replaceState(null, '', '/admin/posts');
  });
  const flush = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  await React.act(async () => root.render(React.createElement(ArticleToc, { contentRef: { current: content }, contentKey: markup })));
  await flush();
  return { element, content, flush, async scrollTo(value) { scroll = value; window.dispatchEvent(new Event('scroll')); await flush(); } };
}

test('article directory omits footnotes without reserving space for an empty article', async t => {
  const view = await mount(t, '<p>No headings</p><section data-footnotes><h2 id="footnote-label">Footnotes</h2></section>');
  assert.equal(view.element.querySelector('aside') === null, true);
});

test('directory expands for keyboard users, closes on Escape and supports an explicit click toggle', async t => {
  const { element } = await mount(t, undefined, false);
  const toggle = element.querySelector('button[aria-controls]');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  await React.act(async () => toggle.focus());
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  await React.act(async () => toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  await React.act(async () => toggle.click());
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  await React.act(async () => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('desktop starts with the directory and only folds into the rail while pointing at the article', async t => {
  const view = await mount(t);
  const aside = view.element.querySelector('aside');
  assert.equal(aside.getAttribute('data-expanded'), 'true');
  await React.act(async () => view.content.dispatchEvent(new MouseEvent('pointerenter')));
  assert.equal(aside.getAttribute('data-expanded'), 'false');
  await React.act(async () => view.content.dispatchEvent(new MouseEvent('pointerleave')));
  assert.equal(aside.getAttribute('data-expanded'), 'true');
});

test('directory tracks the current section between headings, while scrolling in either direction', async t => {
  const view = await mount(t);
  const active = () => view.element.querySelector('a[aria-current="location"]')?.getAttribute('href');
  await view.scrollTo(1200);
  assert.equal(active(), '#end');
  await view.scrollTo(600);
  assert.equal(active(), '#detail', 'the first visible heading leads the directory, as on the reference');
  await view.scrollTo(1800);
  assert.equal(active(), '#end');
  await view.scrollTo(2700 - window.innerHeight);
  assert.equal(view.element.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '100');
  await view.scrollTo(3200);
  assert.equal(view.element.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '100', 'comments do not add to article progress');
  await view.scrollTo(0);
  assert.equal(view.element.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '0');
});

test('reading progress maps the visible article to the rail rather than the sticky-header offset', async t => {
  const view = await mount(t);
  await view.scrollTo(400);
  const expected = Math.floor((400 + Math.min(400, window.innerHeight) - 300) / 2400 * 100);
  assert.equal(Number(view.element.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')), expected);
});

test('deep heading links preserve the fragment, move focus to content and honor reduced motion', async t => {
  const view = await mount(t, '<h2 id="intro">开始</h2><h4 id="deep">深入</h4><h6 id="deepest">最深</h6>');
  const requests = [];
  view.content.querySelector('#deepest').scrollIntoView = options => requests.push(options);
  await React.act(async () => view.element.querySelector('button[aria-controls]').click());
  const link = view.element.querySelector('a[href="#deepest"]');
  assert.equal(link !== null, true);
  await React.act(async () => link.click());
  await view.flush();
  assert.equal(window.location.hash, '#deepest');
  assert.equal(document.activeElement === view.content.querySelector('#deepest'), true);
  assert.equal(requests.at(-1)?.behavior, 'instant');
});

test('late article layout changes recalibrate progress without losing the current chapter', async t => {
  const view = await mount(t);
  await view.scrollTo(1200);
  const before = Number(view.element.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'));
  view.content.getBoundingClientRect = () => ({ top: 300 - window.scrollY, bottom: 5100 - window.scrollY, height: 4800 });
  window.dispatchEvent(new Event('resize'));
  await view.flush();
  assert.equal(view.element.querySelector('a[aria-current="location"]')?.getAttribute('href'), '#end');
  assert.equal(Number(view.element.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')) < before, true);
});
