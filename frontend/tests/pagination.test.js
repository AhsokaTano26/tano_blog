/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests reuse the TypeScript loader. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { api } = require('../src/lib/api.ts');
const { ConfirmProvider } = require('../src/components/ConfirmDialog.tsx');

async function mount(t, Component, props) {
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  t.after(async () => { await React.act(async () => root.unmount()); element.remove(); });
  await React.act(async () => root.render(React.createElement(ConfirmProvider, null, React.createElement(Component, props))));
  return {
    element,
    render: props => React.act(async () => root.render(React.createElement(ConfirmProvider, null, React.createElement(Component, props)))),
  };
}

async function click(text) {
  const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text);
  assert.ok(button, `Missing button: ${text}`);
  await React.act(async () => button.click());
}

const photo = id => ({ id, url: `/original-${id}.png`, thumbnail_url: `/small-${id}.png`, title: `Photo ${id}`, sort_order: Number(id) });

test('gallery appends bounded pages and retries the failed page without losing earlier images', async t => {
  let fail = true;
  const pages = [];
  t.mock.method(api, 'getGalleryImages', async (params = {}) => {
    const page = Number(params.page || 1);
    pages.push(page);
    if (page === 2 && fail) throw new Error('暂时无法加载');
    return { items: page === 1 ? [photo('1'), photo('2')] : [photo('2'), photo('3')], total: 4, page, size: 2 };
  });
  const Gallery = require('../src/app/gallery/page.tsx').default;
  await mount(t, Gallery);
  assert.equal(document.querySelectorAll('.gallery-masonry-item').length, 2);
  await click('加载更多');
  assert.equal(document.querySelectorAll('.gallery-masonry-item').length, 2);
  assert.match(document.querySelector('[role="alert"]').textContent, /暂时无法加载/);
  fail = false;
  await click('重试');
  assert.deepEqual(pages, [1, 2, 2]);
  assert.equal(document.querySelectorAll('.gallery-masonry-item').length, 3);
  assert.ok(document.querySelector('img[src="/small-3.png"]'));
  assert.equal([...document.querySelectorAll('button')].some(button => button.textContent === '加载更多'), false);
});

test('admin gallery loads later images and reorders only the swapped pair with current sort values', async t => {
  const moved = [];
  t.mock.method(api.admin.gallery, 'list', async (params = {}) => {
    const page = Number(params.page || 1);
    return { items: page === 1 ? [photo('1'), photo('2')] : [photo('3')], total: 3, page, size: 2 };
  });
  t.mock.method(api.admin.gallery, 'reorder', async items => { moved.push(items); });
  await mount(t, require('../src/app/admin/gallery/page.tsx').default);
  await click('加载更多');
  assert.ok(document.querySelector('img[alt="Photo 3"]'));
  await React.act(async () => document.querySelector('button[aria-label="下移 Photo 1"]').click());
  assert.deepEqual(moved[0], [{ id: '1', sort_order: 2 }, { id: '2', sort_order: 1 }]);
  await React.act(async () => document.querySelector('button[aria-label="下移 Photo 1"]').click());
  assert.deepEqual(moved[1], [{ id: '1', sort_order: 3 }, { id: '3', sort_order: 2 }]);
});

test('archive merges month groups across page boundaries without duplicating posts', async t => {
  const post = id => ({ id, slug: id, title: `Post ${id}`, published_at: '2026-10-01' });
  t.mock.method(api, 'getArchive', async (params = {}) => {
    const page = Number(params.page || 1);
    return { items: [{ year: 2026, month: 10, count: 4, posts: page === 1 ? [post('1'), post('2')] : [post('2'), post('3')] }], total: 4, page, size: 2 };
  });
  await mount(t, require('../src/app/archive/page.tsx').default);
  await click('加载更多');
  assert.equal(document.querySelectorAll('h2').length, 1);
  assert.equal(document.querySelectorAll('li').length, 3);
  assert.equal(document.querySelectorAll('a[href="/posts/2"]').length, 1);
});

test('series preserves earlier chapters and uses the server total while paging', async t => {
  t.mock.method(api, 'getSeriesBySlug', async (slug, params = {}) => {
    const page = Number(params.page || 1);
    return { series: { slug, name: 'Series', posts: [{ id: `${page}`, slug: `${page}`, title: `Chapter ${page}` }] }, total: 2, page, size: 1 };
  });
  await mount(t, require('../src/app/series/[slug]/page.tsx').default, { params: Promise.resolve({ slug: 'series' }) });
  assert.match(document.body.textContent, /共 2 篇文章/);
  await click('加载更多');
  assert.ok(document.querySelector('a[href="/posts/1"]'));
  assert.ok(document.querySelector('a[href="/posts/2"]'));
});

test('navigating to another series ignores a late response from the previous series', async t => {
  let finishOld;
  t.mock.method(api, 'getSeriesBySlug', async slug => slug === 'old'
    ? new Promise(resolve => { finishOld = resolve; })
    : { series: { slug, name: 'New series', posts: [{ id: 'new', slug: 'new', title: 'New chapter' }] }, total: 1, page: 1, size: 20 });
  const view = await mount(t, require('../src/app/series/[slug]/page.tsx').default, { params: Promise.resolve({ slug: 'old' }) });
  await view.render({ params: Promise.resolve({ slug: 'new' }) });
  await React.act(async () => finishOld({ series: { slug: 'old', name: 'Old series', posts: [] }, total: 0, page: 1, size: 20 }));
  assert.equal(document.querySelector('h1')?.textContent, 'New series');
  assert.ok(document.querySelector('a[href="/posts/new"]'));
});

test('media gallery membership uses the current page and updates after toggling', async t => {
  let galleryRequests = 0;
  t.mock.method(api.admin.gallery, 'list', async () => { galleryRequests++; return { items: [] }; });
  t.mock.method(api.admin.media, 'list', async () => ({ items: [{ id: 'media-1', url: '/photo.png', filename: 'photo.png', original_name: 'photo.png', mime_type: 'image/png', tags: [], in_gallery: true }], total: 1 }));
  t.mock.method(api.admin.media.tags, 'list', async () => ({ items: [] }));
  t.mock.method(api.admin.gallery, 'toggle', async () => ({ in_gallery: false }));
  await mount(t, require('../src/app/admin/media/page.tsx').default);
  await React.act(async () => document.querySelector('button[title="编辑元信息"]').click());
  assert.equal(document.querySelector('[role="switch"]').getAttribute('aria-checked'), 'true');
  await React.act(async () => document.querySelector('[role="switch"]').click());
  assert.equal(document.querySelector('[role="switch"]').getAttribute('aria-checked'), 'false');
  assert.equal(galleryRequests, 0);
});
