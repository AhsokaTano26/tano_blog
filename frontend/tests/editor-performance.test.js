/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests use the CommonJS TypeScript loader. */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { act } = React;
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');
const AdminPosts = require('../src/app/admin/posts/page.tsx').default;

test('opening the post list does not load the editor or Markdown parser', async t => {
  await mountPostList(t);
  assert.ok(document.querySelector('button[data-tooltip="编辑"]'));
  assert.equal(Boolean(require.cache[require.resolve('../src/components/PostEditor.tsx')]), false);
  assert.equal(Boolean(require.cache[require.resolve('react-markdown')]), false);
});

async function mountPostList(t, content = '# Heading\n\n$E = mc^2$', detailResponse) {
  const post = { id: 'post-1', slug: 'post-1', title: 'Existing post', content, status: 'draft' };
  const { content: _content, ...summary } = post;
  t.mock.method(global, 'fetch', async url => {
    if (String(url).endsWith('/admin/posts/post-1')) {
      return detailResponse ? detailResponse() : Response.json({ post });
    }
    return Response.json({ items: String(url).includes('/admin/posts') ? [summary] : [], total: 1 });
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });
  await act(async () => root.render(React.createElement(ConfirmProvider, null, React.createElement(AdminPosts))));
}

async function mountEditor(t, content = '# Heading\n\n$E = mc^2$') {
  await mountPostList(t, content);
  await act(async () => document.querySelector('button[data-tooltip="编辑"]').click());
  return document.querySelector('textarea[placeholder^="输入 Markdown"]');
}

test('alignment buttons format the current paragraph, switch without nesting, and persist Markdown', async t => {
  const textarea = await mountEditor(t, 'Intro\n\n**Bold** paragraph\n\nTail');
  const button = title => document.querySelector(`button[data-tooltip="${title}"]`);
  assert.equal(Boolean(button('居中')), true, 'the editor needs a center alignment button');
  textarea.focus();
  textarea.setSelectionRange(16, 16);
  await act(async () => button('居中').click());
  assert.match(textarea.value, /Intro\n\n<div style="text-align: center;">\n\n\*\*Bold\*\* paragraph\n\n<\/div>\n\nTail/);
  assert.equal(document.querySelector('div[style*="text-align: center"] p strong')?.textContent, 'Bold');
  await act(async () => button('右对齐').click());
  assert.equal((textarea.value.match(/<div/g) || []).length, 1);
  assert.match(textarea.value, /text-align: right/);
  await act(async () => button('左对齐').click());
  assert.match(textarea.value, /text-align: left/);
  const { api } = require('../src/lib/api.ts');
  let saved;
  t.mock.method(api.admin.posts, 'update', async (_id, body) => { saved = body; return {}; });
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '保存').click());
  assert.equal(saved.content, textarea.value);
});

test('opening an editor fetches its full content from a summary-only post list', async t => {
  const textarea = await mountEditor(t, '# Full article\n\nDetails omitted from the list.');
  assert.equal(textarea?.value, '# Full article\n\nDetails omitted from the list.');
});

test('post settings derive the excerpt from the fetched full article', async t => {
  await mountPostList(t, 'Content used for the automatic excerpt.');
  await act(async () => document.querySelector('button[data-tooltip="设置"]').click());
  assert.match(document.body.textContent, /Content used for the automatic excerpt\./);
});

test('a failed detail request leaves the list available without opening an empty editor', async t => {
  await mountPostList(t, '# Article', () => Response.json({ error: '读取正文失败' }, { status: 500 }));
  await act(async () => document.querySelector('button[data-tooltip="编辑"]').click());
  assert.equal(Boolean(document.querySelector('textarea[placeholder^="输入 Markdown"]')), false);
  assert.match(document.querySelector('[role="alert"]')?.textContent || '', /读取正文失败.*HTTP 500/);
  assert.ok(document.querySelector('button[data-tooltip="编辑"]'));
});

test('changing editor metadata does not parse the article again', async t => {
  await mountEditor(t);
  const katex = require('katex');
  const render = katex.renderToString;
  const calls = t.mock.method(katex, 'renderToString', function (...args) { return render.apply(this, args); });
  await act(async () => input(document.querySelector('input[placeholder="请输入标题"]'), 'Changed title'));
  assert.equal(document.querySelector('h1#heading')?.textContent, 'Heading');
  assert.equal(calls.mock.callCount(), 0);
});

test('edit-only mode unmounts the preview while preserving textarea content', async t => {
  const textarea = await mountEditor(t);
  const modes = document.querySelector('[aria-label="编辑器视图"]');
  const edit = [...modes.querySelectorAll('button')].find(button => button.textContent === '编辑');
  const split = [...modes.querySelectorAll('button')].find(button => button.textContent === '分屏');
  await act(async () => edit.click());
  assert.equal(Boolean(document.querySelector('h1#heading')), false);
  assert.equal(textarea.value, '# Heading\n\n$E = mc^2$');
  const katex = require('katex');
  const calls = t.mock.method(katex, 'renderToString');
  await act(async () => input(textarea, '# Changed while hidden\n\n$x^2$'));
  assert.equal(calls.mock.callCount(), 0);
  await act(async () => split.click());
  assert.equal(document.querySelector('h1#changed-while-hidden')?.textContent, 'Changed while hidden');
});

test('typing updates the editor before the expensive preview render', async t => {
  const textarea = await mountEditor(t);
  await act(async () => {
    flushSync(() => input(textarea, '# New heading\n\n$y^2$'));
    assert.equal(textarea.value, '# New heading\n\n$y^2$');
    assert.equal(document.querySelector('h1#heading')?.textContent, 'Heading');
  });
  assert.equal(document.querySelector('h1#new-heading')?.textContent, 'New heading');
});

test('typing a fenced code block into the mounted editor keeps the editor and highlighted preview usable', async t => {
  const textarea = await mountEditor(t, '# Before code');
  const content = '# Before code\n\n```js\nconst answer = 42;\n```';
  await act(async () => input(textarea, content));
  assert.equal(textarea.isConnected, true);
  assert.equal(textarea.value, content);
  assert.equal(document.querySelector('pre code.language-js')?.textContent, 'const answer = 42;\n');
  assert.ok(document.querySelector('code.language-js .hljs-keyword'));
  await act(async () => input(textarea, content + '\n\nStill editing'));
  assert.ok([...document.querySelectorAll('p')].some(paragraph => paragraph.textContent === 'Still editing'));
});

test('returning from edit-only mode restores the preview scroll ratio', async t => {
  t.mock.getter(window.Element.prototype, 'scrollHeight', function () {
    return this instanceof HTMLTextAreaElement ? 2000 : 3000;
  });
  t.mock.getter(window.Element.prototype, 'clientHeight', () => 500);
  const textarea = await mountEditor(t);
  const modes = document.querySelector('[aria-label="编辑器视图"]');
  const edit = [...modes.querySelectorAll('button')].find(button => button.textContent === '编辑');
  const split = [...modes.querySelectorAll('button')].find(button => button.textContent === '分屏');
  await act(async () => edit.click());
  textarea.scrollTop = 750;
  await act(async () => split.click());
  await act(async () => new Promise(resolve => requestAnimationFrame(resolve)));
  const preview = document.querySelector('h1#heading').closest('.overflow-y-auto');
  assert.equal(preview.scrollTop, 1250);
});

test('split scrolling follows source blocks in both directions and recalibrates after a tall image loads', async t => {
  const frames = new Map();
  let sequence = 0;
  t.mock.method(global, 'requestAnimationFrame', callback => { frames.set(++sequence, callback); return sequence; });
  t.mock.method(global, 'cancelAnimationFrame', id => frames.delete(id));
  const resizeObservers = [];
  const OriginalResizeObserver = global.ResizeObserver;
  global.ResizeObserver = class {
    constructor(callback) { this.callback = callback; resizeObservers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  t.after(() => { global.ResizeObserver = OriginalResizeObserver; });
  async function flushFrames() {
    await act(async () => {
      for (let count = 0; frames.size && count < 10; count++) {
        const pending = [...frames.values()];
        frames.clear();
        for (const callback of pending) callback();
      }
    });
    assert.equal(frames.size, 0, 'scroll synchronization must settle');
  }
  const textarea = await mountEditor(t, '# Heading\n\nBefore\n\n![Tall](/tall.png)\n\nAfter\n\nEnd');
  const preview = document.querySelector('h1#heading').closest('.overflow-y-auto');
  Object.defineProperties(textarea, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 200, configurable: true } });
  Object.defineProperties(preview, { scrollHeight: { value: 3000, configurable: true }, clientHeight: { value: 200, configurable: true } });
  let afterTop = 1400;
  const rect = (top, height = 20) => ({ top, bottom: top + height, left: 0, right: 400, width: 400, height, x: 0, y: top });
  t.mock.method(window.HTMLElement.prototype, 'getBoundingClientRect', function () {
    if (this === preview) return rect(100, 200);
    if (this.closest('[aria-label="文章预览"]') || this.hasAttribute('data-source-start')) {
      const top = this.matches('h1') ? 0 : this.textContent === 'Before' ? 70 : this.querySelector('img, [role="img"]') ? 110 : this.textContent === 'After' ? afterTop : afterTop + 100;
      return rect(100 + top - preview.scrollTop, this.querySelector('img') ? afterTop - 150 : 20);
    }
    return rect(0);
  });
  const originalRangeRect = window.Range.prototype.getBoundingClientRect;
  window.Range.prototype.getBoundingClientRect = function () {
    const y = this.startContainer.textContent.slice(0, this.startOffset).split('\n').length * 20 - 20;
    return rect(y);
  };
  t.after(() => { window.Range.prototype.getBoundingClientRect = originalRangeRect; });
  await act(async () => {
    for (const observer of resizeObservers) observer.callback([]);
  });
  await flushFrames();
  textarea.scrollTop = 120; // source line "After", immediately after a tall image
  await act(async () => textarea.dispatchEvent(new Event('scroll')));
  await flushFrames();
  assert.equal(preview.scrollTop, 1400, 'source blocks must override the inaccurate whole-document ratio');
  // Native programmatic scroll events must not bounce back into the editor.
  await act(async () => preview.dispatchEvent(new Event('scroll')));
  await flushFrames();
  assert.equal(textarea.scrollTop, 120);
  // The image decodes after the scroll; keep the same source paragraph visible.
  afterTop = 2000;
  await act(async () => document.querySelector('img[src="/tall.png"]').dispatchEvent(new Event('load')));
  await flushFrames();
  assert.equal(preview.scrollTop, 2000);
  await act(async () => preview.dispatchEvent(new Event('scroll')));
  await flushFrames();
  preview.scrollTop = 2100; // "End" in the preview
  await act(async () => preview.dispatchEvent(new Event('scroll')));
  await flushFrames();
  assert.equal(textarea.scrollTop, 160, 'preview scrolling must find the matching source block');
  assert.equal(resizeObservers.length > 0, true);
  afterTop = 800;
  await act(async () => document.querySelector('img[src="/tall.png"]').dispatchEvent(new Event('error')));
  await flushFrames();
  assert.equal(preview.scrollTop, 900, 'a failed image must also recalibrate without moving the source');
  assert.equal(textarea.scrollTop, 160);
  assert.equal(Boolean(document.querySelector('[role="img"][aria-label*="加载失败"]')), true);
  // mountEditor registered its cleanup first; these checks run after unmount.
  t.after(() => {
    assert.equal(resizeObservers.every(observer => observer.disconnected), true);
    assert.equal(frames.size, 0, 'unmount cancels pending synchronization work');
  });
});

test('preview clicks still open the image and gallery editors', async t => {
  const { generateGalleryHtml, createDefaultGalleryAttrs } = require('../src/lib/gallery.ts');
  const gallery = createDefaultGalleryAttrs(2);
  gallery.images[0].url = '/gallery.png';
  await mountEditor(t, `<img src="/photo.png" alt="Photo" width="320" />\n\n${generateGalleryHtml(gallery)}`);
  await act(async () => document.querySelector('img[src="/photo.png"]').click());
  assert.equal([...document.querySelectorAll('h2')].some(heading => heading.textContent === '编辑图片'), true);
  assert.equal(document.querySelector('input[placeholder="输入图片地址"]').value, '/photo.png');
  const cancel = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '取消');
  await act(async () => cancel.click());
  await act(async () => document.querySelector('img[src="/gallery.png"]').click());
  assert.equal([...document.querySelectorAll('h2')].some(heading => heading.textContent === '图片画廊'), true);
  assert.equal(document.querySelector('input[placeholder="输入图片地址"]').value, '/gallery.png');
});

test('typing after deleting an upload placeholder keeps the caret at the new character', async t => {
  const textarea = await mountEditor(t, 'Start ');
  const { api } = require('../src/lib/api.ts');
  let finishUpload;
  t.mock.method(api.admin.media, 'upload', () => new Promise(resolve => { finishUpload = resolve; }));
  textarea.focus();
  textarea.setSelectionRange(6, 6);
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: {
    files: [new File(['image'], 'photo.png', { type: 'image/png' })], items: [],
  } });
  await act(async () => textarea.dispatchEvent(paste));
  assert.match(textarea.value, /<!-- upload:/);
  await act(async () => input(textarea, 'Start continued'));
  textarea.setSelectionRange(15, 15);
  await act(async () => finishUpload({ media: { url: '/uploads/photo.png' } }));
  await act(async () => input(textarea, 'Start continued!'));
  assert.equal(textarea.value, 'Start continued!');
  assert.equal(textarea.selectionStart, 16);
  assert.equal(textarea.selectionEnd, 16);
});

test('compact editor uses one pane and preserves content when switching preview and desktop split', async t => {
  const original = window.matchMedia;
  const listeners = new Set();
  const query = { matches: true, addEventListener: (_event, callback) => listeners.add(callback), removeEventListener: (_event, callback) => listeners.delete(callback) };
  window.matchMedia = () => query;
  t.after(() => { window.matchMedia = original; });
  const textarea = await mountEditor(t, '# Mobile draft');
  const mode = name => [...document.querySelectorAll('[aria-label="编辑器视图"] button')].find(button => button.textContent === name);
  assert.equal(Boolean(mode('分屏')), false);
  assert.equal(document.querySelector('[aria-label="文章预览"]') === null, true);
  await act(async () => mode('预览').click());
  assert.equal(document.querySelector('h1#mobile-draft')?.textContent, 'Mobile draft');
  await act(async () => mode('编辑').click());
  assert.equal(textarea.value, '# Mobile draft');
  await act(async () => { query.matches = false; listeners.forEach(callback => callback()); });
  await act(async () => mode('分屏').click());
  assert.equal(mode('分屏').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('h1#mobile-draft')?.textContent, 'Mobile draft');
});

test('advanced formatting remains available without changing the current article', async t => {
  const textarea = await mountEditor(t, 'Keep this content');
  assert.equal(document.querySelector('button[data-tooltip="行内公式"]') === null, true);
  await act(async () => document.querySelector('[aria-label="更多格式工具"]').click());
  assert.equal(Boolean(document.querySelector('button[data-tooltip="行内公式"]')), true);
  assert.equal(Boolean(document.querySelector('button[data-tooltip="提示块：Note"]')), true);
  await act(async () => document.querySelector('[aria-label="收起更多工具"]').click());
  assert.equal(textarea.value, 'Keep this content');
});
