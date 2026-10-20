/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const directory = path.join(__dirname, '../../backend/internal/entryanimation');

test('private document renders inert text and synchronizes theme without restarting', t => {
  let html = fs.readFileSync(path.join(directory, 'player.html'), 'utf8');
  const text = {};
  for (const match of html.matchAll(/data-entry="([^"]+)"/g)) text[match[1]] = match[1];
  text.welcome_title = '</script><img src=x onerror=alert(1)>';
  text.data_stream = 'first line\nsecond line';
  const stages = ['access', 'identity', 'request', 'read', 'verify'].map((key, index) => {
    for (const suffix of ['title', 'subtitle', 'label', 'log', 'log_en']) text[`stage_${key}_${suffix}`] = `${key} ${suffix}`;
    return { Key: key, Phase: key, Position: '45%', Start: index * 1000, End: (index + 1) * 1000 };
  });
  html = html.replace('/*ENTRY_DATA*/', JSON.stringify({ text, icon: '', stages }).replaceAll('<', '\\u003c'));
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  t.after(() => dom.window.close());
  const messages = [];
  dom.window.postMessage = message => messages.push(message.type);
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 400 });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() {
    return this.classList.contains('admin-entry-welcome-type') ? 1000 : 120;
  } });
  dom.window.eval(fs.readFileSync(path.join(directory, 'player.js'), 'utf8'));
  const { document } = dom.window;
  assert.equal(document.querySelectorAll('.admin-entry-status').length, 5);
  assert.equal(document.querySelectorAll('.admin-entry-slats i').length, 6);
  assert.equal(document.querySelector('[data-entry=welcome_title]').textContent, text.welcome_title);
  assert.equal(document.querySelector('img') === null, true);
  const welcomeScale = Number(document.querySelector('.admin-entry-welcome-type').style.getPropertyValue('--fit-scale'));
  assert.equal(welcomeScale > 0 && welcomeScale <= .28, true, 'long welcome copy must fit within the available height');
  assert.equal(document.documentElement.classList.contains('entry-running'), false);
  const theme = (mode, hue) => dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    source: dom.window, data: { type: 'entry:theme', mode, hue },
  }));
  theme('light', 120);
  assert.equal(document.documentElement.classList.contains('entry-running'), true);
  assert.equal(document.documentElement.classList.contains('light'), true);
  assert.equal(document.documentElement.style.getPropertyValue('--entry-hue'), '120');
  theme('dark', 300);
  assert.equal(document.documentElement.classList.contains('dark'), true);
  assert.equal(messages.filter(value => value === 'entry:started').length, 1);
  document.querySelector('.admin-entry-skip').click();
  document.querySelector('.admin-entry-skip').click();
  assert.equal(messages.filter(value => value === 'entry:finish').length, 1);
});

test('private animation content and assets do not live in public source directories', () => {
  const files = [];
  const visit = directory => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = path.join(directory, item.name);
      if (item.isDirectory()) visit(name);
      else if (/\.(tsx?|jsx?|css|html|json|svg)$/.test(name)) files.push(name);
    }
  };
  visit(path.join(__dirname, '../src'));
  visit(path.join(__dirname, '../public'));
  for (const file of files) {
    assert.equal(/TANO ARCHIVE|SYNTHESIZE INFORMATION|admin-entry-prologue|需要访问许可/.test(fs.readFileSync(file, 'utf8')), false, file);
  }
});
