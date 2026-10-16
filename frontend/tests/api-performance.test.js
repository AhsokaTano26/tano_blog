/* eslint-disable @typescript-eslint/no-require-imports */
require('./load-typescript.js');
const test = require('node:test');
const assert = require('node:assert/strict');

function freshAPI() {
  delete require.cache[require.resolve('../src/lib/api.ts')];
  return require('../src/lib/api.ts').api;
}

test('anonymous article auth failure rejects promptly without redirecting', async (t) => {
  t.mock.method(global, 'fetch', async () => new Response('{"error":"unauthorized"}', { status: 401 }));
  global.window = { location: { pathname: '/posts/example', href: '/posts/example' } };
  t.after(() => { delete global.window; });
  const api = freshAPI();
  const result = await Promise.race([
    api.getMe().then(() => 'resolved', () => 'rejected'),
    new Promise(resolve => setTimeout(() => resolve('pending'), 50)),
  ]);
  assert.equal(result, 'rejected');
  assert.equal(window.location.href, '/posts/example');
});

test('admin session expiry redirects and still settles the request', async (t) => {
  t.mock.method(global, 'fetch', async () => new Response('{}', { status: 401 }));
  global.window = { location: { pathname: '/admin/posts', href: '/admin/posts' } };
  t.after(() => { delete global.window; });
  const result = await Promise.race([
    freshAPI().getMe().then(() => 'resolved', () => 'rejected'),
    new Promise(resolve => setTimeout(() => resolve('pending'), 50)),
  ]);
  assert.equal(result, 'rejected');
  assert.equal(window.location.href, '/admin/login');
});

test('concurrent public config consumers share one request and retry failures', async (t) => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    if (calls === 1) throw new Error('offline');
    return new Response('{"config":{"site_title":"test"}}');
  });
  global.window = { location: { pathname: '/', href: '/' } };
  t.after(() => { delete global.window; });
  const api = freshAPI();
  await Promise.allSettled(Array.from({ length: 5 }, () => api.getPublicConfig()));
  assert.equal(calls, 1);
  const results = await Promise.all(Array.from({ length: 5 }, () => api.getPublicConfig()));
  assert.equal(calls, 2);
  assert.equal(results[0].config.site_title, 'test');
});
