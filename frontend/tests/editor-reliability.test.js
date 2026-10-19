/* eslint-disable @typescript-eslint/no-require-imports -- Node regressions reuse the TypeScript loader. */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { api } = require('../src/lib/api.ts');
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');
const PostEditor = require('../src/components/PostEditor.tsx').default;

const original = { id: 'reliable', title: 'Original title', slug: 'reliable', content: 'Original body', status: 'draft', updated_at: '2026-10-01T10:00:00Z' };

function storedDrafts() {
  return Object.keys(localStorage).filter(key => key.startsWith('post_autosave_')).map(key => ({ key, ...JSON.parse(localStorage.getItem(key)) }));
}

async function mountEditor(t, post = original, { clear = true } = {}) {
  t.mock.method(api, 'getCategories', async () => ({ items: [] }));
  t.mock.method(api, 'getTags', async () => ({ items: [] }));
  t.mock.method(api.admin.users, 'list', async () => ({ items: [] }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let mounted = true, closed = 0;
  const unmount = async () => { if (mounted) { mounted = false; await React.act(async () => root.unmount()); container.remove(); } };
  t.after(async () => { await unmount(); if (clear) localStorage.clear(); });
  await React.act(async () => root.render(React.createElement(ConfirmProvider, null,
    React.createElement(PostEditor, { post, onClose: () => { closed++; } }))));
  return { container, textarea: container.querySelector('textarea[placeholder^="输入 Markdown"]'), unmount, closed: () => closed };
}

async function click(text, container = document) {
  const scope = ['确定', '取消'].includes(text) ? document.querySelector('[role="alertdialog"]') || container : container;
  const button = [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  assert.equal(Boolean(button), true, `Missing button ${text}`);
  await React.act(async () => button.click());
}

test('draft persistence follows the last keystroke without waiting for the old 30 second interval', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await mountEditor(t);
  await React.act(async () => input(view.textarea, 'First local edit'));
  await React.act(async () => t.mock.timers.tick(500));
  await React.act(async () => input(view.textarea, 'Latest local edit'));
  await React.act(async () => t.mock.timers.tick(500));
  assert.equal(storedDrafts().length, 0);
  await React.act(async () => t.mock.timers.tick(500));
  assert.equal(storedDrafts().some(draft => draft.content === 'Latest local edit'), true);
});

for (const lifecycle of ['pagehide', 'hidden', 'unmount']) {
  test(`${lifecycle} flushes an edit before the debounce finishes`, async t => {
    const view = await mountEditor(t);
    await React.act(async () => input(view.textarea, `Unsaved at ${lifecycle}`));
    if (lifecycle === 'unmount') await view.unmount();
    else await React.act(async () => {
      if (lifecycle === 'hidden') {
        t.mock.getter(document, 'visibilityState', () => 'hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      } else window.dispatchEvent(new Event('pagehide'));
    });
    assert.equal(storedDrafts().some(draft => draft.content === `Unsaved at ${lifecycle}`), true);
  });
}

test('storage failures are visible and retry persists the current edit', async t => {
  const view = await mountEditor(t);
  const originalSet = window.Storage.prototype.setItem;
  const failure = t.mock.method(window.Storage.prototype, 'setItem', () => { throw new Error('quota'); });
  await React.act(async () => input(view.textarea, 'Must remain available'));
  await React.act(async () => window.dispatchEvent(new Event('pagehide')));
  assert.match(view.container.querySelector('[role="alert"]')?.textContent || '', /草稿.*失败|无法.*草稿/);
  failure.mock.mockImplementation(originalSet);
  await click('重试草稿保存', view.container);
  assert.equal(storedDrafts().some(draft => draft.content === 'Must remain available'), true);
  assert.equal(view.textarea.value, 'Must remain available');
});

test('two fresh editors keep independent draft bodies and both remain recoverable', async t => {
  const first = await mountEditor(t, null);
  const second = await mountEditor(t, null);
  await React.act(async () => { input(first.textarea, 'Draft from tab A'); input(second.textarea, 'Draft from tab B'); });
  await React.act(async () => window.dispatchEvent(new Event('pagehide')));
  assert.deepEqual(storedDrafts().map(draft => draft.content).sort(), ['Draft from tab A', 'Draft from tab B']);
  await first.unmount();
  await second.unmount();
  const reopened = await mountEditor(t, null);
  const choices = reopened.container.querySelectorAll('select[aria-label="选择恢复草稿"] option');
  assert.equal(choices.length, 2);
  await click('恢复', reopened.container);
  assert.equal(['Draft from tab A', 'Draft from tab B'].includes(reopened.textarea.value), true);
});

test('discarded legacy drafts are not recreated by pagehide or unmount', async t => {
  localStorage.setItem('post_autosave_new', JSON.stringify({ title: 'Legacy', content: 'Old draft', savedAt: Date.now() }));
  const view = await mountEditor(t, null);
  await click('丢弃', view.container);
  await React.act(async () => window.dispatchEvent(new Event('pagehide')));
  await view.unmount();
  assert.equal(storedDrafts().length, 0);
});

test('successful save clears only its draft and lifecycle cleanup cannot resurrect it', async t => {
  const view = await mountEditor(t);
  await React.act(async () => input(view.textarea, 'Saved body'));
  await React.act(async () => window.dispatchEvent(new Event('pagehide')));
  t.mock.method(api.admin.posts, 'update', async () => ({ post: { ...original, content: 'Saved body', updated_at: '2026-10-01T11:00:00Z' } }));
  await click('保存', view.container);
  await React.act(async () => window.dispatchEvent(new Event('pagehide')));
  await view.unmount();
  assert.equal(storedDrafts().length, 0);
  assert.equal(view.closed(), 1);
});

test('dirty editor requires confirmation to close and protects browser unload', async t => {
  const view = await mountEditor(t);
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  assert.equal(clean.defaultPrevented, false);
  await React.act(async () => input(view.textarea, 'Still editing'));
  const dirty = new Event('beforeunload', { cancelable: true });
  await React.act(async () => window.dispatchEvent(dirty));
  assert.equal(dirty.defaultPrevented, true);
  await React.act(async () => view.container.querySelector('button[title="返回列表"]').click());
  assert.equal(view.closed(), 0);
  await click('取消', view.container);
  assert.equal(view.textarea.value, 'Still editing');
  await React.act(async () => view.container.querySelector('button[title="返回列表"]').click());
  await click('确定', view.container);
  assert.equal(view.closed(), 1);
  assert.equal(storedDrafts().some(draft => draft.content === 'Still editing'), true);
});

test('a server conflict preserves local content and retries only after explicit review with the newer version', async t => {
  const view = await mountEditor(t);
  const sent = [];
  const current = { ...original, title: 'Server title', content: 'Server body', updated_at: '2026-10-01T11:00:00Z' };
  t.mock.method(global, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    return sent.length === 1
      ? Response.json({ error: 'Article changed', code: 'post_conflict', current_post: current }, { status: 409 })
      : Response.json({ post: { ...current, ...body, updated_at: '2026-10-01T12:00:00Z' } });
  });
  await React.act(async () => input(view.textarea, 'Local body to retain'));
  await click('保存', view.container);
  assert.equal(sent[0].expected_updated_at, original.updated_at);
  assert.equal(view.closed(), 0);
  assert.equal(view.textarea.value, 'Local body to retain');
  assert.match(view.container.textContent, /Server body/);
  assert.match(view.container.textContent, /Local body to retain/);
  assert.equal(storedDrafts().some(draft => draft.content === 'Local body to retain'), true);
  await click('保存', view.container);
  assert.equal(sent.length, 1, 'an unresolved conflict cannot silently retry');
  await click('确认保留本地并重试', view.container);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].expected_updated_at, current.updated_at);
  assert.equal(sent[1].content, 'Local body to retain');
});

test('loading the reviewed server version replaces all local settings and advances the baseline', async t => {
  const view = await mountEditor(t);
  const current = { ...original, title: 'Server title', content: 'Server body', slug: 'server-slug', is_top: true, allow_comment: false, updated_at: '2026-10-01T11:00:00Z' };
  let submitted;
  t.mock.method(global, 'fetch', async (_url, options) => {
    submitted = JSON.parse(options.body);
    return Response.json({ error: 'Article changed', code: 'post_conflict', current_post: current }, { status: 409 });
  });
  await React.act(async () => input(view.textarea, 'Local edit'));
  await click('保存', view.container);
  await click('载入服务器版本', view.container);
  await click('确定', view.container);
  assert.equal(view.textarea.value, 'Server body');
  await click('保存', view.container);
  assert.equal(submitted.expected_updated_at, current.updated_at);
  assert.equal(submitted.slug, 'server-slug');
  assert.equal(submitted.is_top, true);
  assert.equal(submitted.allow_comment, false);
});

test('a revision restore response becomes the next save version', async t => {
  const view = await mountEditor(t);
  t.mock.method(api.admin.posts.revisions, 'list', async () => ({ items: [{ id: 'rev', title: 'Revision', content: 'Historical', created_at: '2026-09-01T10:00:00Z' }] }));
  t.mock.method(api.admin.posts.revisions, 'restore', async () => ({ post: { ...original, content: 'Historical', updated_at: '2026-10-01T12:00:00Z' } }));
  let submitted;
  t.mock.method(api.admin.posts, 'update', async (_id, body) => { submitted = body; return { post: original }; });
  await click('历史', view.container);
  await click('恢复', view.container);
  await click('确定', view.container);
  await click('保存', view.container);
  assert.equal(submitted.expected_updated_at, '2026-10-01T12:00:00Z');
  assert.equal(submitted.content, 'Historical');
});

test('recovered drafts retain their original server version instead of adopting a newer fetched post', async t => {
  localStorage.setItem('post_autosave_reliable:older-tab', JSON.stringify({
    title: 'Recovered title', content: 'Unsubmitted work', savedAt: Date.now(), expectedUpdatedAt: original.updated_at,
  }));
  const view = await mountEditor(t, { ...original, updated_at: '2026-10-01T11:00:00Z' });
  let submitted;
  t.mock.method(global, 'fetch', async (_url, options) => {
    submitted = JSON.parse(options.body);
    return Response.json({ error: 'changed', code: 'post_conflict', current_post: { ...original, content: 'Server updated elsewhere', updated_at: '2026-10-01T11:00:00Z' } }, { status: 409 });
  });
  await click('恢复', view.container);
  await click('保存', view.container);
  assert.equal(submitted.expected_updated_at, original.updated_at);
  assert.equal(view.textarea.value, 'Unsubmitted work');
  assert.match(view.container.textContent, /Server updated elsewhere/);
});

test('a save acknowledged while typing supplies the next update version and leaves the newer draft recoverable', async t => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const sent = [];
  t.mock.method(api.admin.posts, 'update', async (_id, body) => {
    sent.push(body);
    return sent.length === 1 ? pending : { post: { ...original, updated_at: '2026-10-01T12:00:00Z' } };
  });
  const view = await mountEditor(t);
  await click('保存', view.container);
  await React.act(async () => input(view.textarea, 'Typed while waiting'));
  await React.act(async () => resolve({ post: { ...original, updated_at: '2026-10-01T11:00:00Z' } }));
  const draft = storedDrafts().find(item => item.content === 'Typed while waiting');
  assert.equal(draft?.expectedUpdatedAt, '2026-10-01T11:00:00Z');
  await click('保存', view.container);
  assert.equal(sent[1].expected_updated_at, '2026-10-01T11:00:00Z');
});

test('recovery availability does not prevent a new independent edit from flushing on exit', async t => {
  localStorage.setItem('post_autosave_new', JSON.stringify({ title: 'Older work', content: 'Older work', savedAt: Date.now() }));
  const view = await mountEditor(t, null);
  await React.act(async () => input(view.textarea, 'New independent work'));
  await view.unmount();
  assert.deepEqual(storedDrafts().map(draft => draft.content).sort(), ['New independent work', 'Older work']);
});

test('saving a recovered snapshot never removes a newer draft written by its original tab', async t => {
  const key = 'post_autosave_reliable:original-tab';
  localStorage.setItem(key, JSON.stringify({ title: 'Recovered title', content: 'Recovered work', savedAt: Date.now() }));
  const view = await mountEditor(t);
  await click('恢复', view.container);
  localStorage.setItem(key, JSON.stringify({ title: 'Still typing elsewhere', content: 'Newer work from original tab', savedAt: Date.now() }));
  t.mock.method(api.admin.posts, 'update', async () => ({ post: { ...original, updated_at: '2026-10-01T11:00:00Z' } }));
  await click('保存', view.container);
  await view.unmount();
  assert.deepEqual(storedDrafts().map(draft => draft.content), ['Newer work from original tab']);
});

test('same-tab navigation waits for confirmation and keeps the draft when cancelled', async t => {
  const view = await mountEditor(t);
  await React.act(async () => input(view.textarea, 'Before navigation'));
  const link = document.createElement('a');
  link.href = '/admin/categories';
  document.body.append(link);
  t.after(() => link.remove());
  let navigations = 0;
  link.addEventListener('click', event => { event.preventDefault(); navigations++; });
  await React.act(async () => link.click());
  assert.equal(navigations, 0);
  await click('取消', view.container);
  assert.equal(navigations, 0);
  assert.equal(view.textarea.value, 'Before navigation');
  await React.act(async () => link.click());
  await click('确定', view.container);
  assert.equal(navigations, 1);
  assert.equal(storedDrafts().some(draft => draft.content === 'Before navigation'), true);
});

test('a storage read denial remains visible and recovery can be retried after access returns', async t => {
  localStorage.setItem('post_autosave_reliable', JSON.stringify({ title: 'Blocked recovery', content: 'Recover after permission returns' }));
  const originalGet = window.Storage.prototype.getItem;
  const blocked = t.mock.method(window.Storage.prototype, 'getItem', () => { throw new window.DOMException('Denied', 'SecurityError'); });
  const view = await mountEditor(t);
  assert.match(view.container.querySelector('[role="alert"]')?.textContent || '', /草稿读取失败/);
  blocked.mock.mockImplementation(originalGet);
  await click('重试草稿保存', view.container);
  await click('恢复', view.container);
  assert.equal(view.textarea.value, 'Recover after permission returns');
});

test('a successful server save with failed local cleanup stays visible and can retry cleanup without recreating a draft', async t => {
  const view = await mountEditor(t);
  await React.act(async () => input(view.textarea, 'Server saved, cleanup pending'));
  await React.act(async () => window.dispatchEvent(new Event('pagehide')));
  const originalRemove = window.Storage.prototype.removeItem;
  const blocked = t.mock.method(window.Storage.prototype, 'removeItem', () => { throw new Error('Denied'); });
  t.mock.method(api.admin.posts, 'update', async () => ({ post: { ...original, updated_at: '2026-10-01T11:00:00Z' } }));
  await click('保存', view.container);
  assert.equal(view.closed(), 0);
  assert.match(view.container.querySelector('[role="alert"]')?.textContent || '', /草稿清理失败/);
  blocked.mock.mockImplementation(originalRemove);
  await click('重试草稿保存', view.container);
  await view.unmount();
  assert.equal(storedDrafts().length, 0);
});

test('an acknowledged save from an unmounted editor cannot close a subsequently opened editor', async t => {
  let resolve;
  t.mock.method(api.admin.posts, 'update', () => new Promise(done => { resolve = done; }));
  const view = await mountEditor(t);
  await React.act(async () => input(view.textarea, 'Submit before leaving'));
  await click('保存', view.container);
  await view.unmount();
  await React.act(async () => resolve({ post: { ...original, content: 'Submit before leaving', updated_at: '2026-10-01T11:00:00Z' } }));
  assert.equal(view.closed(), 0, 'stale completion must not invoke the parent close callback');
  assert.equal(storedDrafts().length, 0, 'the acknowledged draft can still be cleaned safely');
});

test('returning to the original body after an intervening save remains dirty and flushes that body', async t => {
  let resolve;
  t.mock.method(api.admin.posts, 'update', () => new Promise(done => { resolve = done; }));
  const view = await mountEditor(t);
  await React.act(async () => input(view.textarea, 'Submitted body B'));
  await click('保存', view.container);
  await React.act(async () => input(view.textarea, 'Newer body C'));
  await React.act(async () => resolve({ post: { ...original, content: 'Submitted body B', updated_at: '2026-10-01T11:00:00Z' } }));
  await React.act(async () => input(view.textarea, original.content));
  const unload = new Event('beforeunload', { cancelable: true });
  await React.act(async () => window.dispatchEvent(unload));
  assert.equal(unload.defaultPrevented, true, 'server now has B, so returning to original A is an unsaved edit');
  assert.deepEqual(storedDrafts().map(draft => draft.content), [original.content]);
  assert.equal(storedDrafts()[0].expectedUpdatedAt, '2026-10-01T11:00:00Z');
});

test('returning to the acknowledged submitted body is clean and removes the superseded local draft', async t => {
  let resolve;
  t.mock.method(api.admin.posts, 'update', () => new Promise(done => { resolve = done; }));
  const view = await mountEditor(t);
  await React.act(async () => input(view.textarea, 'Submitted body B'));
  await click('保存', view.container);
  await React.act(async () => input(view.textarea, 'Newer body C'));
  await React.act(async () => resolve({ post: { ...original, content: 'Submitted body B', updated_at: '2026-10-01T11:00:00Z' } }));
  assert.equal(storedDrafts().some(draft => draft.content === 'Newer body C'), true);
  await React.act(async () => input(view.textarea, 'Submitted body B'));
  const unload = new Event('beforeunload', { cancelable: true });
  await React.act(async () => window.dispatchEvent(unload));
  assert.equal(unload.defaultPrevented, false);
  await view.unmount();
  assert.equal(storedDrafts().length, 0);
});

test('undoing ordinary edits clears only the owned obsolete draft when closing', async t => {
  const view = await mountEditor(t);
  const otherKey = 'post_autosave_reliable:other-tab';
  localStorage.setItem(otherKey, JSON.stringify({ title: 'Another tab', content: 'Keep other work' }));
  await React.act(async () => input(view.textarea, 'Temporary edit'));
  await React.act(async () => window.dispatchEvent(new Event('pagehide')));
  assert.equal(storedDrafts().length, 2);
  await React.act(async () => input(view.textarea, original.content));
  await React.act(async () => view.container.querySelector('button[title="返回列表"]').click());
  assert.equal(view.closed(), 1, 'undoing all edits should not ask for confirmation');
  await view.unmount();
  assert.deepEqual(storedDrafts().map(draft => draft.content), ['Keep other work']);
});

test('a restored revision also replaces the dirty-check baseline', async t => {
  const view = await mountEditor(t);
  t.mock.method(api.admin.posts.revisions, 'list', async () => ({ items: [{ id: 'rev', title: original.title, content: 'Historical body', created_at: '2026-09-01T10:00:00Z' }] }));
  t.mock.method(api.admin.posts.revisions, 'restore', async () => ({ post: { ...original, content: 'Historical body', updated_at: '2026-10-01T12:00:00Z' } }));
  await click('历史', view.container);
  await click('恢复', view.container);
  await click('确定', view.container);
  await React.act(async () => input(view.textarea, original.content));
  const unload = new Event('beforeunload', { cancelable: true });
  await React.act(async () => window.dispatchEvent(unload));
  assert.equal(unload.defaultPrevented, true);
  assert.deepEqual(storedDrafts().map(draft => draft.content), [original.content]);
});

async function waitForHistory(predicate, message) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (predicate()) return;
    await React.act(async () => new Promise(resolve => setTimeout(resolve, 10)));
  }
  assert.equal(predicate(), true, message);
}

test('failed draft persistence keeps browser Back inside the editor until leaving is explicitly confirmed', async t => {
  const originalState = window.history.state;
  const originalURL = window.location.href;
  window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'category-tree', fixture: 'previous' }, '', '/admin/categories');
  window.history.pushState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'post-tree', fixture: 'current' }, '', '/admin/posts');
  const view = await mountEditor(t);
  t.after(() => window.history.replaceState(originalState, '', originalURL));
  t.mock.method(window.Storage.prototype, 'setItem', () => { throw new Error('quota'); });
  const routed = [];
  const routeListener = () => routed.push(window.location.pathname);
  window.addEventListener('popstate', routeListener);
  t.after(() => window.removeEventListener('popstate', routeListener));
  await React.act(async () => input(view.textarea, 'Only copy exists in editor'));
  await React.act(async () => window.history.back());
  await waitForHistory(() => [...document.querySelectorAll('[role="alertdialog"] button')].some(button => button.textContent.trim() === '确定'), 'Back must ask before losing an unsaved draft');
  assert.equal(window.location.pathname, '/admin/posts');
  assert.equal(window.history.state?.__NA, true);
  assert.equal(window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE, 'post-tree');
  assert.equal(view.textarea.value, 'Only copy exists in editor');
  assert.equal(routed.length, 0, 'the router must not receive the intercepted base/sentinel traversals');
  await click('取消', view.container);
  assert.equal(window.location.pathname, '/admin/posts');
  await React.act(async () => window.history.back());
  await waitForHistory(() => [...document.querySelectorAll('[role="alertdialog"] button')].some(button => button.textContent.trim() === '确定'), 'a second Back must remain protected');
  await click('确定', view.container);
  await waitForHistory(() => window.location.pathname === '/admin/categories', 'approved Back should reach the original previous page');
  assert.deepEqual(routed, ['/admin/categories']);
  assert.equal(window.history.state?.fixture, 'previous');
  assert.equal(window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE, 'category-tree');
});

test('cleaning a draft releases its history guard without routing or dropping Next state', async t => {
  const originalState = window.history.state;
  const originalURL = window.location.href;
  const initial = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'preserved-tree', fixture: 'editor-base' };
  window.history.replaceState(initial, '', '/admin/posts');
  const view = await mountEditor(t);
  t.after(() => window.history.replaceState(originalState, '', originalURL));
  let routed = 0;
  const routeListener = () => { routed++; };
  window.addEventListener('popstate', routeListener);
  t.after(() => window.removeEventListener('popstate', routeListener));
  await React.act(async () => input(view.textarea, 'Temporary history guard'));
  await React.act(async () => input(view.textarea, original.content));
  await waitForHistory(() => JSON.stringify(window.history.state) === JSON.stringify(initial), 'cleaning must return to the original base state');
  assert.equal(window.location.pathname, '/admin/posts');
  assert.equal(routed, 0);
  await view.unmount();
  assert.deepEqual(window.history.state, initial);
});

test('editing again during clean-history cleanup re-arms protection before the next Back', async t => {
  const originalState = window.history.state;
  const originalURL = window.location.href;
  window.history.replaceState({ __NA: true, fixture: 'previous-race' }, '', '/admin/categories');
  window.history.pushState({ __NA: true, fixture: 'current-race' }, '', '/admin/posts');
  const view = await mountEditor(t);
  t.after(() => window.history.replaceState(originalState, '', originalURL));
  t.mock.method(window.Storage.prototype, 'setItem', () => { throw new Error('quota'); });
  const nativeBack = window.history.back.bind(window.history);
  let cleanupRequested = false;
  const back = t.mock.method(window.history, 'back', () => { cleanupRequested = true; });
  await React.act(async () => input(view.textarea, 'Temporary first edit'));
  const firstGuard = window.history.state?.__tanoPostEditorGuard?.id;
  await React.act(async () => input(view.textarea, original.content));
  assert.equal(cleanupRequested, true, 'undo must start removing its own guard');
  await React.act(async () => input(view.textarea, 'New edits during pending cleanup'));
  back.mock.mockImplementation(nativeBack);
  await React.act(async () => nativeBack());
  await waitForHistory(() => Boolean(window.history.state?.__tanoPostEditorGuard?.id && window.history.state.__tanoPostEditorGuard.id !== firstGuard), 'new edits must receive a new guard when cleanup settles');
  await React.act(async () => nativeBack());
  await waitForHistory(() => [...document.querySelectorAll('[role="alertdialog"] button')].some(button => button.textContent.trim() === '确定'), 'Back must protect edits made during cleanup');
  assert.equal(window.location.pathname, '/admin/posts');
  assert.equal(window.history.state?.fixture, 'current-race');
  assert.equal(view.textarea.value, 'New edits during pending cleanup');
  await click('取消', view.container);
});
