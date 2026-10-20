/* eslint-disable @typescript-eslint/no-require-imports -- Theme lifecycle tests use the shared DOM harness. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { ThemeProvider, useTheme } = require('../src/lib/theme.tsx');

function Controls() {
  const { theme: current, setTheme } = useTheme();
  return React.createElement('div', null, React.createElement('output', null, current), ...['light', 'dark', 'system'].map(theme =>
    React.createElement('button', { key: theme, onClick: () => setTheme(theme) }, theme)));
}

async function mount(t, { reduced = false, systemDark = false } = {}) {
  document.documentElement.className = 'dark';
  document.documentElement.style.colorScheme = 'dark';
  localStorage.clear();
  const listeners = new Set();
  const system = { matches: systemDark, addEventListener: (_type, listener) => listeners.add(listener), removeEventListener: (_type, listener) => listeners.delete(listener) };
  window.matchMedia = query => query === '(prefers-color-scheme: dark)' ? system : { matches: reduced };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let unmounted = false;
  const unmount = async () => {
    if (!unmounted) { await act(async () => root.unmount()); unmounted = true; host.remove(); }
  };
  t.after(unmount);
  await act(async () => root.render(React.createElement(ThemeProvider, null, React.createElement(Controls))));
  return {
    system, listeners, unmount, current: () => host.querySelector('output').textContent,
    select: async theme => act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === theme).click()),
  };
}

// The browser captures the old page before invoking update, then resolves
// finished after its compositor animation. Keep those stages controllable.
function viewTransitions(t, { fail = false } = {}) {
  const descriptor = Object.getOwnPropertyDescriptor(document, 'startViewTransition');
  const transitions = [];
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: update => {
    if (fail) throw new Error('Snapshot unavailable');
    let finish;
    const transition = {
      ready: Promise.resolve(),
      finished: new Promise(resolve => { finish = resolve; }),
      skipped: false,
      skipTransition() { this.skipped = true; },
      update: () => act(async () => update()),
      finish: () => act(async () => finish()),
    };
    transitions.push(transition);
    return transition;
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(document, 'startViewTransition', descriptor);
    else delete document.startViewTransition;
  });
  return transitions;
}

test('theme and controls update together inside a single page transition', async t => {
  const transitions = viewTransitions(t);
  const view = await mount(t);
  await view.select('light');
  assert.equal(transitions.length, 1);
  assert.equal(view.current(), 'dark');
  assert.equal(document.documentElement.classList.contains('dark'), true);
  await transitions[0].update();
  assert.equal(view.current(), 'light');
  assert.equal(document.documentElement.classList.contains('light'), true);
  assert.equal(document.documentElement.style.colorScheme, 'light');
  assert.equal(localStorage.getItem('theme'), 'light');
  assert.equal(document.documentElement.classList.contains('theme-transitioning'), true);
  await transitions[0].finish();
  assert.equal(document.documentElement.classList.contains('theme-transitioning'), false);
});

test('an older theme transition cannot clear a newer transition', async t => {
  const transitions = viewTransitions(t);
  const view = await mount(t);
  await view.select('light');
  await transitions[0].update();
  await view.select('dark');
  assert.equal(transitions[0].skipped, true);
  await transitions[1].update();
  await transitions[0].finish();
  assert.equal(document.documentElement.classList.contains('dark'), true);
  assert.equal(document.documentElement.classList.contains('theme-transitioning'), true);
  await transitions[1].finish();
  assert.equal(document.documentElement.classList.contains('theme-transitioning'), false);
});

test('a superseded snapshot callback cannot restore the previous theme', async t => {
  const transitions = viewTransitions(t);
  const view = await mount(t);
  await view.select('light');
  await view.select('dark');
  assert.equal(transitions[0].skipped, true);
  await transitions[0].update();
  assert.equal(view.current(), 'dark');
  assert.equal(document.documentElement.classList.contains('dark'), true);
  assert.equal(document.documentElement.classList.contains('theme-transitioning'), false);
});

test('reduced motion changes the theme without starting an animation', async t => {
  const transitions = viewTransitions(t);
  const view = await mount(t, { reduced: true });
  await view.select('light');
  assert.equal(transitions.length, 0);
  assert.equal(document.documentElement.classList.contains('light'), true);
  assert.equal(document.documentElement.classList.contains('theme-transitioning'), false);
  assert.equal(document.documentElement.style.colorScheme, 'light');
});

test('browsers without page transitions apply the theme without leaving animation state', async t => {
  t.mock.method(global, 'requestAnimationFrame', () => 1);
  const view = await mount(t);
  await view.select('light');
  assert.equal(view.current(), 'light');
  assert.equal(document.documentElement.classList.contains('light'), true);
  assert.equal(document.documentElement.classList.contains('theme-transitioning'), false);
});

test('a snapshot failure falls back to the requested theme', async t => {
  viewTransitions(t, { fail: true });
  const view = await mount(t);
  await view.select('light');
  assert.equal(view.current(), 'light');
  assert.equal(document.documentElement.classList.contains('light'), true);
  assert.equal(document.documentElement.classList.contains('theme-transitioning'), false);
});

test('equivalent theme choices do not start a redundant page animation', async t => {
  const transitions = viewTransitions(t);
  const view = await mount(t, { systemDark: true });
  await view.select('system');
  assert.equal(view.current(), 'system');
  assert.equal(transitions.length, 0);
});

test('system theme changes keep native controls and the page in the same color scheme', async t => {
  const view = await mount(t, { systemDark: true });
  await view.select('system');
  view.system.matches = false;
  await act(async () => { for (const listener of view.listeners) listener(); });
  assert.equal(document.documentElement.classList.contains('light'), true);
  assert.equal(document.documentElement.style.colorScheme, 'light');
});

test('unmounting skips the animation and invalidates its pending update', async t => {
  const transitions = viewTransitions(t);
  const view = await mount(t);
  await view.select('light');
  await view.unmount();
  assert.equal(transitions[0].skipped, true);
  await transitions[0].update();
  assert.equal(document.documentElement.classList.contains('dark'), true);
  assert.equal(document.documentElement.classList.contains('theme-transitioning'), false);
});
