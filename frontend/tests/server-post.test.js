/* eslint-disable @typescript-eslint/no-require-imports -- Node tests reuse the TypeScript loader. */
require('./load-typescript.js');
const Module = require('node:module');
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === 'server-only') return {};
  if (request === 'next/headers') return { cookies: async () => ({ toString: () => 'jwt=current-request' }) };
  return load.call(this, request, ...args);
};
const test = require('node:test');
const assert = require('node:assert/strict');

test('server article requests forward each request cookie without a shared cache or redirect', async t => {
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url: String(url), ...options });
    return Response.json({ post: { title: options.headers.Cookie, content: 'Private body' } });
  });
  const { fetchServerPost } = require('../src/lib/server-post.ts');
  const first = await fetchServerPost('article', 'jwt=first');
  const second = await fetchServerPost('article', 'post_access_article=second');
  assert.equal(first.post.title, 'jwt=first');
  assert.equal(second.post.title, 'post_access_article=second');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.cache === 'no-store' && call.redirect === 'error'));
  assert.ok(calls.every(call => call.headers['X-Render-Request'] === '1'));
  assert.ok(calls.every(call => !Object.keys(call.headers).some(key => key.toLowerCase().includes('forwarded'))));
});

test('server article time budget includes reading the response body', async t => {
  t.mock.method(global, 'fetch', async (_url, options) => ({
    ok: true,
    json: () => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
  }));
  const { fetchServerPost } = require('../src/lib/server-post.ts');
  await assert.rejects(fetchServerPost('article', '', 15), /aborted/);
});

test('server article preserves the upstream status for not-found handling', async t => {
  t.mock.method(global, 'fetch', async () => Response.json({ error: 'not found' }, { status: 404 }));
  const { fetchServerPost } = require('../src/lib/server-post.ts');
  await assert.rejects(fetchServerPost('draft', ''), error => error.status === 404);
});

test('article server route returns initial data and article metadata without exposing content in metadata', async t => {
  require('./dom-setup.js');
  const { default: Page, generateMetadata } = require('../src/app/posts/[slug]/page.tsx');
  t.mock.method(global, 'fetch', async () => Response.json({ post: { id: 'post', slug: 'post', title: 'Article title', excerpt: 'Article summary', content: 'Private content', status: 'draft' } }));
  const props = { params: Promise.resolve({ slug: 'post' }) };
  const page = await Page(props);
  assert.equal(page.props.initialData.post.content, 'Private content');
  assert.equal(page.props.slug, 'post');
  const metadata = await generateMetadata(props);
  assert.equal(metadata.title, 'Article title');
  assert.equal(metadata.description, 'Article summary');
  assert.equal(metadata.openGraph.title, 'Article title');
  assert.equal(metadata.robots.index, false);
  assert.equal(JSON.stringify(metadata).includes('Private content'), false);
});

test('article server route turns upstream failures into a retryable initial state', async t => {
  require('./dom-setup.js');
  const { default: Page } = require('../src/app/posts/[slug]/page.tsx');
  t.mock.method(global, 'fetch', async () => { throw new Error('upstream unavailable'); });
  const page = await Page({ params: Promise.resolve({ slug: 'post' }) });
  assert.equal(page.props.initialData, null);
  assert.match(page.props.initialError, /重试/);
});

test('only an explicit SSR identity response requests an automatic browser fallback', async t => {
  require('./dom-setup.js');
  const { default: Page } = require('../src/app/posts/[slug]/page.tsx');
  let status = 409;
  t.mock.method(global, 'fetch', async () => Response.json({ error: 'Browser identity required' }, { status }));
  const props = { params: Promise.resolve({ slug: 'post' }) };
  assert.equal((await Page(props)).props.initialRetry, true);
  status = 403;
  assert.equal((await Page(props)).props.initialRetry, false);
});
