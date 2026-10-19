/* eslint-disable @typescript-eslint/no-require-imports */
const { createRequire } = require('node:module');
const req = createRequire(require('node:path').join(__dirname, '../package.json'));
const { input } = req('./tests/dom-setup.js');
const nodeTest = require('node:test');
const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);
const assert = require('node:assert/strict');
const React = req('react');
const { act } = React;
const { createRoot } = req('react-dom/client');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'next/navigation') return { useSearchParams: () => new URLSearchParams(window.location.search), useRouter: () => ({ push() {} }), usePathname: () => window.location.pathname };
  return originalLoad.call(this, request, ...args);
};
for (const key of ['Node', 'Element', 'Image', 'sessionStorage']) global[key] = window[key];
global.self = window;
const { api } = req('./src/lib/api.ts');
const { ConfirmProvider } = req('./src/components/ConfirmDialog.tsx');
function button(text) { return [...document.querySelectorAll('button')].find(x => x.textContent.trim() === text); }
async function clickText(text) { await act(async () => button(text).click()); }
const view = (Component, props = {}) => React.createElement(ConfirmProvider, null, React.createElement(React.Suspense, { fallback: 'loading' }, React.createElement(Component, props)));
async function mount(t, Component, props = {}) {
  const el = document.createElement('div'); document.body.append(el);
  const root = createRoot(el);
  t.after(async () => { await act(async () => root.unmount()); el.remove(); localStorage.clear(); });
  await act(async () => root.render(view(Component, props)));
  return root;
}
function mockEmpty(t) { t.mock.method(global, 'fetch', async () => Response.json({ items: [], total: 0, config: {} })); }

test('regression: category deep links request only their URL page', async t => {
  window.history.replaceState(null, '', '/categories/c?page=2');
  const pending = [];
  t.mock.method(api, 'getCategory', (_slug, params) => new Promise(resolve => pending.push({ page: params.page, resolve })));
  await mount(t, req('./src/app/categories/[slug]/page.tsx').default, { params: Promise.resolve({ slug: 'c' }) });
  assert.deepEqual(pending.map(p => p.page), ['2']);
  const result = page => ({ category: { name: 'Category' }, posts: [{ id: page, slug: page, title: 'Page-' + page }], total: 30 });
  await act(async () => pending[0].resolve(result('2')));
  assert.match(document.body.textContent, /Page-2/);

  assert.equal(window.location.search, '?page=2');
});

test('regression: clearing article settings sends explicit empty fields', async t => {
  let payload;
  await mount(t, req('./src/components/PostDetailDialog.tsx').default, {
    post: { id: 'p', title: 'Post', content: 'body', status: 'draft', category_id: 'c', series: [{ id: 's' }], tags: [{ id: 't' }], cover_image: '/cover.png', scheduled_at: '2030-01-01T12:00:00Z' },
    categories: [{ id: 'c', name: 'CategoryOne' }], seriesList: [{ id: 's', name: 'SeriesOne' }], tags: [{ id: 't', name: 'TagOne' }],
    onSave: async data => { payload = data; }, onClose() {},
  });
  for (const select of document.querySelectorAll('select')) {
    await act(async () => { select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  await clickText('TagOne');
  await act(async () => { input(document.querySelector('input[type="datetime-local"]'), ''); input(document.querySelector('input[placeholder="https://..."]'), ''); });
  await clickText('保存设置');
  for (const key of ['category_id', 'series_id', 'tag_ids', 'cover_image', 'scheduled_at']) assert.deepEqual(payload[key], key === 'tag_ids' ? [] : key === 'scheduled_at' ? null : '', key);

});

test('regression: media picker retries a failed page without skipping it', async t => {
  const calls = [];
  t.mock.method(api.admin.media.tags, 'list', async () => ({ items: [] }));
  t.mock.method(api.admin.media, 'list', async params => {
    calls.push(params.page);
    if (params.page === '2' && calls.filter(p => p === '2').length === 1) throw new Error('temporary offline');
    return { items: [{ id: params.page, url: '/' + params.page + '.png', mime_type: 'image/png' }], total: 90 };
  });
  await mount(t, req('./src/components/MediaField.tsx').MediaPickerModal, { onSelect() {}, onClose() {} });
  await clickText('加载更多');
  assert.match(document.body.textContent, /temporary offline/);
  assert.equal(button('加载更多') === undefined, true);
  await clickText('重试');
  assert.deepEqual(calls, ['1', '2', '2']);
  assert.ok(document.querySelector('img[src="/2.png"]'));
});

test('regression: series checkbox selects its article exactly once', async t => {
  t.mock.method(api.admin.series, 'list', async () => ({ items: [{ id: 's', name: 'Series' }], total: 1 }));
  t.mock.method(api.admin.series, 'listPosts', async () => ({ items: [] }));
  t.mock.method(api.admin.posts, 'list', async () => ({ items: [{ id: 'p', title: 'Post' }], total: 1 }));
  let submitted;
  t.mock.method(api.admin.series, 'setPosts', async (_id, ids) => { submitted = ids; });
  await mount(t, req('./src/app/admin/series/page.tsx').default);
  await act(async () => document.querySelector('button[title="设置文章"]').click());
  await act(async () => document.querySelector('input[type="checkbox"]').click());
  await clickText('保存');
  assert.deepEqual(submitted, ['p']);
});

test('regression: editor preserves a manual excerpt when saving the article', async t => {
  mockEmpty(t);
  let submitted;
  t.mock.method(api.admin.posts, 'update', async (_id, data) => { submitted = data; });
  await mount(t, req('./src/components/PostEditor.tsx').default, { post: { id: 'p', title: 'Post', slug: 'post', content: 'Original article body', status: 'draft' }, onClose() {} });
  const settings = document.querySelector('button[title="文章详情与设置"]');
  assert.ok(settings, [...document.querySelectorAll('button')].map(x => x.title + '/' + x.textContent).join(','));
  await act(async () => settings.click());
  await clickText('手动');
  const excerptInput = [...document.querySelectorAll('textarea')].find(x => x.placeholder.includes('摘要'));
  assert.ok(excerptInput);
  await act(async () => input(excerptInput, 'My manual summary'));
  await clickText('保存设置');
  await clickText('保存');
  assert.equal(submitted.excerpt, 'My manual summary');
});

test('regression: editor autosaves during continuous typing', async t => {
  mockEmpty(t);
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  await mount(t, req('./src/components/PostEditor.tsx').default, { post: { id: 'p', title: 'Post', slug: 'post', content: 'Initial' }, onClose() {} });
  const textarea = document.querySelector('textarea[placeholder^="输入 Markdown"]');
  for (let i = 0; i < 12; i++) {
    await act(async () => t.mock.timers.tick(10_000));
    await act(async () => input(textarea, 'Typed for ' + ((i + 1) * 10) + ' seconds'));
  }
  assert.match(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('post_autosave_p:'))), /Typed for 110 seconds/);
  await act(async () => t.mock.timers.tick(30_000));
  assert.match(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('post_autosave_p:'))), /Typed for 120 seconds/);
});

test('regression: search exposes subsequent pages for more than 20 matches', async t => {
  window.history.replaceState(null, '', '/search?q=match');
  t.mock.method(api, 'getTags', async () => ({ items: [] }));
  t.mock.method(api, 'getPosts', async params => ({ items: Array.from({ length: Number(params.page_size) }, (_, i) => ({ id: String(i), slug: String(i), title: 'Match ' + i })), total: 45 }));
  await mount(t, req('./src/app/search/page.tsx').default);
  assert.match(document.body.textContent, /共 45 条结果/);
  assert.equal(document.querySelectorAll('h2').length, 20);
  assert.ok(button('下一页'));
  await clickText('下一页');
  assert.equal(new URLSearchParams(window.location.search).get('page'), '2');
});

test('regression: clearing an article password reaches the update payload', async t => {
  mockEmpty(t);
  let submitted;
  t.mock.method(api.admin.posts, 'update', async (_id, data) => { submitted = data; });
  await mount(t, req('./src/components/PostEditor.tsx').default, { post: { id: 'p', title: 'Post', slug: 'post', content: 'body', status: 'draft', password_set: true }, onClose() {} });
  await act(async () => document.querySelector('button[title="文章详情与设置"]').click());
  await clickText('清除密码');
  await clickText('保存设置');
  await clickText('保存');
  assert.equal(submitted.password, '');
});

test('regression: reopening editor settings preserves unsaved setting changes', async t => {
  mockEmpty(t);
  let submitted;
  t.mock.method(api.admin.posts, 'update', async (_id, data) => { submitted = data; });
  await mount(t, req('./src/components/PostEditor.tsx').default, { post: { id: 'p', title: 'Post', slug: 'post', content: 'body', status: 'draft', author_name: 'Old author' }, onClose() {} });
  await act(async () => document.querySelector('button[title="文章详情与设置"]').click());
  await act(async () => input(document.querySelector('input[placeholder="输入作者名称"]'), 'New author'));
  await clickText('保存设置');
  await act(async () => document.querySelector('button[title="文章详情与设置"]').click());
  assert.equal(document.querySelector('input[placeholder="输入作者名称"]').value, 'New author');
  await clickText('保存设置');
  await clickText('保存');
  assert.equal(submitted.author_name, 'New author');
});

test('regression: series cannot save before current membership has loaded', async t => {
  t.mock.method(api.admin.series, 'list', async () => ({ items: [{ id: 's', name: 'Series' }], total: 1 }));
  t.mock.method(api.admin.series, 'listPosts', () => new Promise(() => {}));
  t.mock.method(api.admin.posts, 'list', async () => ({ items: [{ id: 'p', title: 'Post' }], total: 1 }));
  let submitted;
  t.mock.method(api.admin.series, 'setPosts', async (_id, ids) => { submitted = ids; });
  await mount(t, req('./src/app/admin/series/page.tsx').default);
  await act(async () => document.querySelector('button[title="设置文章"]').click());
  assert.equal(button('保存').disabled, true);
  await clickText('保存');
  assert.equal(submitted, undefined);
});

test('regression: Turnstile initializes after the links form mounts', async t => {
  let resolveLinks;
  let renders = 0;
  window.turnstile = { render() { renders++; return 'id'; }, remove() {} };
  t.after(() => { delete window.turnstile; });
  t.mock.method(api, 'getLinks', () => new Promise(resolve => { resolveLinks = resolve; }));
  t.mock.method(api, 'getPublicConfig', async () => ({ config: { turnstile_enabled: 'true', turnstile_sitekey: 'test-key', turnstile_modules: 'link' } }));
  await mount(t, req('./src/app/links/page.tsx').default);
  await act(async () => resolveLinks({ items: [] }));
  assert.ok(document.querySelector('form'));
  assert.equal(renders, 1);
});

test('regression: music config failure dismisses the splash and supports retry', async t => {
  t.mock.method(api, 'getMusicConfig', async () => { throw new Error('offline'); });
  const media = new window.EventTarget(); media.matches = true;
  window.matchMedia = () => media;
  t.mock.method(global, 'requestAnimationFrame', () => 0);
  await mount(t, req('./src/app/music/page.tsx').default);
  assert.equal(document.querySelector('.fixed.inset-0.z-\\[200\\]') === null, true);
  assert.ok(button('重试'));
  assert.match(document.querySelector('[role="alert"]').textContent, /offline/);
  t.mock.method(api, 'getMusicConfig', async () => ({ config: { music_page_config: '{"playlists":[]}' } }));
  await clickText('重试');
  assert.equal(document.querySelector('[role="alert"]') === null, true);
  assert.match(document.body.textContent, /暂无音乐/);
});

test('regression: shared draft preview renders Markdown with the article renderer', async t => {
  window.history.replaceState(null, '', '/posts/preview?token=test');
  t.mock.method(api, 'getPostByPreview', async () => ({ post: { title: 'Preview', content: '# Heading\n\n**Bold**' } }));
  await mount(t, req('./src/app/posts/preview/page.tsx').default);
  const content = document.querySelector('.prose');
  assert.equal(content.querySelector('h1')?.textContent, 'Heading');
  assert.equal(content.querySelector('strong')?.textContent, 'Bold');
});

for (const route of ['/admin/login', '/admin/forgot-password', '/admin/reset-password?token=one']) {
  test('public authentication page renders without a logged-in session: ' + route, async t => {
    window.history.replaceState(null, '', route);
    let checks = 0;
    t.mock.method(api, 'getMe', async () => { checks++; throw new Error('unauthorized'); });
    await mount(t, req('./src/app/admin/layout.tsx').default, { children: React.createElement('p', null, 'public form') });
    assert.match(document.body.textContent, /public form/);
    assert.equal(checks, 0);
  });
}

test('shared controls expose native keyboard and label behavior', async t => {
  const { Select, Checkbox } = req('./src/components/ConfirmDialog.tsx');
  let selected, checked;
  await mount(t, () => React.createElement(React.Fragment, null,
    React.createElement(Select, { value: 'a', options: [{value: 'a', label: 'A'}, {value: 'b', label: 'B'}], onChange: v => { selected = v; } }),
    React.createElement(Checkbox, { checked: false, label: 'Remember', onChange: v => { checked = v; } })));
  const select = document.querySelector('select');
  assert.ok(select);
  await act(async () => { select.value = 'b'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(selected, 'b');
  await act(async () => document.querySelector('label').click());
  assert.equal(checked, true);
  assert.ok(document.querySelector('input[type="checkbox"]'));
});

test('series membership selector reaches posts after the first 100 and preserves old members', async t => {
  t.mock.method(api.admin.series, 'list', async () => ({ items: [{ id: 's', name: 'Series' }], total: 1 }));
  t.mock.method(api.admin.series, 'listPosts', async () => ({ items: [{ id: 'existing' }] }));
  t.mock.method(api.admin.posts, 'list', async params => ({ items: [{ id: params.page === '3' ? 'later' : 'first', title: params.page === '3' ? 'Later post' : 'First post' }], total: 120 }));
  let submitted;
  t.mock.method(api.admin.series, 'setPosts', async (_id, ids) => { submitted = ids; });
  await mount(t, req('./src/app/admin/series/page.tsx').default);
  await act(async () => document.querySelector('button[title="设置文章"]').click());
  const next = [...document.querySelectorAll('button')].filter(x => x.textContent === '下一页').at(-1);
  assert.ok(next && !next.disabled);
  await act(async () => next.click());
  await act(async () => [...document.querySelectorAll('button')].filter(x => x.textContent === '下一页').at(-1).click());
  assert.match(document.body.textContent, /Later post/);
  await act(async () => document.querySelector('input[type="checkbox"]').click());
  await clickText('保存');
  assert.deepEqual(submitted, ['existing', 'later']);
});

test('post settings select series beyond page one without clearing the selected series', async t => {
  t.mock.method(api.admin.series, 'list', async params => ({ items: [{ id: params.page === '2' ? 's21' : 's1', name: params.page === '2' ? 'Later series' : 'First series' }], total: 21 }));
  let payload;
  await mount(t, req('./src/components/PostDetailDialog.tsx').default, { post: { id: 'p', content: 'body', series: [{ id: 'old', name: 'Selected series' }] }, categories: [], tags: [], seriesList: [], onClose() {}, onSave: async data => { payload = data; } });
  const more = button('下一页系列');
  assert.ok(more);
  await act(async () => more.click());
  const select = document.querySelector('select[aria-label="文章系列"]');
  assert.ok([...select.options].some(option => option.textContent === 'Later series'));
  assert.equal(select.value, 'old');
  await act(async () => { select.value = 's21'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await clickText('保存设置');
  assert.equal(payload.series_id, 's21');
});

test('existing article restores a newer local draft including cleared settings', async t => {
  mockEmpty(t);
  localStorage.setItem('post_autosave_p', JSON.stringify({ title: 'Recovered title', content: '', excerpt: '', excerptMode: 'manual', coverImage: '', categoryId: '', tagIds: [], allowComment: false, selectedSeriesId: '', savedAt: Date.now() }));
  let payload;
  t.mock.method(api.admin.posts, 'update', async (_id, data) => { payload = data; });
  await mount(t, req('./src/components/PostEditor.tsx').default, { post: { id: 'p', title: 'Server title', content: 'Old body', slug: 'p', category_id: 'old', updated_at: '2020-01-01T00:00:00Z' }, onClose() {} });
  assert.ok(button('恢复'));
  await clickText('恢复');
  await clickText('保存');
  assert.equal(payload.title, 'Recovered title');
  assert.equal(payload.content, '');
  assert.equal(payload.excerpt, '');
  assert.equal(payload.category_id, '');
  assert.equal(payload.allow_comment, false);
});

test('editor retains AI summaries and explicit cleared category after settings reopen', async t => {
  mockEmpty(t);
  t.mock.method(api.admin.posts, 'generateExcerpt', async () => ({ excerpt: 'AI summary' }));
  let payload;
  t.mock.method(api.admin.posts, 'update', async (_id, data) => { payload = data; });
  t.mock.method(api, 'getCategories', async () => ({ items: [{ id: 'old', name: 'Old category' }] }));
  await mount(t, req('./src/components/PostEditor.tsx').default, { post: { id: 'p', title: 'Title', content: 'body', slug: 'p', category_id: 'old', category: { id: 'old', name: 'Old category' } }, onClose() {} });
  await act(async () => document.querySelector('button[title="文章详情与设置"]').click());
  await clickText('AI 生成');
  const select = document.querySelector('select');
  await act(async () => { select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await clickText('保存设置');
  await act(async () => document.querySelector('button[title="文章详情与设置"]').click());
  assert.equal(document.querySelector('select').value, '');
  await clickText('保存设置');
  await clickText('保存');
  assert.equal(payload.excerpt, 'AI summary');
  assert.equal(payload.category_id, '');
});

for (const kind of ['categories', 'tags']) {
  test(kind + ' ignores stale responses after navigating to another slug and retries failures', async t => {
    window.history.replaceState(null, '', '/' + kind + '/old?page=2');
    let resolveOld;
    let fail = true;
    const key = kind === 'categories' ? 'category' : 'tag';
    t.mock.method(api, key === 'category' ? 'getCategory' : 'getTag', async slug => {
      if (slug === 'old') return new Promise(resolve => { resolveOld = resolve; });
      if (fail) throw new Error('temporarily offline');
      return { [key]: { name: 'New name' }, posts: [{ id: 'new', slug: 'new', title: 'New post' }], total: 1 };
    });
    const Component = req('./src/app/' + kind + '/[slug]/page.tsx').default;
    const root = await mount(t, Component, { params: Promise.resolve({ slug: 'old' }) });
    await act(async () => root.render(view(Component, { params: Promise.resolve({ slug: 'new' }) })));
    assert.match(document.querySelector('[role="alert"]').textContent, /temporarily offline/);
    fail = false;
    await clickText('重试');
    await act(async () => resolveOld({ [key]: { name: 'Old name' }, posts: [{ id: 'old', slug: 'old', title: 'Old post' }], total: 3 }));
    assert.match(document.body.textContent, /New post/);
    assert.doesNotMatch(document.body.textContent, /Old post/);
  });
}

test('scheduled local input is sent as RFC3339 and displayed in local time', async t => {
  mockEmpty(t);
  let payload;
  const value = '2030-07-02T10:30:00Z';
  await mount(t, req('./src/components/PostDetailDialog.tsx').default, { post: { id: 'p', title: 'Post', content: '', status: 'draft', scheduled_at: value }, categories: [], tags: [], seriesList: [], onClose() {}, onSave: async data => { payload = data; } });
  const input = document.querySelector('input[type="datetime-local"]');
  assert.equal(new Date(input.value).toISOString(), value.replace('Z', '.000Z'));
  await clickText('保存设置');
  assert.equal(payload.scheduled_at, '2030-07-02T10:30:00.000Z');
});

test('search requests URL pages and ignores late results for an earlier keyword', async t => {
  window.history.replaceState(null, '', '/search?q=old&page=2');
  t.mock.method(api, 'getTags', async () => ({ items: [] }));
  let old;
  const requests = [];
  t.mock.method(api, 'getPosts', async params => {
    if (!params.search) return { items: [], total: 0 };
    requests.push(params);
    if (params.search === 'old') return new Promise(resolve => { old = resolve; });
    return { items: [{ id: 'new', slug: 'new', title: 'New result' }], total: 1 };
  });
  const Component = req('./src/app/search/page.tsx').default;
  const root = await mount(t, Component);
  assert.equal(requests[0].page, '2');
  await act(async () => input(document.querySelector('input[placeholder="搜索文章..."]'), 'new'));
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(window.location.search, '?q=new');
  await act(async () => root.render(view(Component)));
  assert.equal(requests[1].page, '1');
  await act(async () => old({ items: [{ id: 'old', slug: 'old', title: 'Old result' }], total: 50 }));
  assert.match(document.body.textContent, /New result/);
  assert.doesNotMatch(document.body.textContent, /Old result/);
});

test('failed series membership stays protected until a successful retry', async t => {
  let fail = true;
  let submitted;
  t.mock.method(api.admin.series, 'list', async () => ({ items: [{ id: 's', name: 'Series' }], total: 1 }));
  t.mock.method(api.admin.series, 'listPosts', async () => { if (fail) throw new Error('membership offline'); return { items: [{ id: 'old' }] }; });
  t.mock.method(api.admin.posts, 'list', async () => ({ items: [], total: 0 }));
  t.mock.method(api.admin.series, 'setPosts', async (_id, ids) => { submitted = ids; });
  await mount(t, req('./src/app/admin/series/page.tsx').default);
  await act(async () => document.querySelector('button[title="设置文章"]').click());
  assert.equal(button('保存').disabled, true);
  assert.match(document.querySelector('[role="alert"]').textContent, /membership offline/);
  await clickText('保存');
  assert.equal(submitted, undefined);
  fail = false;
  await clickText('重试');
  assert.equal(button('保存').disabled, false);
  await clickText('保存');
  assert.deepEqual(submitted, ['old']);
});

test('admin search resets pagination and ignores late earlier results', async t => {
  const requests = [];
  let old;
  t.mock.method(api, 'getCategories', async () => ({ items: [] }));
  t.mock.method(api, 'getTags', async () => ({ items: [] }));
  t.mock.method(api.admin.posts, 'list', async params => {
    requests.push(params);
    if (params.page === '2') return new Promise(resolve => { old = resolve; });
    return { items: [{ id: params.search || 'initial', title: params.search || 'Initial', status: 'draft' }], total: 45 };
  });
  await mount(t, req('./src/app/admin/posts/page.tsx').default);
  await clickText('下一页');
  const search = document.querySelector('input[placeholder="搜索文章..."]');
  await act(async () => input(search, 'needle'));
  await act(async () => search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  assert.deepEqual(requests.at(-1), { page: '1', page_size: '20', search: 'needle' });
  await act(async () => old({ items: [{ id: 'old', title: 'Stale result' }], total: 45 }));
  assert.match(document.body.textContent, /needle/);
  assert.doesNotMatch(document.body.textContent, /Stale result/);
});

test('preview metadata excludes indexing and configured CSP permits HTTPS and blob media', async () => {
  const metadata = req('./src/app/posts/preview/layout.tsx').metadata;
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  const headers = await req('./next.config.ts').default.headers();
  const policy = headers[0].headers.find(header => header.key === 'Content-Security-Policy').value;
  const sources = policy.split(';').find(directive => directive.trim().startsWith('media-src ')).trim().split(/\s+/).slice(1);
  assert.ok(sources.includes('https:'));
  assert.ok(sources.includes('blob:'));
  assert.ok(sources.includes("'self'"));
});

test('series lookup search resets to page one and preserves the selected option', async t => {
  const requests = [];
  t.mock.method(api.admin.series, 'list', async params => {
    requests.push(params);
    return { items: params.search ? [{ id: 'found', name: 'Matching series' }] : [{ id: 'first', name: 'First' }], total: params.search ? 1 : 25 };
  });
  await mount(t, req('./src/components/SeriesSelect.tsx').SeriesSelect, { value: 'selected', onChange() {}, initialOptions: [{ id: 'selected', name: 'Selected' }] });
  await clickText('下一页系列');
  await act(async () => input(document.querySelector('input[aria-label="搜索系列"]'), 'matching'));
  assert.deepEqual(requests.at(-1), { page: '1', page_size: '20', search: 'matching' });
  assert.equal(document.querySelector('select').value, 'selected');
  assert.match(document.body.textContent, /Matching series/);
});

test('article audio reports load failures and can retry playback', async t => {
  mockEmpty(t);
  t.mock.method(window.HTMLMediaElement.prototype, 'play', async function () { this.dispatchEvent(new Event('play')); });
  await mount(t, req('./src/components/ArticleAudioPlayer.tsx').ArticleAudioPlayer, { src: 'https://media.example/audio.mp3' });
  await act(async () => document.querySelector('audio').dispatchEvent(new Event('error')));
  assert.match(document.querySelector('[role="alert"]').textContent, /音频加载失败/);
  await act(async () => document.querySelector('button').click());
  assert.equal(document.querySelector('[role="alert"]') === null, true);
});

for (const existing of [false, true]) {
  test(`restored ${existing ? 'existing public' : 'new'} article requires reentering its unsaved password before publishing`, async t => {
    mockEmpty(t);
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const submitted = [];
    t.mock.method(api.admin.posts, 'create', async data => { submitted.push(data); });
    t.mock.method(api.admin.posts, 'update', async (_id, data) => { submitted.push(data); });
    const post = { ...(existing ? { id: 'password-draft', updated_at: '2020-01-01T00:00:00Z' } : {}), title: 'Protected draft', slug: 'protected', content: 'Private body', status: 'draft', password_set: false };
    const Editor = req('./src/components/PostEditor.tsx').default;
    const root = await mount(t, Editor, { post, onClose() {} });
    await act(async () => document.querySelector('button[title="文章详情与设置"]').click());
    await act(async () => input(document.querySelector('input[type="password"]'), 'secret-before-refresh'));
    await clickText('保存设置');
    await act(async () => t.mock.timers.tick(30_000));
    const key = Object.keys(localStorage).find(key => key.startsWith(existing ? 'post_autosave_password-draft:' : 'post_autosave_new:'));
    assert.doesNotMatch(localStorage.getItem(key), /secret-before-refresh/);
    await act(async () => root.render(null));
    await act(async () => root.render(view(Editor, { post, onClose() {} })));
    await clickText('恢复');
    await clickText('发布');
    assert.equal(submitted.length, 0, 'a password absent from the restored draft must never become a public article');
    assert.match(document.body.textContent, /重新输入.*密码/);
    assert.ok(document.querySelector('input[type="password"]'));
    await clickText('保存设置');
    assert.equal(submitted.length, 0);
    assert.ok(document.querySelector('input[type="password"]'), 'empty settings must stay open until a password is supplied');
    await act(async () => input(document.querySelector('input[type="password"]'), 'secret-after-refresh'));
    await clickText('保存设置');
    await clickText('发布');
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].password, 'secret-after-refresh');
    assert.equal(submitted[0].status, 'published');
  });
}

for (const clearPassword of [false, true]) {
  test(`restoring a server-protected article ${clearPassword ? 'retains an explicit password removal' : 'preserves its server password without requiring plaintext'}`, async t => {
    mockEmpty(t);
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    let submitted;
    t.mock.method(api.admin.posts, 'update', async (_id, data) => { submitted = data; });
    const post = { id: 'protected', title: 'Protected', slug: 'protected', content: 'Private body', status: 'draft', password_set: true, updated_at: '2020-01-01T00:00:00Z' };
    const Editor = req('./src/components/PostEditor.tsx').default;
    const root = await mount(t, Editor, { post, onClose() {} });
    if (clearPassword) {
      await act(async () => document.querySelector('button[title="文章详情与设置"]').click());
      await clickText('清除密码');
      await clickText('保存设置');
    }
    await act(async () => input(document.querySelector('textarea[placeholder^="输入 Markdown"]'), 'Edited private body'));
    await act(async () => t.mock.timers.tick(30_000));
    const draftKey = Object.keys(localStorage).find(key => key.startsWith('post_autosave_protected:'));
    assert.equal(JSON.parse(localStorage.getItem(draftKey)).passwordNeedsReentry, false);
    await act(async () => root.render(null));
    await act(async () => root.render(view(Editor, { post, onClose() {} })));
    await clickText('恢复');
    await clickText('发布');
    assert.ok(submitted);
    if (clearPassword) assert.equal(submitted.password, '');
    else assert.equal(Object.hasOwn(submitted, 'password'), false);
  });
}

test('older ambiguous password backups require reentry instead of becoming public', async t => {
  mockEmpty(t);
  localStorage.setItem('post_autosave_legacy', JSON.stringify({ title: 'Legacy draft', content: 'Private body', passwordSet: true, savedAt: Date.now() }));
  let submitted;
  t.mock.method(api.admin.posts, 'update', async (_id, data) => { submitted = data; });
  await mount(t, req('./src/components/PostEditor.tsx').default, { post: { id: 'legacy', title: 'Legacy', slug: 'legacy', content: 'body', password_set: false }, onClose() {} });
  await clickText('恢复');
  await clickText('保存');
  assert.equal(submitted, undefined);
  assert.ok(document.querySelector('input[type="password"]'));
  assert.match(document.body.textContent, /重新输入.*密码/);
});
