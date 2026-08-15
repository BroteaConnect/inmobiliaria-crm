import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRIORITY_LEVELS, levelOf, priorityLabelKey, scoreOf } from './priority';

test('the 1-5 score maps to three states', () => {
  assert.equal(levelOf(5), 'high');
  assert.equal(levelOf(4), 'high');
  assert.equal(levelOf(3), 'medium');
  assert.equal(levelOf(2), 'low');
  assert.equal(levelOf(1), 'low');
});

test('an unset score is never rendered as a real priority', () => {
  assert.equal(levelOf(0), 'none', 'PocketBase returns 0 for an empty number field');
  assert.equal(levelOf(null), 'none');
  assert.equal(levelOf(undefined), 'none');
  assert.equal(levelOf(Number.NaN), 'none');
  assert.equal(levelOf(-1), 'none');
});

test('choosing a state writes a score that maps back to it', () => {
  for (const level of PRIORITY_LEVELS) {
    assert.equal(levelOf(scoreOf(level)), level, `${level} does not round-trip`);
  }
});

test('clearing writes null, which empties the field', () => {
  assert.equal(scoreOf('none'), null);
});

test('labels are i18n keys, never literals', () => {
  assert.equal(priorityLabelKey('high'), 'priority.high');
  assert.equal(priorityLabelKey('none'), 'priority.none');
});
