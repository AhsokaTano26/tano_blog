/* eslint-disable @typescript-eslint/no-require-imports -- Node tests reuse the project's TypeScript compiler. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { renderToStaticMarkup } = require('react-dom/server');
const Module = require('node:module');
global.self = window;
global.Node = window.Node;
global.Element = window.Element;
global.IntersectionObserver.prototype.unobserve = () => {};
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'server-only') return {};
  return originalLoad.call(this, request, ...args);
};
const { api } = require('../src/lib/api.ts');
const originalFetch = global.fetch;
const post = { id: 'p1', slug: 'first', title: 'Initial server article', excerpt: 'Already available before hydration.' };
const initialData = {
  posts: { items: [post], total: 30 },
  categories: [{ id: 'c1', slug: 'code', name: 'Coding' }],
  tags: [{ id: 't1', slug: 'react', name: 'React', post_count: 3 }],
  series: [], profile: { profile_name: 'Initial profile' },
};
const initialQuery = { page: 2, category: '', tag: '' };

async function mount(Component, props) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Component, props)));
  return { container, root, async cleanup() { await act(async () => root.unmount()); container.remove(); } };
}

test('home server render fetches initial public data concurrently without forwarding identity', async () => {
  const Home = require('../src/app/page.tsx').default;
  const pending = [];
  global.fetch = (url, options) => new Promise(resolve => pending.push({ url: String(url), options, resolve }));
  try {
    const render = Home({ searchParams: Promise.resolve({ page: '2', category: 'code' }) });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(pending.length, 5, 'all independent data requests should start together');
    for (const request of pending) {
      const url = new URL(request.url);
      assert.equal(url.origin, process.env.API_UPSTREAM_URL || 'http://localhost:8080');
      assert.equal(request.options.cache, 'no-store');
      const headers = new Headers(request.options.headers);
      assert.equal(headers.has('cookie'), false);
      assert.equal(headers.has('authorization'), false);
      assert.equal(headers.has('x-forwarded-for'), false);
      const body = url.pathname.endsWith('/posts') ? initialData.posts
        : url.pathname.endsWith('/public') ? { config: initialData.profile }
        : { items: initialData[url.pathname.split('/').at(-1)] };
      if (url.pathname.endsWith('/posts')) {
        assert.equal(url.searchParams.get('page'), '2');
        assert.equal(url.searchParams.get('category'), 'code');
      }
      request.resolve(Response.json(body));
    }
    const element = await render;
    const html = renderToStaticMarkup(element);
    assert.match(html, /Initial server article/);
    assert.match(html, /Initial profile/);
  } finally { global.fetch = originalFetch; }
});

test('public server requests time out and reject unsuccessful responses', async () => {
  const { fetchPublicApi } = require('../src/lib/server-api.ts');
  try {
    global.fetch = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    await assert.rejects(fetchPublicApi('/api/v1/posts', undefined, 10));
    global.fetch = async () => Response.json({ error: 'offline' }, { status: 503 });
    await assert.rejects(fetchPublicApi('/api/v1/posts'), /503/);
  } finally { global.fetch = originalFetch; }
});

test('home query validation normalizes invalid pages and repeated parameters', () => {
  const { parseHomeQuery } = require('../src/lib/home-data.ts');
  for (const page of ['-1', '0', '1.5', 'Infinity', 'not-a-page', '9007199254740992']) {
    assert.equal(parseHomeQuery({ page }).page, 1);
  }
  assert.deepEqual(parseHomeQuery({ page: ['3', '9'], category: ['code', 'other'], tag: 'react' }), {
    page: 3, category: 'code', tag: 'react',
  });
});

test('home hydration reuses initial data and only requests posts when filters or pages change', async () => {
  const HomeClient = require('../src/components/HomeClient.tsx').default;
  const calls = [];
  api.getPosts = async params => { calls.push(['posts', params]); return initialData.posts; };
  for (const [name, key] of [['getCategories', 'categories'], ['getTags', 'tags'], ['getSeries', 'series']]) {
    api[name] = async () => { calls.push([key]); return { items: initialData[key] }; };
  }
  api.getPublicConfig = async () => { calls.push(['profile']); return { config: initialData.profile }; };
  api.getPostCalendar = async () => ({ items: [] });
  window.history.replaceState({}, '', '/?page=2');
  const view = await mount(HomeClient, { initialData, initialQuery });
  try {
    assert.deepEqual(calls, [], 'hydration must not refetch any seeded data, including TagCloud');
    assert.ok(view.container.querySelector('h2'));
    assert.equal(view.container.querySelector('h2').closest('.reveal') === null, true, 'the first server article must be visible before scroll effects run');
    const category = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Coding');
    await act(async () => category.click());
    assert.deepEqual(calls, [['posts', { page: '1', page_size: '10', category: 'code' }]]);
    assert.equal(new URL(window.location.href).searchParams.get('category'), 'code');
    const pageTwo = [...view.container.querySelectorAll('main button')].find(button => button.textContent === '2');
    await act(async () => pageTwo.click());
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], ['posts', { page: '2', page_size: '10', category: 'code' }]);
    assert.equal(new URL(window.location.href).searchParams.get('page'), '2');
    window.history.replaceState({}, '', '/?page=3&tag=react');
    await act(async () => window.dispatchEvent(new window.PopStateEvent('popstate')));
    assert.deepEqual(calls[2], ['posts', { page: '3', page_size: '10', tag: 'react' }]);
  } finally { await view.cleanup(); }
});

test('clearing a pending filter restores loaded posts and ignores a late filtered response', async () => {
  const HomeClient = require('../src/components/HomeClient.tsx').default;
  let resolvePosts;
  api.getPosts = () => new Promise(resolve => { resolvePosts = resolve; });
  const view = await mount(HomeClient, { initialData, initialQuery: { ...initialQuery, page: 1 } });
  try {
    const category = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Coding');
    await act(async () => category.click());
    const clear = [...view.container.querySelectorAll('button')].find(button => button.textContent === '清除筛选');
    await act(async () => clear.click());
    assert.equal(view.container.querySelector('h2')?.textContent, post.title, 'clearing a pending filter must not leave the loading state stuck');
    await act(async () => resolvePosts({ items: [{ ...post, title: 'Stale filtered article' }], total: 1 }));
    assert.equal(view.container.querySelector('h2').textContent, post.title);
  } finally { await view.cleanup(); }
});

test('failed initial requests fall back to client fetches without repeating successful metadata', async () => {
  const HomeClient = require('../src/components/HomeClient.tsx').default;
  const calls = [];
  api.getPosts = async params => { calls.push(['posts', params]); return initialData.posts; };
  api.getCategories = async () => { calls.push(['categories']); return { items: [] }; };
  api.getTags = async () => { calls.push(['tags']); return { items: initialData.tags }; };
  api.getSeries = async () => { calls.push(['series']); return { items: [] }; };
  api.getPublicConfig = async () => { calls.push(['profile']); return { config: {} }; };
  const view = await mount(HomeClient, { initialQuery, initialData: { ...initialData, posts: undefined, tags: undefined } });
  try {
    assert.equal(view.container.querySelector('h2').textContent, post.title);
    assert.deepEqual(calls.map(call => call[0]).sort(), ['posts', 'tags']);
  } finally { await view.cleanup(); }
});

test('footer injection reads refreshed public config instead of a permanent component cache', async () => {
  const { FooterInjection } = require('../src/components/HtmlInjection.tsx');
  api.getPublicConfig = async () => ({ config: { footer_injection: '<p>Before update</p>' } });
  const first = await mount(FooterInjection);
  assert.match(first.container.textContent, /Before update/);
  await first.cleanup();
  api.getPublicConfig = async () => ({ config: { footer_injection: '<p>After update</p>' } });
  const second = await mount(FooterInjection);
  try { assert.match(second.container.textContent, /After update/); }
  finally { await second.cleanup(); }
});

test('about config and article count requests start independently', async () => {
  const About = require('../src/app/about/page.tsx').default;
  let resolveConfig;
  let postRequests = 0;
  api.getAboutConfig = () => new Promise(resolve => { resolveConfig = resolve; });
  api.getPosts = async () => { postRequests++; return { items: [], total: 30 }; };
  const view = await mount(About);
  try {
    assert.equal(postRequests, 1, 'article count must not wait for config');
  } finally {
    await act(async () => resolveConfig({ config: initialData.profile }));
    await view.cleanup();
  }
});
