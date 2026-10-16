/* eslint-disable @typescript-eslint/no-require-imports */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');

test('failed DOM presence and identity assertions produce bounded primitive diagnostics', async t => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await React.act(() => root.unmount()); container.remove(); });
  await React.act(() => root.render(React.createElement('button', null, '加载更多')));
  const button = container.querySelector('button');
  let inspected = 0;
  // A tiny sentinel catches accidental inspection without constructing a large
  // object graph or executing the historical unsafe assertion.
  Object.defineProperty(button, 'inspectionSentinel', {
    enumerable: true, get() { inspected++; return 'must not inspect DOM'; },
  });
  for (const predicate of [button === undefined, button === null, button === document.createElement('button')]) {
    let failure;
    try { assert.equal(predicate, true); } catch (error) { failure = error; }
    assert.ok(failure);
    assert.equal(failure.code, 'ERR_ASSERTION');
    assert.equal(typeof failure.actual, 'boolean');
    assert.equal(failure.message.length < 256, true);
    assert.equal(inspected, 0);
  }
});
