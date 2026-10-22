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
    assert.match(error.message, /HTTP 503/);
    assert.match(error.message, /服务.*不可用/);
    return true;
  });
});

for (const [status, hint] of [[401, /登录/], [403, /权限/], [413, /过大/], [429, /频繁/], [502, /后端/], [504, /超时/]]) {
  test(`HTTP ${status} without JSON provides an actionable reason and retains its status`, async t => {
    t.mock.method(global, 'fetch', async () => new Response('<html>proxy failure</html>', { status }));
    await assert.rejects(api.admin.config.update({}), error => {
      assert.equal(error.status, status);
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.match(error.message, hint);
      assert.doesNotMatch(error.message, /<html>/);
      return true;
    });
  });
}

test('explicit standby reasons remain visible together with HTTP status', async t => {
  t.mock.method(global, 'fetch', async () => Response.json({ error: '备服务器为只读模式，请在主服务器执行编辑操作' }, { status: 503 }));
  await assert.rejects(api.admin.config.update({}), error => {
    assert.match(error.message, /备服务器为只读模式/);
    assert.match(error.message, /HTTP 503/);
    return true;
  });
});
