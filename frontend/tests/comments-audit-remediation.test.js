/* eslint-disable @typescript-eslint/no-require-imports -- Node regressions reuse the TypeScript loader. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');
const { api } = require('../src/lib/api.ts');
const AdminComments = require('../src/app/admin/comments/page.tsx').default;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function mount(t, component) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await React.act(async () => root.unmount()); container.remove(); });
  await React.act(async () => root.render(component));
  return container;
}

async function click(text, within = document) {
  const button = [...within.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  assert.equal(Boolean(button), true, `Missing button ${text}`);
  await React.act(async () => button.click());
}

const item = (id, status = 'pending') => ({ id, nickname: id, content: `Body ${id}`, status, created_at: '2026-10-01T12:00:00Z' });

test('a stale admin comment response cannot replace the current rows count or selection', async t => {
  const old = deferred();
  t.mock.method(api.admin.comments, 'list', params => params.status === 'approved'
    ? Promise.resolve({ items: [item('current', 'approved')], total: 1 }) : old.promise);
  const view = await mount(t, React.createElement(ConfirmProvider, null, React.createElement(AdminComments)));
  await click('已批准', view);
  const select = view.querySelector('svg.lucide-square')?.closest('button');
  assert.equal(Boolean(select), true);
  await React.act(async () => select.click());
  assert.match(view.textContent, /已选 1 条/);
  await React.act(async () => old.resolve({ items: [item('stale')], total: 77 }));
  assert.match(view.textContent, /Body current/);
  assert.equal(view.textContent.includes('Body stale'), false);
  assert.equal(view.textContent.includes('共 77 条'), false);
  assert.match(view.textContent, /已选 1 条/);
});

test('a stale failed comment request cannot finish the latest request loading state', async t => {
  const old = deferred(), latest = deferred();
  t.mock.method(api.admin.comments, 'list', params => params.status === 'approved' ? latest.promise : old.promise);
  const view = await mount(t, React.createElement(ConfirmProvider, null, React.createElement(AdminComments)));
  await click('已批准', view);
  await React.act(async () => old.reject(new Error('stale error')));
  assert.equal(view.textContent.includes('暂无评论'), false, 'latest request remains in progress');
  assert.equal(view.textContent.includes('stale error'), false);
  await React.act(async () => latest.resolve({ items: [item('current', 'approved')], total: 1 }));
  assert.match(view.textContent, /Body current/);
});

test('the latest admin comment error is visible and clears after a successful request', async t => {
  t.mock.method(api.admin.comments, 'list', async params => {
    if (!params.status) throw new Error('Current list unavailable');
    return { items: [item('current', 'approved')], total: 1 };
  });
  const view = await mount(t, React.createElement(ConfirmProvider, null, React.createElement(AdminComments)));
  assert.match(view.querySelector('[role="alert"]')?.textContent || '', /Current list unavailable/);
  await click('已批准', view);
  assert.equal(view.querySelector('[role="alert"]') === null, true);
  assert.match(view.textContent, /Body current/);
});

test('a delayed comment mutation reloads the current tab rather than its original filter', async t => {
  const mutation = deferred();
  const requests = [];
  t.mock.method(api.admin.comments, 'updateStatus', () => mutation.promise);
  t.mock.method(api.admin.comments, 'list', async params => {
    requests.push({ ...params });
    return { items: [item(params.status === 'approved' ? 'current' : 'original', params.status || 'pending')], total: 1 };
  });
  const view = await mount(t, React.createElement(ConfirmProvider, null, React.createElement(AdminComments)));
  await React.act(async () => view.querySelector('button[aria-label="批准评论"]').click());
  await click('已批准', view);
  assert.match(view.textContent, /Body current/);
  await React.act(async () => mutation.resolve({}));
  assert.match(view.textContent, /Body current/);
  assert.equal(view.textContent.includes('Body original'), false);
  assert.equal(requests.at(-1).status, 'approved');
});

test('global comment disable preserves visible prior comments and prevents submission', async t => {
  t.mock.method(api, 'getMe', async () => { throw new Error('anonymous'); });
  t.mock.method(api, 'getPublicConfig', async () => ({ config: { comment_enabled: 'false' } }));
  t.mock.method(api, 'getAdjacentPosts', async () => ({ prev: null, next: null }));
  t.mock.method(api, 'getRelatedPosts', async () => ({ items: [] }));
  t.mock.method(api, 'getComments', async () => ({ items: [item('existing', 'approved')], total: 1, page: 1, size: 20 }));
  t.mock.method(api, 'recordPostView', async () => ({ reactions: {}, user_emojis: [] }));
  let submitted = 0;
  t.mock.method(api, 'createComment', async () => { submitted++; return {}; });
  const PostClient = require('../src/app/posts/[slug]/PostClient.tsx').default;
  const view = await mount(t, React.createElement(AppRouterContext.Provider,
    { value: { push() {}, replace() {}, refresh() {}, prefetch() {} } },
    React.createElement(PostClient, { slug: 'article', initialData: { post: {
      id: 'article', slug: 'article', title: 'Article', content: 'Body', status: 'published', allow_comment: true,
    } } })));
  assert.match(view.textContent, /Body existing/);
  assert.match(view.textContent, /评论.*关闭|暂停.*评论/);
  const submit = view.querySelector('button[type="submit"]');
  assert.equal(submit === null || submit.disabled, true);
  const form = view.querySelector('form');
  if (form) await React.act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(submitted, 0);
});
