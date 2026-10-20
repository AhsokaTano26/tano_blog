/* eslint-disable @typescript-eslint/no-require-imports -- Shared DOM regression harness. */
require('./dom-setup.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { Select } = require('../src/components/ui/Select.tsx');
const { Checkbox } = require('../src/components/ui/Checkbox.tsx');
const { Dialog } = require('../src/components/ui/Dialog.tsx');
const { ConfirmProvider, useConfirm } = require('../src/components/ConfirmDialog.tsx');

async function mount(t, component) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  await act(async () => root.render(component));
  return host;
}
const click = async element => act(async () => element.click());
const key = async (element, value) => act(async () => {
  element.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true }));
  // Radix schedules keyboard focus changes after the key event has finished.
  await new Promise(resolve => setTimeout(resolve, 0));
});

test('select supports keyboard choice, empty values and custom popup content', async t => {
  function Example() {
    const [value, setValue] = React.useState('');
    return React.createElement(Select, { value, onChange: setValue, 'aria-label': '分类', options: [
      { value: '', label: '无分类' }, { value: 'hidden', label: '不可选', disabled: true }, { value: 'a', label: '随笔' },
    ] });
  }
  await mount(t, React.createElement(Example));
  let trigger = document.querySelector('[role="combobox"]');
  assert.match(trigger.textContent, /无分类/);
  await key(trigger, 'ArrowDown');
  assert.equal(document.querySelector('[role="listbox"]') !== null, true);
  await key(document.activeElement, 'End');
  await key(document.activeElement, 'Enter');
  assert.match(trigger.textContent, /随笔/);
  await key(trigger, 'ArrowDown');
  await key(document.activeElement, 'Home');
  await key(document.activeElement, 'Enter');
  assert.match(trigger.textContent, /无分类/);
});

test('checkbox exposes a mixed selection and respects disabled state', async t => {
  let changes = 0;
  await mount(t, React.createElement(Checkbox, { checked: false, indeterminate: true, disabled: true, label: '全选', onChange: () => changes++ }));
  const control = document.querySelector('[type="checkbox"]');
  assert.equal(control.indeterminate, true);
  assert.equal(control.disabled, true);
  await click(control);
  assert.equal(changes, 0);
});

test('Escape closes a nested select before its parent dialog', async t => {
  let closed = 0;
  await mount(t, React.createElement(Dialog, { title: '设置', onClose: () => closed++ },
    React.createElement(Select, { value: '', onChange: () => {}, 'aria-label': '状态', options: [{ value: '', label: '无' }, { value: 'a', label: '发布' }] })));
  await key(document.querySelector('[role="combobox"]'), 'ArrowDown');
  await key(document.activeElement, 'Escape');
  assert.equal(document.querySelector('[role="listbox"]') === null, true);
  assert.equal(closed, 0);
  await key(document.querySelector('[role="dialog"]'), 'Escape');
  assert.equal(closed, 1);
});

test('custom prompt returns entered text and cancellation returns null', async t => {
  function Example() {
    const { prompt } = useConfirm();
    const [result, setResult] = React.useState('');
    return React.createElement('div', null,
      React.createElement('button', { onClick: async () => setResult(String(await prompt('通行密钥名称', '旧名称'))) }, '重命名'),
      React.createElement('output', null, result));
  }
  const host = await mount(t, React.createElement(ConfirmProvider, null, React.createElement(Example)));
  const trigger = host.querySelector('button'); trigger.focus();
  await click(trigger);
  const field = document.querySelector('[role="dialog"] input');
  assert.equal(field.value, '旧名称');
  await act(async () => require('./dom-setup.js').input(field, '新名称'));
  await click([...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === '确定'));
  assert.equal(host.querySelector('output').textContent, '新名称');
  assert.equal(document.activeElement === trigger, true);
  await click(trigger);
  await key(document.querySelector('[role="dialog"]'), 'Escape');
  assert.equal(host.querySelector('output').textContent, 'null');
});
