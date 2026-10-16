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
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.cancelAnimationFrame = clearTimeout;
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
