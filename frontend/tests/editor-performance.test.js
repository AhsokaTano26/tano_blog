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
  assert.ok(document.querySelector('button[title="编辑"]'));
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
  await act(async () => document.querySelector('button[title="编辑"]').click());
  return document.querySelector('textarea[placeholder^="输入 Markdown"]');
}

test('opening an editor fetches its full content from a summary-only post list', async t => {
  const textarea = await mountEditor(t, '# Full article\n\nDetails omitted from the list.');
  assert.equal(textarea?.value, '# Full article\n\nDetails omitted from the list.');
});

test('post settings derive the excerpt from the fetched full article', async t => {
  await mountPostList(t, 'Content used for the automatic excerpt.');
  await act(async () => document.querySelector('button[title="设置"]').click());
  assert.match(document.body.textContent, /Content used for the automatic excerpt\./);
});

test('a failed detail request leaves the list available without opening an empty editor', async t => {
  await mountPostList(t, '# Article', () => Response.json({ error: '读取正文失败' }, { status: 500 }));
  await act(async () => document.querySelector('button[title="编辑"]').click());
  assert.equal(Boolean(document.querySelector('textarea[placeholder^="输入 Markdown"]')), false);
  assert.equal(document.querySelector('[role="alert"]')?.textContent, '读取正文失败');
  assert.ok(document.querySelector('button[title="编辑"]'));
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
  const toggle = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '分屏');
  await act(async () => toggle.click());
  await act(async () => toggle.click());
  assert.equal(Boolean(document.querySelector('h1#heading')), false);
  assert.equal(textarea.value, '# Heading\n\n$E = mc^2$');
  const katex = require('katex');
  const calls = t.mock.method(katex, 'renderToString');
  await act(async () => input(textarea, '# Changed while hidden\n\n$x^2$'));
  assert.equal(calls.mock.callCount(), 0);
  await act(async () => toggle.click());
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
  const toggle = document.querySelector('button[title="切换编辑/预览模式"]');
  await act(async () => toggle.click());
  await act(async () => toggle.click());
  textarea.scrollTop = 750;
  await act(async () => toggle.click());
  const preview = document.querySelector('h1#heading').closest('.overflow-y-auto');
  assert.equal(preview.scrollTop, 1250);
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
