/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests use the CommonJS TypeScript loader. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { renderToStaticMarkup } = require('react-dom/server');
const ArticleMarkdown = require('../src/components/ArticleMarkdown.tsx').default;

test('editor variant renders fenced highlighted and plain code using real Markdown components', () => {
  const html = renderToStaticMarkup(React.createElement(ArticleMarkdown, { variant: 'editor', content: [
    '```js\nconst answer = 42;\n```',
    '```\nplain code\n```',
    '```mermaid\ngraph TD\nA --> B\n```',
  ].join('\n\n') }));
  const container = document.createElement('div');
  container.innerHTML = html;
  assert.equal(container.querySelectorAll('pre').length, 3);
  assert.equal(container.querySelector('pre code.language-js')?.textContent, 'const answer = 42;\n');
  assert.ok(container.querySelector('code.language-js .hljs-keyword'));
  assert.match(container.querySelectorAll('pre')[1].textContent, /plain code/);
  assert.ok(container.querySelector('.mermaid-diagram'));
  assert.equal(container.querySelector('.article-code-header') === null, true);
});

test('article rendering preserves rich Markdown while removing unsafe HTML', () => {
  const html = renderToStaticMarkup(React.createElement(ArticleMarkdown, { content: [
    '# A heading',
    '$E = mc^2$ and $\\ce{2H2 + O2 -> 2H2O}$',
    '> [!NOTE]\n> A note',
    '```js\nconst answer = 42;\n```',
    '```mermaid\ngraph TD\nA --> B\n```',
    '<figure class="editor-image-gallery"><img src="/photo.png" alt="Photo" width="320" height="160" style="width: 50%; height: auto;" /></figure>',
    '<audio src="/song.mp3" controls></audio>',
    '<video src="/film.mp4" controls></video>',
    '<script>alert(1)</script><img src="/safe.png" onerror="alert(1)" />',
  ].join('\n\n') }));
  const container = document.createElement('div');
  container.innerHTML = html;
  assert.equal(container.querySelector('h1#a-heading').textContent, 'A heading');
  assert.equal(container.querySelectorAll('.katex').length, 2);
  assert.equal(Boolean(container.querySelector('.katex-error')), false);
  assert.match(container.textContent, /A note/);
  assert.match(container.querySelector('.article-code-block').textContent, /const answer = 42/);
  assert.equal(Boolean(container.querySelector('.mermaid-diagram')), true);
  assert.equal(Boolean(require.cache[require.resolve('mermaid')]), false);
  const image = container.querySelector('.editor-image-gallery img');
  assert.equal(image.getAttribute('width'), '320');
  assert.equal(image.getAttribute('height'), '160');
  assert.equal(image.style.width, '50%');
  assert.equal(image.style.height, 'auto');
  assert.equal(container.querySelector('audio').getAttribute('src'), '/song.mp3');
  assert.equal(container.querySelector('video').getAttribute('src'), '/film.mp4');
  assert.equal(Boolean(container.querySelector('script, [onerror]')), false);
});

test('article state updates reuse parsed Markdown until content changes', async t => {
  const container = document.createElement('div');
  const root = createRoot(container);
  t.after(async () => React.act(async () => root.unmount()));
  const content = '# Original\n\n$E = mc^2$';
  const render = (count, text) => React.createElement('article', null,
    React.createElement('span', null, count), React.createElement(ArticleMarkdown, { content: text }));
  await React.act(async () => root.render(render(1, content)));
  const katex = require('katex');
  const calls = t.mock.method(katex, 'renderToString');
  await React.act(async () => root.render(render(2, content)));
  assert.equal(calls.mock.callCount(), 0);
  assert.equal(container.querySelector('h1').textContent, 'Original');
  await React.act(async () => root.render(render(3, '# Updated\n\n$x^2$')));
  assert.equal(calls.mock.callCount(), 1);
  assert.equal(container.querySelector('h1').textContent, 'Updated');
});
