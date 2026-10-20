/* eslint-disable @typescript-eslint/no-require-imports */
const { input } = require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { validDateValue, localDateTimeTimestamp } = require('../src/lib/date-value.ts');
const { scheduledTimestamp } = require('../src/lib/post-settings.ts');

// Radix renders real portals and observes the same DOM that the controls use.
for (const key of ['Node', 'Element', 'DocumentFragment', 'MutationObserver', 'CustomEvent', 'HTMLButtonElement']) {
  global[key] = window[key];
}
global.getComputedStyle = window.getComputedStyle.bind(window);
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
HTMLElement.prototype.scrollIntoView = () => {};

async function mount(t, component, initial, extra = {}) {
  const { DatePicker, TimePicker, DateTimePicker } = require('../src/components/ui/DateTimePicker.tsx');
  const Component = { DatePicker, TimePicker, DateTimePicker }[component];
  const changes = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  function Field() {
    const [value, setValue] = React.useState(initial);
    return React.createElement(Component, {
      value,
      onChange: next => { changes.push(next); setValue(next); },
      'aria-label': '测试时间字段',
      ...extra,
    });
  }
  await act(async () => root.render(React.createElement(Field)));
  return { host, changes, field: host.querySelector('input[type="text"]') };
}

test('date text entry keeps local dates and rejects impossible or out-of-range values', async t => {
  const { changes, field } = await mount(t, 'DatePicker', '', { min: '2024-02-01', max: '2024-03-01', required: true });
  assert.equal(field.checkValidity(), false);
  await act(async () => input(field, '2024-02-30'));
  assert.equal(field.checkValidity(), false);
  assert.equal(changes.at(-1), '2024-02-30');
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  await act(async () => input(field, '2024-01-31'));
  assert.equal(field.checkValidity(), false);
  assert.equal(changes.at(-1), '2024-01-31');
  await act(async () => input(field, '2024-02-29'));
  assert.equal(field.checkValidity(), true);
  assert.equal(changes.at(-1), '2024-02-29');
  await act(async () => input(field, ''));
  assert.equal(changes.at(-1), '');
  assert.equal(field.checkValidity(), false);
});

test('manual dates cannot normalize impossible calendar values into saved timestamps', () => {
  assert.equal(validDateValue('2024-02-29'), true);
  assert.equal(validDateValue('2025-02-29'), false);
  assert.equal(validDateValue('2024-02-30'), false);
  assert.throws(() => scheduledTimestamp('2024-02-30T08:15', 'draft'), /有效/);
  assert.throws(() => localDateTimeTimestamp('2024-02-29T25:00'), /有效/);
  assert.equal(scheduledTimestamp('', 'draft'), null);
  assert.equal(scheduledTimestamp('2024-02-29T08:15', 'draft'), new Date('2024-02-29T08:15').toISOString());
});

test('calendar follows leap-day keyboard navigation and disables dates outside its limits', async t => {
  const { host, field } = await mount(t, 'DatePicker', '2024-02-28', { min: '2024-02-28', max: '2024-03-01' });
  await act(async () => host.querySelector('button[aria-haspopup="dialog"]').click());
  const earlier = document.querySelector('[data-date="2024-02-27"]');
  const selected = document.querySelector('[data-date="2024-02-28"]');
  assert.equal(earlier.disabled, true);
  selected.focus();
  await act(async () => selected.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  assert.equal(document.activeElement.getAttribute('data-date'), '2024-02-29');
  await act(async () => document.activeElement.click());
  assert.equal(field.value, '2024-02-29');
});

test('datetime calendar preserves the local time and clearing preserves an empty value', async t => {
  const { host, changes, field } = await mount(t, 'DateTimePicker', '2024-02-28T08:15');
  await act(async () => host.querySelector('button[aria-haspopup="dialog"]').click());
  await act(async () => document.querySelector('[data-date="2024-02-29"]').click());
  assert.equal(field.value, '2024-02-29T08:15');
  const clear = [...document.querySelectorAll('button')].find(button => button.textContent === '清空');
  assert.equal(clear !== undefined, true);
  await act(async () => clear.click());
  assert.equal(field.value, '');
  assert.equal(changes.at(-1), '');
});

test('time text entry validates clock bounds without a browser time control', async t => {
  const { host, changes, field } = await mount(t, 'TimePicker', '08:15', { min: '08:00', max: '18:00' });
  assert.equal(host.querySelector('input[type="time"]') === null, true);
  await act(async () => input(field, '25:00'));
  assert.equal(field.checkValidity(), false);
  await act(async () => input(field, '07:59'));
  assert.equal(field.checkValidity(), false);
  assert.equal(changes.at(-1), '07:59');
  await act(async () => input(field, '17:42'));
  assert.equal(field.checkValidity(), true);
  assert.equal(changes.at(-1), '17:42');
});

test('file picker keeps native ref and events while exposing chosen names in its custom UI', async t => {
  const { FilePicker } = require('../src/components/ui/FilePicker.tsx');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const ref = React.createRef();
  const changes = [];
  await act(async () => root.render(React.createElement(FilePicker, { ref, multiple: true, accept: 'image/*', 'aria-label': '选择封面', onChange: event => changes.push(event.target.files.length) })));
  assert.equal(ref.current === host.querySelector('input[type="file"]'), true);
  assert.equal(ref.current.accept, 'image/*');
  assert.equal(ref.current.getAttribute('aria-hidden'), 'true', 'the custom trigger must be the only announced file-selection button');
  Object.defineProperty(ref.current, 'files', { configurable: true, value: [new window.File(['x'], '封面.png', { type: 'image/png' }), new window.File(['y'], '第二张.png', { type: 'image/png' })] });
  await act(async () => ref.current.dispatchEvent(new Event('change', { bubbles: true })));
  assert.deepEqual(changes, [2]);
  assert.equal(host.textContent.includes('封面.png'), true);
  assert.equal(host.textContent.includes('第二张.png'), true);
});
