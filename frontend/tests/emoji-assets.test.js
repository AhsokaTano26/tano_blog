/* eslint-disable @typescript-eslint/no-require-imports */
require('./load-typescript.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EMOJI_OPTIONS, emojiAsset } = require('../src/lib/emoji.ts');

test('emoji assets normalize presentation selectors and reject unknown values', () => {
  assert.equal(typeof emojiAsset, 'function');
  assert.equal(emojiAsset('👍'), '/emoji/twemoji/1f44d.svg');
  assert.equal(emojiAsset('❤️'), '/emoji/twemoji/2764.svg');
  assert.equal(emojiAsset('bd24:01'), '/emoji/bangdream/bd24-01.webp');
  assert.equal(emojiAsset('../missing'), null);
  assert.equal(emojiAsset('🫠'), null);
});

test('every selectable emoji has a local image asset', () => {
  assert.equal(typeof emojiAsset, 'function');
  for (const { emoji } of EMOJI_OPTIONS) {
    const asset = emojiAsset(emoji);
    assert.equal(typeof asset, 'string', `missing icon mapping for ${emoji}`);
    const file = path.join(__dirname, '../public', asset);
    assert.equal(fs.existsSync(file), true, `missing local icon for ${emoji}`);
    const bytes = fs.readFileSync(file);
    if (asset.endsWith('.svg')) assert.match(bytes.toString('utf8'), /<svg\b/);
    else {
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.equal(bytes.length < 32 * 1024, true, `sticker ${emoji} should be a thumbnail`);
      assert.equal(Array.from(emoji).length <= 10, true, 'both reaction APIs accept at most ten characters');
    }
  }
});
