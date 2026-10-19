/* eslint-disable @typescript-eslint/no-require-imports -- Node regressions reuse the TypeScript loader. */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { api } = require('../src/lib/api.ts');
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');
const PostEditor = require('../src/components/PostEditor.tsx').default;
const { findImageInContent } = require('../src/lib/article-image.ts');
const { alignSelection, selectionAlignment } = require('../src/lib/editor-alignment.ts');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function mountEditor(t, content = 'Saved A', isNew = false, overrides = {}) {
  t.mock.method(api, 'getCategories', async () => ({ items: [] }));
  t.mock.method(api, 'getTags', async () => ({ items: [] }));
  t.mock.method(api.admin.users, 'list', async () => ({ items: [] }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let closed = 0;
  t.after(async () => { await React.act(async () => root.unmount()); container.remove(); localStorage.clear(); });
  const post = { ...(isNew ? {} : { id: 'saved-id' }), title: 'Title', slug: 'article', content, status: 'draft', ...overrides };
  await React.act(async () => root.render(React.createElement(ConfirmProvider, null,
    React.createElement(PostEditor, { post, onClose: () => { closed++; } }))));
  return { container, textarea: container.querySelector('textarea[placeholder^="输入 Markdown"]'), closed: () => closed };
}

async function click(text, container = document) {
  const button = [...container.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  assert.equal(Boolean(button), true, `Missing button ${text}`);
  await React.act(async () => button.click());
}

async function openSettings(view) {
  await React.act(async () => view.container.querySelector('button[title="文章详情与设置"]').click());
}

test('a pending save preserves newer body edits and their recoverable draft', async t => {
  const pending = deferred();
  t.mock.method(api.admin.posts, 'update', () => pending.promise);
  const view = await mountEditor(t);
  await click('保存', view.container);
  await React.act(async () => input(view.textarea, 'Newer B'));
  await React.act(async () => pending.resolve({ post: { id: 'saved-id' } }));
  assert.equal(view.closed(), 0, 'newer edits must keep the editor open');
  assert.equal(view.textarea.value, 'Newer B');
  const draftKey = Object.keys(localStorage).find(key => key.startsWith('post_autosave_saved-id:'));
  assert.equal(JSON.parse(localStorage.getItem(draftKey)).content, 'Newer B');
});

test('a pending save keeps an open settings dialog and its uncommitted edits available', async t => {
  const pending = deferred();
  t.mock.method(api.admin.posts, 'update', () => pending.promise);
  const view = await mountEditor(t);
  await click('保存', view.container);
  await openSettings(view);
  await React.act(async () => input(view.container.querySelector('input[placeholder="输入作者名称"]'), 'Uncommitted author B'));
  await React.act(async () => pending.resolve({ post: { id: 'saved-id', status: 'draft' } }));
  assert.equal(view.closed(), 0, 'uncommitted dialog work must keep the editor open');
  assert.equal(view.container.querySelector('input[placeholder="输入作者名称"]')?.value, 'Uncommitted author B');
});

test('keyboard saves do not submit another request while a save is pending', async t => {
  const pending = deferred();
  let requests = 0;
  t.mock.method(api.admin.posts, 'update', () => { requests++; return pending.promise; });
  const view = await mountEditor(t);
  const saveKey = () => view.textarea.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }));
  await React.act(async () => { saveKey(); saveKey(); });
  assert.equal(requests, 1);
  await React.act(async () => pending.resolve({ post: { id: 'saved-id' } }));
});

test('saving newer edits after a pending create updates the newly saved article', async t => {
  const pending = deferred();
  let creates = 0;
  const updates = [];
  t.mock.method(api.admin.posts, 'create', () => { creates++; return pending.promise; });
  t.mock.method(api.admin.posts, 'update', async (id, body) => { updates.push({ id, body }); return { post: { id } }; });
  const view = await mountEditor(t, 'Created A', true);
  await click('保存', view.container);
  await React.act(async () => input(view.textarea, 'Newer B'));
  await React.act(async () => pending.resolve({ post: { id: 'new-id' } }));
  await click('保存', view.container);
  assert.equal(creates, 1, 'the second save cannot create a duplicate');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'new-id');
  assert.equal(updates[0].body.content, 'Newer B');
});

for (const isNew of [false, true]) {
  test(`saved password baseline lets a subsequent ${isNew ? 'created' : 'updated'} article save remove its newly enabled password`, async t => {
    const pending = deferred(), updates = [];
    t.mock.method(api.admin.posts, 'create', () => pending.promise);
    t.mock.method(api.admin.posts, 'update', (_id, body) => {
      updates.push(body);
      return !isNew && updates.length === 1 ? pending.promise : Promise.resolve({ post: { id: 'saved-id' } });
    });
    const view = await mountEditor(t, 'Saved A', isNew);
    await openSettings(view);
    await React.act(async () => input(view.container.querySelector('input[type="password"]'), 'Secret A'));
    await click('保存设置', view.container);
    await click('保存', view.container);
    await React.act(async () => input(view.textarea, 'Newer body B'));
    await React.act(async () => pending.resolve({ post: { id: 'saved-id', status: 'draft' } }));
    await openSettings(view);
    const clear = [...view.container.querySelectorAll('button')].find(node => node.textContent.trim() === '清除密码');
    if (clear) await React.act(async () => clear.click());
    else await React.act(async () => input(view.container.querySelector('input[type="password"]'), ''));
    await click('保存设置', view.container);
    await click('保存', view.container);
    assert.equal(updates.at(-1).password, '', 'the server password saved by A must be removable by B');
    assert.equal(updates.at(-1).content, 'Newer body B');
  });
}

test('saved password baseline preserves an explicit password removal made while enabling it is pending', async t => {
  const pending = deferred(), updates = [];
  t.mock.method(api.admin.posts, 'update', (_id, body) => {
    updates.push(body);
    return updates.length === 1 ? pending.promise : Promise.resolve({ post: { id: 'saved-id' } });
  });
  const view = await mountEditor(t);
  await openSettings(view);
  await React.act(async () => input(view.container.querySelector('input[type="password"]'), 'Secret A'));
  await click('保存设置', view.container);
  await click('保存', view.container);
  await openSettings(view);
  await React.act(async () => input(view.container.querySelector('input[type="password"]'), ''));
  await click('保存设置', view.container);
  await React.act(async () => pending.resolve({ post: { id: 'saved-id', status: 'draft' } }));
  await click('保存', view.container);
  assert.equal(updates[1].password, '');
});

test('saved creation time baseline permits reverting a saved timestamp while newer edits remain open', async t => {
  const pending = deferred(), updates = [];
  const original = '2026-10-01T12:00:00Z', changed = '2026-10-02T12:00:00Z';
  const { toDateTimeLocal } = require('../src/lib/post-settings.ts');
  t.mock.method(api.admin.posts, 'update', (_id, body) => {
    updates.push(body);
    return updates.length === 1 ? pending.promise : Promise.resolve({ post: { id: 'saved-id', created_at: original } });
  });
  const view = await mountEditor(t, 'Saved A', false, { created_at: original });
  const detailsTab = [...view.container.querySelectorAll('button')].find(button => button.textContent.trim() === '详情' && !button.hasAttribute('title'));
  assert.equal(Boolean(detailsTab), true);
  await React.act(async () => detailsTab.click());
  const creationInput = [...view.container.querySelectorAll('input[type="datetime-local"]')]
    .find(element => element.parentElement.querySelector('p')?.textContent === '创建时间');
  assert.equal(Boolean(creationInput), true, 'use the creation-time control in the sidebar');
  await React.act(async () => input(creationInput, toDateTimeLocal(changed)));
  assert.equal(creationInput.value, toDateTimeLocal(changed));
  await click('保存', view.container);
  assert.equal(updates[0].created_at, '2026-10-02T12:00:00.000Z', 'the date edit must reach the first save before testing the baseline');
  await React.act(async () => input(view.textarea, 'Newer B'));
  await React.act(async () => pending.resolve({ post: { id: 'saved-id', created_at: changed } }));
  await React.act(async () => input(creationInput, toDateTimeLocal(original)));
  await click('保存', view.container);
  assert.equal(updates[1].created_at, '2026-10-01T12:00:00.000Z');
});

for (const chooseDraft of [false, true]) {
  test(`saved publish status ${chooseDraft ? 'preserves a newer explicit draft choice' : 'carries into the next body save'}`, async t => {
    const pending = deferred(), updates = [];
    t.mock.method(api.admin.posts, 'update', (_id, body) => {
      updates.push(body);
      return updates.length === 1 ? pending.promise : Promise.resolve({ post: { id: 'saved-id' } });
    });
    const view = await mountEditor(t);
    await click('发布', view.container);
    await React.act(async () => input(view.textarea, 'Newer body B'));
    if (chooseDraft) {
      await openSettings(view);
      await click('草稿', view.container);
      await click('保存设置', view.container);
    }
    await React.act(async () => pending.resolve({ post: { id: 'saved-id', status: 'published' } }));
    await click('保存', view.container);
    assert.equal(updates[1].status, chooseDraft ? 'draft' : 'published');
  });
}

test('raw image edit replaces its source and preserves decoded attributes', async t => {
  const content = '<a href="/read?a=1&amp;b=2"><img src="/photo.png?a=1&amp;b=2" alt="A &amp; B" width="320" height="160" /></a>';
  const view = await mountEditor(t, content);
  await React.act(async () => view.container.querySelector('img').click());
  assert.equal(view.container.querySelector('input[placeholder="图片描述"]').value, 'A & B');
  assert.equal(view.container.querySelector('input[placeholder="100%"]')?.value, '320');
  assert.equal(view.container.querySelector('input[placeholder="auto"]')?.value, '160');
  assert.equal(view.container.querySelector('input[placeholder="点击图片跳转的 URL"]')?.value, '/read?a=1&b=2');
  await React.act(async () => input(view.container.querySelector('input[placeholder="图片描述"]'), 'Edited'));
  await click('确认', view.container);
  assert.equal((view.textarea.value.match(/<img\b/g) || []).length, 1);
  assert.match(view.textarea.value, /alt="Edited"/);
  assert.equal(view.textarea.value.includes('amp;amp;'), false);
});

test('clicking a repeated Markdown image edits the clicked source occurrence', async t => {
  const view = await mountEditor(t, '![First](/same.png)\n\n![Second](/same.png)');
  await React.act(async () => view.container.querySelectorAll('img')[1].click());
  assert.equal(view.container.querySelector('input[placeholder="图片描述"]').value, 'Second');
  await React.act(async () => input(view.container.querySelector('input[placeholder="图片描述"]'), 'Edited second'));
  await click('确认', view.container);
  assert.equal(view.textarea.value.startsWith('![First](/same.png)'), true);
  assert.equal(view.textarea.value.includes('![Second]'), false);
  assert.match(view.textarea.value, /alt="Edited second"/);
});

test('editing an image preserves its reference-style link destination and replaces the complete wrapper', async t => {
  const view = await mountEditor(t, '[![Photo](/photo.png)][target]\n\n[target]: /read?a=1&amp;b=2');
  await React.act(async () => view.container.querySelector('img').click());
  assert.equal(view.container.querySelector('input[placeholder="点击图片跳转的 URL"]')?.value, '/read?a=1&b=2');
  await React.act(async () => input(view.container.querySelector('input[placeholder="图片描述"]'), 'Edited'));
  await click('确认', view.container);
  assert.equal(view.textarea.value.includes('][target]'), false);
  assert.equal((view.textarea.value.match(/<img\b/g) || []).length, 1);
  assert.match(view.textarea.value, /href="\/read\?a=1&amp;b=2"/);
});

for (const [name, content] of [
  ['Markdown link around raw HTML image', '[<img src="/photo.png" alt="A" />](/read)'],
  ['HTML link around Markdown image', '<a href="/read">![A](/photo.png)</a>'],
]) {
  test(`mixed image wrapper editing preserves a ${name}`, async t => {
    const view = await mountEditor(t, content);
    await React.act(async () => view.container.querySelector('img').click());
    assert.equal(view.container.querySelector('input[placeholder="点击图片跳转的 URL"]')?.value, '/read');
    await React.act(async () => input(view.container.querySelector('input[placeholder="图片描述"]'), 'Edited A'));
    await click('确认', view.container);
    assert.equal(view.textarea.value.trim().startsWith('<figure'), true, 'replace the complete linked image wrapper');
    assert.equal(view.textarea.value.trim().endsWith('</figure>'), true);
    assert.equal((view.textarea.value.match(/<img\b/g) || []).length, 1);
    assert.equal((view.textarea.value.match(/<a\b/g) || []).length, 1);
    assert.match(view.textarea.value, /href="\/read"/);
    assert.match(view.textarea.value, /alt="Edited A"/);
  });
}

test('an image dialog refuses to replace a source range changed while it was open', async t => {
  const view = await mountEditor(t, '![Photo](/photo.png)');
  await React.act(async () => view.container.querySelector('img').click());
  await React.act(async () => input(view.textarea, 'Replacement text written while dialog is open'));
  await click('确认', view.container);
  assert.equal(view.textarea.value, 'Replacement text written while dialog is open');
  assert.match(view.container.textContent, /图片.*变化|重新.*图片/);
});

test('an image dialog cannot switch identity when an identical image is inserted before its source', async t => {
  const imageSource = '![Photo](/photo.png)';
  const view = await mountEditor(t, imageSource);
  await React.act(async () => view.container.querySelector('img').click());
  await React.act(async () => input(view.container.querySelector('input[placeholder="图片描述"]'), 'Changed original'));
  const newerContent = `${imageSource}\n\n${imageSource}`;
  await React.act(async () => input(view.textarea, newerContent));
  await click('确认', view.container);
  assert.equal(view.textarea.value, newerContent, 'a matching substring alone cannot establish the original image identity');
});

test('an image missing from the current source cannot become an insertion dialog', async t => {
  const view = await mountEditor(t, '![Photo](/photo.png)');
  const image = view.container.querySelector('img');
  image.setAttribute('data-markdown-src', '/missing.png');
  await React.act(async () => image.click());
  assert.equal(view.container.querySelector('input[placeholder="输入图片地址"]') === null, true);
  assert.equal(view.textarea.value, '![Photo](/photo.png)');
});

test('clicking a stale deferred preview cannot select a newly inserted identical image', async t => {
  const imageSource = '![Photo](/photo.png)';
  const view = await mountEditor(t, imageSource);
  const image = view.container.querySelector('img');
  await React.act(async () => {
    flushSync(() => input(view.textarea, `${imageSource}\n\n${imageSource}`));
    image.click();
  });
  assert.equal(view.container.querySelector('input[placeholder="输入图片地址"]') === null, true);
});

test('image lookup can locate raw escaped URLs by exact source position', () => {
  const content = '<img src="/same.png?a=1&amp;b=2" alt="First" />\n\n<img src="/same.png?a=1&amp;b=2" alt="Second" />';
  const start = content.lastIndexOf('<img');
  const found = findImageInContent(content, '/same.png?a=1&b=2', { start, end: content.length });
  assert.equal(Boolean(found), true);
  assert.equal(found.start, start);
  assert.equal(found.attrs.alt, 'Second');
});

test('raw image source positions account for Markdown container prefixes on preceding lines', () => {
  const content = '> <figure>\n> <img src="/quoted.png" alt="Quoted" />\n> </figure>';
  const start = content.indexOf('<img');
  const end = content.indexOf('/>', start) + 2;
  const found = findImageInContent(content, '/quoted.png', { start, end });
  assert.equal(Boolean(found), true);
  assert.equal(found.attrs.alt, 'Quoted');
});

for (const [name, content] of [
  ['inline code', '`<div style="text-align: center;">literal</div>`'],
  ['indented code', '    <div style="text-align: center;">literal</div>'],
  ['HTML comment', '<!-- <div style="text-align: center;">literal</div> -->'],
]) {
  test(`alignment preserves ${name} literals and does not report them as active formatting`, () => {
    const caret = content.indexOf('literal');
    assert.equal(selectionAlignment(content, caret), 'left');
    const result = alignSelection(content, caret, caret + 7, 'right');
    assert.equal(result.content.includes(content), true);
    assert.equal(result.content.slice(result.start, result.end), 'literal');
  });
}

test('alignment keeps nested code literals while updating a real wrapper and its selection', () => {
  const content = '<div style="text-align: center;">\n\nText `<div style="text-align: left;">literal</div>`\n\n</div>';
  const start = content.indexOf('Text');
  const end = content.indexOf('\n\n</div>');
  const result = alignSelection(content, start, end, 'right');
  assert.equal(result.content.slice(result.start, result.end), content.slice(start, end));
  assert.equal(result.content.startsWith('<div style="text-align: right;">'), true);
  assert.equal(result.content.includes('`<div style="text-align: left;">literal</div>`'), true);
});

test('alignment updates the style attribute without modifying HTML attribute examples', () => {
  const content = '<div title="Example text-align: left;" style="text-align: center;">\n\nActual text\n\n</div>';
  const caret = content.indexOf('Actual');
  const result = alignSelection(content, caret, caret, 'right');
  assert.equal(result.content.includes('title="Example text-align: left;"'), true);
  assert.equal(result.content.includes('style="text-align: right;"'), true);
  assert.equal(selectionAlignment(result.content, result.start), 'right');
});

for (const content of [
  '$<div style="text-align: center;">literal</div>$',
  '$$\n<div style="text-align: center;">literal</div>\n$$',
]) {
  test(`math literal classification preserves HTML-looking ${content.startsWith('$$') ? 'block' : 'inline'} math`, () => {
    const caret = content.indexOf('literal');
    assert.equal(selectionAlignment(content, caret), 'left');
    const result = alignSelection(content, caret, caret + 7, 'right');
    assert.equal(result.content.includes(content), true);
    assert.equal(result.content.slice(result.start, result.end), 'literal');
  });
}

test('alignment selection skips Markdown parsing when the content has no div tags', t => {
  const source = require('../src/lib/editor-markdown-source.ts');
  const calls = t.mock.method(source, 'htmlSourceTags');
  const content = '# Plain document\n\nParagraph with **formatting** and ![Photo](/photo.png).\n\n<span>Inline HTML</span>';
  assert.equal(selectionAlignment(content, content.indexOf('Paragraph')), 'left');
  assert.equal(selectionAlignment(content, content.indexOf('Inline')), 'left');
  assert.equal(calls.mock.callCount(), 0);
});

test('alignment selection reuses only the latest content ranges while honoring uppercase div tags', t => {
  const source = require('../src/lib/editor-markdown-source.ts');
  const calls = t.mock.method(source, 'htmlSourceTags');
  const first = '<DIV STYLE="text-align: center;">\n\nUnique cached alpha paragraph\n\n</DIV>';
  const second = '<div style="text-align: right;">\n\nUnique cached beta paragraph\n\n</div>';
  const firstCaret = first.indexOf('alpha'), secondCaret = second.indexOf('beta');
  assert.equal(selectionAlignment(first, firstCaret), 'center');
  assert.equal(selectionAlignment(first, firstCaret + 1), 'center');
  assert.equal(selectionAlignment(first, firstCaret + 2), 'center');
  assert.equal(calls.mock.callCount(), 1, 'selection movement on the same content reuses parsed ranges');
  assert.equal(selectionAlignment(second, secondCaret), 'right');
  assert.equal(calls.mock.callCount(), 2);
  assert.equal(selectionAlignment(first, firstCaret), 'center');
  assert.equal(calls.mock.callCount(), 3, 'returning to an older content parses it again rather than growing the cache');
});
