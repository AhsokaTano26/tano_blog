/* eslint-disable @typescript-eslint/no-require-imports -- Node tests reuse the project's TypeScript loader. */
require('./load-typescript.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const { alignSelection, selectionAlignment } = require('../src/lib/editor-alignment.ts');

test('alignment expands selected paragraphs and preserves the selected text', () => {
  const content = 'Before\n\nFirst **paragraph**\n\nSecond paragraph\n\nAfter';
  const start = content.indexOf('**');
  const end = content.indexOf('\n\nAfter');
  const result = alignSelection(content, start, end, 'right');
  assert.equal(result.content.slice(result.start, result.end), content.slice(start, end));
  assert.equal(result.content, 'Before\n\n<div style="text-align: right;">\n\nFirst **paragraph**\n\nSecond paragraph\n\n</div>\n\nAfter');
  assert.equal(selectionAlignment(result.content, result.start, result.end), 'right');
});

test('alignment preserves fenced code containing blank lines as a complete block', () => {
  const content = 'Before\n\n```js\nlet x = 1;\n\nx++;\n```\n\nAfter';
  const position = content.indexOf('x++;');
  const result = alignSelection(content, position, position, 'center');
  assert.equal(result.content, 'Before\n\n<div style="text-align: center;">\n\n```js\nlet x = 1;\n\nx++;\n```\n\n</div>\n\nAfter');
});

test('an empty paragraph gets an insertion point inside the alignment block', () => {
  const result = alignSelection('', 0, 0, 'center');
  assert.equal(result.content.slice(0, result.start), '<div style="text-align: center;">\n\n');
  assert.equal(result.start, result.end);
  const again = alignSelection(result.content, result.start, result.end, 'center');
  assert.equal(again.content, result.content);
  assert.equal(again.start, result.start);
});

test('HTML examples inside fenced code are never rewritten as alignment wrappers', () => {
  const content = '```html\n<div style="text-align: center;">\n\nExample\n\n</div>\n```';
  const position = content.indexOf('Example');
  assert.equal(selectionAlignment(content, position), 'left');
  const result = alignSelection(content, position, position, 'right');
  assert.equal(result.content, `<div style="text-align: right;">\n\n${content}\n\n</div>`);
});

test('a selection crossing an aligned block and another paragraph changes all selected text', () => {
  const initial = alignSelection('First\n\nSecond', 0, 0, 'center').content;
  const start = initial.indexOf('First');
  const result = alignSelection(initial, start, initial.length, 'right');
  assert.equal(result.content.includes('text-align: center;'), false, 'an old inner alignment must not override the new selection');
  assert.equal(result.content.slice(result.start, result.end).endsWith('Second'), true);
  const reset = alignSelection(result.content, result.start, result.end, 'left');
  assert.equal(reset.content.includes('text-align: right;'), false, 'changing an outer aligned block also updates its nested alignment');
});
