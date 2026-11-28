import assert from 'node:assert/strict';
import test from 'node:test';
import {bindSalesAmount} from './sales-report-editing.mjs';

function amount(value, type = 'number', readOnly = false) {
  const input = Object.assign(new EventTarget(), {type, readOnly, value, validity: {badInput: false}});
  Object.defineProperty(input, 'valueAsNumber', {get: () => Number.parseFloat(input.value)});
  let draft = value;
  input.addEventListener('input', () => { draft = input.value; });
  bindSalesAmount(input);
  return {input, draft: () => draft};
}

test('an editable zero clears on focus and returns to zero when left empty', () => {
  const {input, draft} = amount('0');
  input.dispatchEvent(new Event('focus'));
  assert.equal(input.value, '');
  assert.equal(draft(), '');
  input.dispatchEvent(new Event('blur'));
  assert.equal(draft(), '0');
});

test('existing or typed nonzero sales amounts survive focus and blur', () => {
  const {input, draft} = amount('14000');
  input.dispatchEvent(new Event('focus'));
  assert.equal(draft(), '14000');
  input.value = '25000';
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('blur'));
  assert.equal(draft(), '25000');
});

test('read-only totals and return notes keep their value', () => {
  for (const item of [amount('0', 'number', true), amount('0', 'text')]) {
    item.input.dispatchEvent(new Event('focus'));
    assert.equal(item.input.value, '0');
  }
});
