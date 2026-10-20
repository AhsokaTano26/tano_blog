/* eslint-disable @typescript-eslint/no-require-imports -- Node tests reuse the project's TypeScript compiler. */
require('./load-typescript.js');
const Module = require('node:module');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args);
};
require.extensions['.css'] = () => {};

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/admin/posts' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent', 'localStorage']) {
  global[key] = dom.window[key];
}
// Radix focus/portal primitives use the browser DOM APIs that JSDOM exposes on
// window but does not automatically install into Node's global scope.
for (const key of ['Node', 'NodeFilter', 'Element', 'DocumentFragment', 'MutationObserver', 'CustomEvent', 'HTMLFormElement', 'HTMLSelectElement', 'HTMLOptionElement', 'FocusEvent', 'KeyboardEvent']) {
  global[key] = dom.window[key];
}
global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
global.PointerEvent = dom.window.PointerEvent || dom.window.MouseEvent;
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
HTMLElement.prototype.scrollIntoView = () => {};
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.cancelAnimationFrame = clearTimeout;
// Radix reads frame APIs from window, while application code may use globals.
window.requestAnimationFrame = callback => global.requestAnimationFrame(callback);
window.cancelAnimationFrame = id => global.cancelAnimationFrame(id);
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function input(element, value) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

module.exports = { input };
