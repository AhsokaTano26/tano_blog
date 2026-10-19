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
  t.after(async () => { if (root) await React.act(async () => root.unmount()); element.remove(); });
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
  return element;
}

async function click(text, within = document) {
  const button = [...within.querySelectorAll('button')].find(button => button.textContent.trim() === text);
  assert.ok(button, `Missing button: ${text}`);
  await React.act(async () => button.click());
}

test('article reactions reject repeated presses while pending and expose a failed request for retry', async t => {
  prepare(t);
  t.mock.method(api, 'recordPostView', async () => ({ reactions: { '👍': 2 }, user_emojis: [] }));
  const pending = [];
  t.mock.method(api, 'togglePostReaction', () => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  await mount(t, { slug: 'post', initialData: { post: article } });
  const thumb = () => [...document.querySelectorAll('article button')].find(button => button.textContent === '👍2');
  try {
    await React.act(async () => { thumb().click(); thumb().click(); });
    assert.equal(pending.length, 1, 'one pending emoji must not send two toggle requests');
    assert.equal(thumb().disabled, true);
    await React.act(async () => pending[0].reject(new Error('操作太频繁，请稍后再试')));
    assert.match(document.querySelector('article [role="alert"]')?.textContent || '', /操作太频繁/);
    assert.equal(thumb().disabled, false);
    await React.act(async () => thumb().click());
    await React.act(async () => pending[1].resolve({ active: true, emoji: '👍' }));
    const selected = [...document.querySelectorAll('article [data-reaction]')].find(button => button.dataset.reaction === '👍');
    assert.equal(selected?.getAttribute('aria-pressed'), 'true');
    assert.match(selected?.textContent || '', /👍3/);
  } finally {
    await React.act(async () => pending.forEach(request => request.resolve({ active: true, emoji: '👍' })));
  }
});

test('a late initial reaction read preserves a reaction added while that read was pending', async t => {
  prepare(t);
  let completeView;
  t.mock.method(api, 'recordPostView', () => new Promise(resolve => { completeView = resolve; }));
  t.mock.method(api, 'togglePostReaction', async () => ({ active: true, emoji: '👍' }));
  await mount(t, { slug: 'post', initialData: { post: article, reactions: { '👍': 2 }, user_emojis: [] } });
  try {
    await click('👍2', document.querySelector('article'));
    await React.act(async () => completeView({ reactions: { '👍': 4 }, user_emojis: [] }));
    const reaction = [...document.querySelectorAll('article button')].find(button => button.textContent === '👍5');
    assert.equal(reaction !== undefined, true, 'late baseline data must include the visitor’s newer reaction');
    assert.equal(reaction?.getAttribute('aria-pressed'), 'true');
  } finally { await React.act(async () => completeView({ reactions: { '👍': 4 }, user_emojis: [] })); }
});

test('article sticker reactions keep their image, name, and stored key while toggling counts', async t => {
  prepare(t);
  t.mock.method(api, 'recordPostView', async () => ({ reactions: { 'bd24:01': 2 }, user_emojis: [] }));
  const submitted = [];
  t.mock.method(api, 'togglePostReaction', async (slug, emoji) => {
    submitted.push([slug, emoji]);
    return { emoji, active: submitted.length === 1 };
  });
  await mount(t, { slug: 'post', initialData: { post: article } });
  const button = () => document.querySelector('article [data-reaction="bd24:01"]');
  assert.match(button().getAttribute('aria-label'), /香澄·期待/);
  assert.equal(button().querySelector('img') !== null, true);
  await React.act(async () => button().click());
  assert.deepEqual(submitted, [['post', 'bd24:01']]);
  assert.equal(button().getAttribute('aria-pressed'), 'true');
  assert.match(button().textContent, /3$/);
  await React.act(async () => button().click());
  assert.equal(button().getAttribute('aria-pressed'), 'false');
  assert.match(button().textContent, /2$/);
});

test('comment reactions prevent duplicate requests, keep counts on failure, and can be cancelled after retry', async t => {
  prepare(t);
  t.mock.method(api, 'getComments', async () => ({ items: [comment('root')], total: 1, page: 1, size: 20 }));
  const requests = [];
  t.mock.method(api, 'toggleReaction', (slug, id, emoji) => new Promise((resolve, reject) => requests.push({ slug, id, emoji, resolve, reject })));
  await mount(t, { slug: 'post', initialData: { post: article } });
  const row = document.querySelector('[data-comment-id="root"]');
  const button = () => [...row.querySelectorAll('[data-reaction]')].find(item => item.dataset.reaction === '👍');
  try {
    await React.act(async () => { button().click(); button().click(); });
    assert.equal(requests.length, 1);
    assert.deepEqual([requests[0].slug, requests[0].id, requests[0].emoji], ['post', 'root', '👍']);
    await React.act(async () => requests[0].reject(new Error('网络不可用')));
    assert.equal(button().textContent, '👍1');
    assert.match(row.querySelector('[role="alert"]').textContent, /网络不可用/);
    await click('重试', row);
    await React.act(async () => requests[1].resolve({ active: true, emoji: '👍' }));
    assert.equal(button().textContent, '👍2');
    assert.equal(button().getAttribute('aria-pressed'), 'true');
    await React.act(async () => button().click());
    await React.act(async () => requests[2].resolve({ active: false, emoji: '👍' }));
    assert.equal(button().textContent, '👍1');
    assert.equal(button().getAttribute('aria-pressed'), 'false');
  } finally { await React.act(async () => requests.forEach(request => request.resolve({ active: false, emoji: '👍' }))); }
});

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
  assert.equal(reaction.getAttribute('aria-pressed'), 'true');
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
