/* eslint-disable @typescript-eslint/no-require-imports */
const { input } = require('./dom-setup.js');
const nodeTest = require('node:test');
const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { selectValue } = require('./ui-controls.js');
const { createRoot } = require('react-dom/client');
const { api, ApiError } = require('../src/lib/api.ts');
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const click = async text => { assert.equal(Boolean(button(text)), true, `Missing button: ${text}`); await act(async () => button(text).click()); };
async function mount(t, path, props = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const Component = typeof path === 'string' ? require('../src/app/' + path + '/page.tsx').default : path;
  await act(async () => root.render(React.createElement(ConfirmProvider, null, React.createElement(Component, props))));
}

for (const kind of ['categories', 'tags']) {
  test(`${kind} load failure is actionable and a retry displays the recovered list`, async t => {
    let failed = true;
    t.mock.method(api.admin[kind], 'list', async () => {
      if (failed) throw new Error('list offline');
      return { items: [{ id: 'one', name: 'Recovered entry', slug: 'one', sort_order: 0 }], total: 1, page: 1, size: 20 };
    });
    await mount(t, 'admin/' + kind);
    assert.match(document.querySelector('[role="alert"]')?.textContent || '', /list offline/);
    failed = false;
    await click('重试');
    assert.match(document.body.textContent, /Recovered entry/);
    assert.equal(document.querySelector('[role="alert"]') === null, true);
  });

  test(`${kind} save locks duplicate clicks and retains the entered name after failure`, async t => {
    t.mock.method(api.admin[kind], 'list', async () => ({ items: [], total: 0, page: 1, size: 20 }));
    let rejectSave;
    const submitted = [];
    t.mock.method(api.admin[kind], 'create', data => { submitted.push(data); return new Promise((_, reject) => { rejectSave = reject; }); });
    await mount(t, 'admin/' + kind);
    await act(async () => input(document.querySelector('input[placeholder="名称"]'), 'Keep my entry'));
    await act(async () => { button('添加').click(); button('添加').click(); });
    assert.equal(submitted.length, 1, 'one user action must not create duplicate records');
    await act(async () => rejectSave(new Error('save offline')));
    assert.match(document.querySelector('[role="alert"]')?.textContent || '', /save offline/);
    assert.equal(document.querySelector('input[placeholder="名称"]').value, 'Keep my entry');
    t.mock.method(api.admin[kind], 'create', async data => { submitted.push(data); });
    await click('添加');
    assert.equal(submitted.length, 2);
    assert.equal(document.querySelector('input[placeholder="名称"]').value, '');
  });
}

test('category pagination keeps the latest response when an older request finishes late', async t => {
  let finishOld;
  t.mock.method(api.admin.categories, 'list', async params => {
    if (params.page === '2') return new Promise(resolve => { finishOld = resolve; });
    return { items: [{ id: params.page, name: 'Page ' + params.page, slug: params.page }], total: 60, page: Number(params.page), size: 20 };
  });
  await mount(t, 'admin/categories');
  await click('下一页');
  await click('上一页');
  await act(async () => finishOld({ items: [{ id: 'late', name: 'Stale page', slug: 'late' }], total: 60, page: 2, size: 20 }));
  assert.match(document.body.textContent, /Page 1/);
  assert.doesNotMatch(document.body.textContent, /Stale page/);
});

test('failed category pagination never presents the previous page as the requested page', async t => {
  t.mock.method(api.admin.categories, 'list', async params => {
    if (params.page === '2') throw new Error('next page offline');
    return { items: [{ id: 'first', name: 'First-page entry', slug: 'first' }], total: 40, page: 1, size: 20 };
  });
  await mount(t, 'admin/categories');
  await click('下一页');
  assert.match(document.querySelector('[role="alert"]')?.textContent || '', /next page offline/);
  assert.doesNotMatch(document.body.textContent, /First-page entry/);
});

test('failed navigation reorder rolls back and cannot race with another reorder', async t => {
  const items = [{ id: 'a', title: 'Alpha', url: '/', sort_order: 0 }, { id: 'b', title: 'Beta', url: '/b', sort_order: 1 }];
  t.mock.method(api.admin.navLinks, 'list', async () => ({ items }));
  let rejectReorder;
  let calls = 0;
  t.mock.method(api.admin.navLinks, 'reorder', () => { calls++; return new Promise((_, reject) => { rejectReorder = reject; }); });
  await mount(t, 'admin/nav-links');
  const drag = () => {
    const rows = document.querySelectorAll('tbody tr');
    rows[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    rows[1].dispatchEvent(new Event('dragenter', { bubbles: true }));
    rows[0].dispatchEvent(new Event('dragend', { bubbles: true }));
  };
  await act(async () => { drag(); drag(); });
  assert.equal(calls, 1);
  await act(async () => rejectReorder(new Error('order offline')));
  assert.match(document.querySelector('[role="alert"]')?.textContent || '', /order offline/);
  assert.equal(document.querySelector('tbody tr td:nth-child(2)').textContent, 'Alpha');
});

for (const [route, method] of [['categories', 'getCategories'], ['tags', 'getTags'], ['series', 'getSeries'], ['links', 'getLinks']]) {
  test(`${route} public list distinguishes a failed request from an empty list and retries`, async t => {
    let failed = true;
    t.mock.method(api, method, async () => { if (failed) throw new Error('public list offline'); return { items: [] }; });
    if (route === 'links') t.mock.method(api, 'getPublicConfig', async () => ({ config: {} }));
    await mount(t, route);
    assert.match(document.querySelector('[role="alert"]')?.textContent || '', /public list offline/);
    failed = false;
    await click('重试');
    assert.equal(document.querySelector('[role="alert"]') === null, true);
  });
}

test('auto-ban configuration cannot overwrite settings after a failed initial load', async t => {
  t.mock.method(api.admin.ipBans, 'list', async () => ({ items: [], total: 0, page: 1, size: 20 }));
  let failed = true;
  t.mock.method(api.admin.ipBans, 'getConfig', async () => { if (failed) throw new Error('config offline'); return { ip_ban_auto_threshold: '42' }; });
  let saves = 0;
  t.mock.method(api.admin.ipBans, 'updateConfig', async () => { saves++; });
  await mount(t, 'admin/blocked');
  await click('自动封禁');
  assert.equal(button('保存配置').disabled, true);
  assert.match(document.querySelector('[role="alert"]')?.textContent || '', /config offline/);
  failed = false;
  await click('重试');
  assert.equal(button('保存配置').disabled, false);
  assert.equal(document.querySelector('input[type="number"]').value, '42');
  assert.equal(saves, 0);
});

test('comment edit failure keeps the editor and text available for retry', async t => {
  t.mock.method(api.admin.comments, 'list', async () => ({ items: [{ id: 'c', nickname: 'Reader', content: 'Original', status: 'pending', created_at: '2026-01-01T00:00:00Z', edited_count: 0, ip_address: '127.0.0.1' }], total: 1, page: 1, size: 20 }));
  t.mock.method(api.admin.comments, 'update', async () => { throw new Error('comment offline'); });
  await mount(t, 'admin/comments');
  await act(async () => document.querySelector('button[data-tooltip="详情"]').click());
  await click('编辑');
  await act(async () => input(document.querySelector('textarea'), 'Keep this correction'));
  await click('保存');
  assert.match(document.querySelector('[role="alert"]')?.textContent || '', /comment offline/);
  assert.equal(document.querySelector('textarea')?.value, 'Keep this correction');
});

test('media metadata failure stays visible in the open editor without losing edits', async t => {
  t.mock.method(api.admin.media, 'list', async () => ({ items: [{ id: 'm', url: '/file.txt', original_name: 'file.txt', filename: 'file.txt', mime_type: 'text/plain', size: 10, created_at: '2026-01-01T00:00:00Z', tags: [] }], total: 1, page: 1, size: 30 }));
  t.mock.method(api.admin.media.tags, 'list', async () => ({ items: [] }));
  t.mock.method(api.admin.media, 'updateMetadata', async () => { throw new Error('metadata offline'); });
  await mount(t, 'admin/media');
  await act(async () => document.querySelector('button[data-tooltip="编辑元信息"]').click());
  await act(async () => input(document.querySelector('textarea'), 'Keep media description'));
  await click('保存');
  assert.match(document.querySelector('[role="alert"]')?.textContent || '', /metadata offline/);
  assert.equal(document.querySelector('textarea')?.value, 'Keep media description');
});

function mockPostSettings(t) {
  const post = { id: 'p', slug: 'p', title: 'Versioned post', content: 'Body', status: 'draft', updated_at: '2026-10-19T10:00:00.123456Z', tags: [], series: [] };
  t.mock.method(api.admin.posts, 'list', async () => ({ items: [post], total: 1, page: 1, size: 20 }));
  t.mock.method(api.admin.posts, 'get', async () => ({ post }));
  t.mock.method(api, 'getCategories', async () => ({ items: [] }));
  t.mock.method(api, 'getTags', async () => ({ items: [] }));
  t.mock.method(api.admin.series, 'list', async () => ({ items: [], total: 0, page: 1, size: 20 }));
  return post;
}

test('article list settings save includes the exact version read when opening the dialog', async t => {
  const post = mockPostSettings(t);
  let payload;
  t.mock.method(api.admin.posts, 'update', async (_id, data) => { payload = data; return { post: { ...post, ...data } }; });
  await mount(t, 'admin/posts');
  await act(async () => document.querySelector('button[data-tooltip="设置"]').click());
  await click('保存设置');
  assert.equal(payload?.expected_updated_at, '2026-10-19T10:00:00.123456Z');
});

test('article settings conflict keeps local values and never silently adopts the server version', async t => {
  const post = mockPostSettings(t);
  const attempts = [];
  t.mock.method(api.admin.posts, 'update', async (_id, data) => {
    attempts.push(data);
    throw new ApiError('server newer', 409, 'post_conflict', { ...post, updated_at: '2026-10-19T11:00:00Z' });
  });
  await mount(t, 'admin/posts');
  await act(async () => document.querySelector('button[data-tooltip="设置"]').click());
  await act(async () => input(document.querySelector('input[placeholder="输入作者名称"]'), 'Keep local author'));
  await click('保存设置');
  assert.match(document.body.textContent, /其他.*更新|版本.*冲突|重新打开.*比较/);
  assert.equal(document.querySelector('input[placeholder="输入作者名称"]')?.value, 'Keep local author');
  await click('保存设置');
  assert.deepEqual(attempts.map(data => data.expected_updated_at), [post.updated_at, post.updated_at]);
});

test('article status failure is visible and repeated clicks submit only once', async t => {
  mockPostSettings(t);
  let rejectStatus;
  let submissions = 0;
  t.mock.method(api.admin.posts, 'updateStatus', () => { submissions++; return new Promise((_, reject) => { rejectStatus = reject; }); });
  await mount(t, 'admin/posts');
  await act(async () => {
    const publish = document.querySelector('button[data-tooltip="发布"]');
    publish.click(); publish.click();
  });
  assert.equal(submissions, 1);
  await act(async () => rejectStatus(new Error('status offline')));
  assert.match(document.querySelector('[role="alert"]')?.textContent || '', /status offline/);
  assert.equal(document.querySelector('button[data-tooltip="发布"]') === null, false);
});

test('post settings lock duplicate saves and prevent edits until the request settles', async t => {
  const post = mockPostSettings(t);
  let finishSave;
  let submissions = 0;
  await mount(t, require('../src/components/PostDetailDialog.tsx').default, {
    post, categories: [], tags: [], seriesList: [], onClose() {},
    onSave: () => { submissions++; return new Promise(resolve => { finishSave = resolve; }); },
  });
  await act(async () => { button('保存设置').click(); button('保存设置').click(); });
  assert.equal(submissions, 1);
  assert.equal(document.querySelector('input[placeholder="输入作者名称"]').matches(':disabled'), true);
  await act(async () => finishSave());
  assert.equal(document.querySelector('input[placeholder="输入作者名称"]').matches(':disabled'), false);
});

test('a delayed article status change refreshes the current filter instead of its original query', async t => {
  const post = mockPostSettings(t);
  const requests = [];
  t.mock.method(api.admin.posts, 'list', async params => {
    requests.push(params);
    return { items: [{ ...post, title: params.status ? 'Current filtered article' : 'Original article' }], total: 1, page: 1, size: 20 };
  });
  let finish;
  t.mock.method(api.admin.posts, 'updateStatus', () => new Promise(resolve => { finish = resolve; }));
  await mount(t, 'admin/posts');
  await act(async () => document.querySelector('button[data-tooltip="发布"]').click());
  await selectValue(document.querySelector('[role="combobox"]'), 'published');
  await act(async () => finish());
  assert.equal(requests.at(-1).status, 'published');
  assert.match(document.body.textContent, /Current filtered article/);
  assert.doesNotMatch(document.body.textContent, /Original article/);
});
