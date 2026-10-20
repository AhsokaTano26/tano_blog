/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { withAdminControlPosts, navigateAdmin } = require('../scripts/browser-admin-controls.cjs');

function fixtureAPI(initial = []) {
  const posts = new Map(initial.map(post => [post.id, post]));
  let sequence = 0;
  const request = async (method, route, data) => {
    if (method === 'POST' && route === '/api/v1/admin/posts') {
      const post = { ...data, id: `fixture-${++sequence}` };
      posts.set(post.id, post);
      return { post };
    }
    if (method === 'DELETE' && route.startsWith('/api/v1/admin/posts/')) {
      const id = decodeURIComponent(route.split('/').at(-1));
      assert.equal(posts.delete(id), true, 'cleanup must only delete an existing fixture');
      return {};
    }
    assert.fail(`Unexpected fixture request: ${method} ${route}`);
  };
  return { posts, request };
}

test('admin checks use the existing application document instead of aborting prefetches with goto', async () => {
  let currentURL = 'http://localhost/admin';
  let link;
  const page = {
    goto() { assert.fail('full document navigation can abort WebKit RSC prefetches'); },
    locator(selector) {
      link = selector;
      return { first: () => ({ click: async ({ timeout }) => {
        assert.equal(timeout > 12200, true, 'fresh-login animation may still cover the link');
        await Promise.resolve();
        currentURL = 'http://localhost/admin/posts';
      } }) };
    },
    async waitForURL(expected) { assert.equal(currentURL, expected); },
  };
  await navigateAdmin(page, 'http://localhost', '/admin/posts');
  assert.equal(link, 'a[href="/admin/posts"]:visible');
});

test('admin control checks have two drafts even in an empty CI database', async () => {
  const { posts, request } = fixtureAPI();
  let checks = 0;
  await withAdminControlPosts(request, 'chromium', async () => {
    checks++;
    assert.equal(posts.size, 2, 'mixed selection and article settings require two rows');
    assert.equal([...posts.values()].every(post => post.status === 'draft' && post.content), true);
    assert.equal(new Set([...posts.values()].map(post => post.slug)).size, 2);
  });
  assert.equal(checks, 1);
  assert.equal(posts.size, 0, 'later editor checks must not inherit fixture articles');
});

test('failed browser assertions preserve the error and clean up only their own articles', async () => {
  const { posts, request } = fixtureAPI([{ id: 'existing', title: 'Earlier browser article' }]);
  const failure = new Error('dialog layout failed');
  await assert.rejects(withAdminControlPosts(request, 'webkit', async () => { throw failure; }), error => error === failure);
  assert.deepEqual([...posts.keys()], ['existing']);
});

test('partial fixture setup is cleaned up without running checks against missing rows', async () => {
  const { posts, request } = fixtureAPI();
  let creates = 0;
  const failure = new Error('second article failed');
  await assert.rejects(withAdminControlPosts(async (...args) => {
    if (args[0] === 'POST' && ++creates === 2) throw failure;
    return request(...args);
  }, 'chromium', async () => { assert.fail('incomplete fixtures must not reach UI checks'); }), error => error === failure);
  assert.equal(posts.size, 0);
});
