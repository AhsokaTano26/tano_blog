/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests reuse the TypeScript loader. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot, hydrateRoot } = require('react-dom/client');
const { renderToString } = require('react-dom/server');
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const { api } = require('../src/lib/api.ts');

const article = { id: 'post', slug: 'post', title: 'Server article', content: '# Visible body\n\nInitial text.', status: 'published', series: [{ slug: 'series', name: 'Series' }] };
const comment = (id, children = [], total = children.length) => ({ id, nickname: `Author ${id}`, content: `Comment ${id}`, created_at: '2026-10-01T12:00:00Z', children, children_total: total, reactions: { '👍': 1 }, user_emojis: [] });

function prepare(t) {
  t.mock.method(api, 'getMe', async () => { throw new Error('anonymous'); });
  t.mock.method(api, 'getPublicConfig', async () => ({ config: {} }));
  t.mock.method(api, 'getAdjacentPosts', async () => ({ prev: null, next: null }));
  t.mock.method(api, 'getRelatedPosts', async () => ({ items: [] }));
  t.mock.method(api, 'getSeriesProgress', async () => ({ position: 25, total: 50 }));
  t.mock.method(api, 'getComments', async () => ({ items: [], total: 0, page: 1, size: 20 }));
  t.mock.method(api, 'recordPostView', async () => ({ reactions: {}, user_emojis: [] }));
}

async function mount(t, props, hydrate = false, strict = false) {
  const PostClient = require('../src/app/posts/[slug]/PostClient.tsx').default;
  const element = document.createElement('div');
  document.body.append(element);
  const client = React.createElement(PostClient, props);
  const tree = React.createElement(AppRouterContext.Provider, { value: { push() {}, replace() {}, refresh() {}, prefetch() {} } }, strict ? React.createElement(React.StrictMode, null, client) : client);
  let root;
  if (hydrate) {
    const browserWindow = global.window;
    try {
      delete global.window;
      element.innerHTML = renderToString(tree);
    } finally { global.window = browserWindow; }
    assert.equal(element.querySelector('h1#visible-body')?.textContent, 'Visible body');
    assert.equal(Boolean(element.querySelector('h1#visible-body').closest('.reveal')), false);
    const hydrationErrors = [];
    await React.act(async () => { root = hydrateRoot(element, tree, { onRecoverableError: error => hydrationErrors.push(error.message) }); });
    assert.deepEqual(hydrationErrors, []);
  } else {
    root = createRoot(element);
    await React.act(async () => root.render(tree));
  }
  t.after(async () => { await React.act(async () => root.unmount()); element.remove(); });
  return element;
}

async function click(text, within = document) {
  const button = [...within.querySelectorAll('button')].find(button => button.textContent.trim() === text);
  assert.ok(button, `Missing button: ${text}`);
  await React.act(async () => button.click());
}

test('article hydration keeps server content visible without fetching the article or entire series again', async t => {
  prepare(t);
  let postRequests = 0, seriesRequests = 0;
  t.mock.method(api, 'getPost', async () => { postRequests++; return { post: article }; });
  t.mock.method(api, 'getSeriesBySlug', async () => { seriesRequests++; return { series: {} }; });
  const view = await mount(t, { slug: 'post', initialData: { post: article } }, true);
  assert.equal(postRequests, 0);
  assert.equal(seriesRequests, 0);
  assert.match(view.textContent, /25.*50/);
});

test('failed server article load offers a working browser retry', async t => {
  prepare(t);
  t.mock.method(api, 'getPost', async () => ({ post: article }));
  await mount(t, { slug: 'post', initialData: null, initialError: '文章暂时无法加载，请重试' });
  assert.match(document.querySelector('[role="alert"]').textContent, /文章暂时无法加载/);
  await click('重试');
  assert.equal(document.querySelector('h1#visible-body')?.textContent, 'Visible body');
});

test('root comments and nested replies page independently, retry failures, and preserve reactions', async t => {
  prepare(t);
  const calls = [];
  let fail = true;
  t.mock.method(api, 'getComments', async (slug, sort, params = {}) => {
    calls.push({ ...params });
    const page = Number(params.page || 1);
    if (params.parent_id === 'root') {
      if (fail) throw new Error('回复暂时不可用');
      return { items: [comment('reply11', [], 1)], total: 11, page, size: 10 };
    }
    if (params.parent_id === 'reply11') return { items: [comment('nested')], total: 1, page, size: 10 };
    return { items: page === 1 ? [comment('root', Array.from({ length: 10 }, (_, i) => comment(`reply${i + 1}`)), 11)] : [comment('second')], total: 2, page, size: 1 };
  });
  t.mock.method(api, 'toggleReaction', async () => ({ active: true, emoji: '👍' }));
  await mount(t, { slug: 'post', initialData: { post: article } });
  await click('加载更多');
  assert.match(document.body.textContent, /Comment second/);
  await click('加载更多回复');
  assert.match(document.body.textContent, /回复暂时不可用/);
  fail = false;
  await click('重试');
  assert.match(document.body.textContent, /Comment reply11/);
  await click('加载更多回复');
  assert.match(document.body.textContent, /Comment nested/);
  const nested = [...document.querySelectorAll('[data-comment-id]')].find(node => node.dataset.commentId === 'nested');
  await click('👍1', nested);
  assert.match(nested.textContent, /👍2/);
  assert.equal(calls.filter(call => call.parent_id === 'root').length, 2);
  assert.ok(calls.filter(call => call.parent_id === 'root').every(call => call.page === '2' && call.page_size === '10'));
});

test('refreshing comments after submission includes newly returned replies', async t => {
  prepare(t);
  let reads = 0;
  t.mock.method(api, 'getComments', async () => ({ items: [comment('root', ++reads === 1 ? [comment('first')] : [comment('first'), comment('new')])], total: 1, page: 1, size: 20 }));
  t.mock.method(api, 'createComment', async () => ({}));
  await mount(t, { slug: 'post', initialData: { post: article } });
  await React.act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.match(document.body.textContent, /Comment new/);
});

test('SSR identity fallback performs one client read even in StrictMode and stops after a forbidden response', async t => {
  prepare(t);
  let reads = 0;
  t.mock.method(api, 'getPost', async () => { reads++; throw new Error('禁止访问'); });
  await mount(t, { slug: 'post', initialData: null, initialRetry: true, initialError: '文章暂时无法加载，请重试' }, false, true);
  assert.equal(reads, 1);
  assert.match(document.querySelector('[role="alert"]').textContent, /禁止访问/);
});

test('server-rendered article records one browser view and restores visitor reactions', async t => {
  prepare(t);
  let views = 0;
  t.mock.method(api, 'recordPostView', async () => { views++; return { reactions: { '👍': 3 }, user_emojis: ['👍'] }; });
  await mount(t, { slug: 'post', initialData: { post: article } }, false, true);
  assert.equal(views, 1);
  const reaction = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '👍3');
  assert.ok(reaction);
  assert.equal(reaction.style.background, 'var(--primary-sub)');
});

test('reply pages keep chronological ordering when root comments are sorted newest first', async t => {
  prepare(t);
  t.mock.method(api, 'getComments', async (_slug, sort, params = {}) => {
    if (params.parent_id) return { items: [comment(sort === 'oldest' ? 'reply11' : 'reply1')], total: 11, page: 2, size: 10 };
    return { items: [comment('root', Array.from({ length: 10 }, (_, i) => comment(`reply${i + 1}`)), 11)], total: 1, page: 1, size: 20 };
  });
  await mount(t, { slug: 'post', initialData: { post: article } });
  await click('最新');
  await click('加载更多回复');
  assert.ok(document.querySelector('[data-comment-id="reply11"]'));
});
