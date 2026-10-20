/* eslint-disable @typescript-eslint/no-require-imports -- Shared DOM interactions for custom controls. */
const assert = require('node:assert/strict');
const { act } = require('react');

async function key(element, value) {
  assert.equal(Boolean(element), true, `Missing keyboard target for ${value}`);
  await act(async () => {
    element.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function openSelect(trigger) {
  assert.equal(Boolean(trigger), true, 'Missing select trigger');
  if (trigger.getAttribute('aria-expanded') !== 'true') await key(trigger, 'ArrowDown');
  const listbox = document.getElementById(trigger.getAttribute('aria-controls'));
  assert.equal(Boolean(listbox), true, 'The select must expose its option list');
  return listbox;
}

async function selectValue(trigger, value) {
  const listbox = await openSelect(trigger);
  const option = [...listbox.querySelectorAll('[role="option"]')].find(node => node.dataset.value === value);
  assert.equal(Boolean(option), true, `Missing select option ${value}`);
  assert.notEqual(option.getAttribute('aria-disabled'), 'true', `Select option ${value} is disabled`);
  await act(async () => option.focus());
  await key(option, 'Enter');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false', 'Selecting an option must close the popup');
}

function currentDialog() {
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].at(-1) || null;
}

function dialogButton(text) {
  const dialog = currentDialog();
  return dialog && [...dialog.querySelectorAll('button')].find(node => node.textContent.trim() === text);
}

module.exports = { key, openSelect, selectValue, currentDialog, dialogButton };
