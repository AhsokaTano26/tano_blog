/* eslint-disable @typescript-eslint/no-require-imports -- Node regressions reuse the TypeScript loader. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { createRoot } = require('react-dom/client');
const Module = require('node:module');
let pathname = '/';
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'next/navigation') return { usePathname: () => pathname, useRouter: () => ({ push() {}, refresh() {} }) };
  if (request === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
  if (request === 'next/dynamic') return { __esModule: true, default: () => () => null };
  return originalLoad.call(this, request, ...args);
};
const { Footer } = require('../src/components/Footer.tsx');
const { ClientLayout } = require('../src/components/ClientLayout.tsx');
Module._load = originalLoad;
const { api } = require('../src/lib/api.ts');
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
global.self = window;

async function mount(t, component, config) {
  t.mock.method(api, 'getPublicConfig', async () => ({ config }));
  t.mock.method(api, 'getNavLinks', async () => ({ items: [] }));
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await React.act(async () => root.unmount()); host.remove(); });
  await React.act(async () => root.render(component));
  return { host, async render(element) { await React.act(async () => root.render(element)); } };
}

test('shared footer has copyright and feed links even without custom footer text', async t => {
  const { host } = await mount(t, React.createElement(Footer), { site_title: '测试站点' });
  assert.equal(host.querySelectorAll('footer').length, 1);
  assert.match(host.textContent, new RegExp(`© ${new Date().getFullYear()} 测试站点`));
  assert.equal(host.querySelectorAll('a[href="/rss.xml"]').length, 1);
  assert.equal(host.querySelectorAll('a[href="/sitemap.xml"]').length, 1);
});

test('footer server rendering works before browser-only sanitization is available', () => {
  const result = spawnSync(process.execPath, ['-e', `
    require('./tests/load-typescript.js');
    const Module = require('node:module');
    const path = require('node:path');
    const resolve = Module._resolveFilename;
    Module._resolveFilename = function(request, ...args) {
      return resolve.call(this, request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request, ...args);
    };
    const React = require('react');
    const { renderToString } = require('react-dom/server');
    const { Footer } = require('./src/components/Footer.tsx');
    process.stdout.write(renderToString(React.createElement(Footer)));
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /data-site-footer/);
  assert.match(result.stdout, /rss.xml/);
});

test('footer renders configured copyright and injected content once with unsafe HTML removed', async t => {
  const { host } = await mount(t, React.createElement(Footer), {
    footer_text: '© {year} <a href="https://example.com">Tano</a><img src=x onerror="alert(1)">',
    footer_injection: '<p>自定义页脚</p><script>alert(1)</script>',
  });
  assert.equal(host.querySelectorAll('[data-injection="footer"]').length, 1);
  assert.match(host.textContent, /自定义页脚/);
  assert.equal(host.querySelectorAll('script, img, [onerror]').length, 0);
  assert.match(host.textContent, new RegExp(`© ${new Date().getFullYear()} Tano`));
});

test('one shared footer follows ordinary public pages while music stays fullscreen', async t => {
  const view = element => React.createElement(ClientLayout, null, React.createElement('div', { 'data-page': true }, element));
  const { host, render } = await mount(t, view('Page'), { footer_text: '© {year} Tano', footer_injection: '<p>公共内容</p>' });
  let footer;
  for (const route of ['/', '/archive', '/links', '/posts/test-short', '/gallery', '/about']) {
    pathname = route;
    await render(view(route));
    assert.equal(host.querySelectorAll('[data-site-footer]').length, 1, route);
    assert.equal(host.querySelectorAll('.banner-container').length, route === '/' ? 0 : 1, `${route} keeps the default page banner`);
    assert.equal(host.querySelectorAll('[data-injection="footer"]').length, 1, route);
    const current = host.querySelector('[data-site-footer]');
    if (footer) assert.equal(current === footer, true, 'navigation reuses the same footer');
    footer = current;
    assert.equal(Boolean(host.querySelector('main').compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING), true);
  }
  pathname = '/music';
  await render(view('/music'));
  assert.equal(host.querySelector('[data-site-footer]') === null, true);
  assert.equal(document.documentElement.classList.contains('music-fullscreen'), true);
  pathname = '/links';
  await render(view('/links'));
  assert.equal(host.querySelectorAll('[data-site-footer]').length, 1);
  assert.equal(document.documentElement.classList.contains('music-fullscreen'), false);
});
