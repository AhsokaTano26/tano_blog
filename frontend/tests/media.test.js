/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests use the CommonJS TypeScript loader. */
require('./load-typescript.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('article image rendering preserves chosen dimensions and layout styles', () => {
  const { MarkdownImage } = require('../src/components/MarkdownImage.tsx');
  const html = renderToStaticMarkup(React.createElement(MarkdownImage, {
    src: '/uploads/photo.png', alt: 'Photo', width: 320, height: 160,
    style: { width: '50%', height: 'auto' },
    node: { type: 'element' },
  }));
  assert.match(html, /width="320"/);
  assert.match(html, /height="160"/);
  assert.match(html, /width:50%/);
  assert.match(html, /height:auto/);
  assert.doesNotMatch(html, /node=/);
});

test('clipboard files include every image and preserve ordinary text paste', () => {
  const { getClipboardImages } = require('../src/lib/editor-upload.ts');
  const first = new File(['one'], 'one.png', { type: 'image/png' });
  const second = new File(['two'], 'two.JPG');
  const text = new File(['text'], 'notes.txt', { type: 'text/plain' });
  assert.deepEqual(getClipboardImages({ files: [first, second, text], items: [] }), [first, second]);
  assert.deepEqual(getClipboardImages({ files: [], items: [{ type: 'text/plain', getAsFile: () => null }] }), []);
  assert.deepEqual(getClipboardImages({ files: [], items: [{ type: 'image/png', getAsFile: () => first }] }), [first]);
});

test('finishing uploads preserves subsequent typing and reverse completion order', () => {
  const { replaceUploadPlaceholder } = require('../src/lib/editor-upload.ts');
  let content = 'before <!-- upload:one -->\n<!-- upload:two --> after: newly typed text';
  content = replaceUploadPlaceholder(content, '<!-- upload:two -->', '![two](/two.png)');
  content = replaceUploadPlaceholder(content, '<!-- upload:one -->', '![one](/one.png)');
  assert.equal(content, 'before ![one](/one.png)\n![two](/two.png) after: newly typed text');
  assert.equal(replaceUploadPlaceholder('user removed the placeholder', '<!-- upload:one -->', 'image'), 'user removed the placeholder');
});

test('clipboard upload filenames have an extension accepted by the backend', () => {
  const { uploadFilename } = require('../src/lib/editor-upload.ts');
  assert.equal(uploadFilename(new File(['image'], 'image', { type: 'image/png' })), 'image.png');
  assert.equal(uploadFilename(new File(['image'], 'screenshot.jpg', { type: 'image/jpeg' })), 'screenshot.jpg');
});

test('editing a later image never includes an earlier figure in its replacement range', () => {
  const { findImageInContent } = require('../src/lib/article-image.ts');
  const first = '<figure class="editor-image"><img src="/first.png" /></figure>';
  const second = '<figure class="editor-image"><img src="/second.png" style="width:50%;" /></figure>';
  const content = `${first}\nKeep this paragraph\n${second}`;
  const found = findImageInContent(content, '/second.png');
  assert.equal(content.slice(found.start, found.end), second);
  assert.equal(found.attrs.width, '50%');
});

test('numeric image dimensions become valid CSS pixel sizes', () => {
  const { generateImageHtml } = require('../src/lib/article-image.ts');
  const html = generateImageHtml({ url: '/photo.png', alt: '', width: '320', height: '160', align: 'center', caption: '', linkUrl: '' });
  assert.match(html, /width: 320px;/);
  assert.match(html, /height: 160px;/);
});

test('upload replacement adjusts the caret without moving it away from new typing', () => {
  const { uploadSelection } = require('../src/lib/editor-upload.ts');
  const content = 'start <!-- upload:one --> end';
  assert.deepEqual(uploadSelection(content, '<!-- upload:one -->', '![photo](/photo.png)', 28, 28), { start: 29, end: 29 });
  assert.deepEqual(uploadSelection(content, '<!-- upload:one -->', 'image', 28, 28), { start: 14, end: 14 });
  assert.deepEqual(uploadSelection(content, '<!-- upload:one -->', 'image', 2, 4), { start: 2, end: 4 });
  assert.equal(uploadSelection('placeholder deleted; continue typing', '<!-- upload:one -->', 'image', 20, 20), null);
});
