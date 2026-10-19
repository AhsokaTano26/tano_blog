/* eslint-disable @typescript-eslint/no-require-imports */
require('./load-typescript.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const { api } = require('../src/lib/api.ts');

test('conflict responses retain status, code and the server version for review', async t => {
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({ error: '文章已被修改', code: 'post_conflict', current_post: { id: 'p', title: 'server', content: 'latest', updated_at: '2026-10-19T00:00:00Z' } }), { status: 409 }));
  await assert.rejects(api.admin.posts.update('p', { content: 'local' }), error => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'post_conflict');
    assert.equal(error.currentPost.content, 'latest');
    return true;
  });
});

test('non-JSON HTTP failures retain status without swallowing the fallback message', async t => {
  t.mock.method(global, 'fetch', async () => new Response('Unavailable', { status: 503 }));
  await assert.rejects(api.getPosts(), error => {
    assert.equal(error.status, 503);
    assert.equal(error.message, 'HTTP 503');
    return true;
  });
});
