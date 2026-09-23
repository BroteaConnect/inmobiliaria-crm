import { test } from 'node:test';
import assert from 'node:assert/strict';
import { madridDayBounds, madridMidnight, madridTodayFilter, pbDateLiteral } from './madrid-day';

const iso = (d) => d.toISOString();
const at = (s) => new Date(s);

test('a winter day runs from 23:00Z to 23:00Z (CET is +1)', () => {
  const { from, to } = madridDayBounds(at('2026-01-15T10:00:00Z'));
  assert.equal(iso(from), '2026-01-14T23:00:00.000Z');
  assert.equal(iso(to), '2026-01-15T23:00:00.000Z');
});

test('a summer day runs from 22:00Z to 22:00Z (CEST is +2)', () => {
  const { from, to } = madridDayBounds(at('2026-07-01T12:00:00Z'));
  assert.equal(iso(from), '2026-06-30T22:00:00.000Z');
  assert.equal(iso(to), '2026-07-01T22:00:00.000Z');
});

test('23:30Z is already the next day in Madrid', () => {
  // The trap this module exists for: a visit booked at 01:30 Madrid time is
  // 23:30Z of the previous date, and a naive `cuando ~ "2026-06-11"` misses it.
  const { from, to } = madridDayBounds(at('2026-06-10T23:30:00Z'));
  assert.equal(iso(from), '2026-06-10T22:00:00.000Z', 'the day containing 23:30Z starts on the 10th UTC');
  assert.equal(iso(to), '2026-06-11T22:00:00.000Z');
  // And in winter the same instant is 00:30 of the 11th — same conclusion.
  const winter = madridDayBounds(at('2026-01-10T23:30:00Z'));
  assert.equal(iso(winter.from), '2026-01-10T23:00:00.000Z');
  assert.equal(iso(winter.to), '2026-01-11T23:00:00.000Z');
});

test('2026-03-29, the spring-forward day, is 23 hours long', () => {
  const { from, to } = madridDayBounds(at('2026-03-29T12:00:00Z'));
  assert.equal(iso(from), '2026-03-28T23:00:00.000Z', 'midnight is still CET');
  assert.equal(iso(to), '2026-03-29T22:00:00.000Z', 'the next midnight is already CEST');
  assert.equal((to - from) / 3600000, 23);
});

test('2026-10-25, the fall-back day, is 25 hours long', () => {
  const { from, to } = madridDayBounds(at('2026-10-25T12:00:00Z'));
  assert.equal(iso(from), '2026-10-24T22:00:00.000Z', 'midnight is still CEST');
  assert.equal(iso(to), '2026-10-25T23:00:00.000Z', 'the next midnight is already CET');
  assert.equal((to - from) / 3600000, 25);
});

test('the bounds are stable across the whole day, on both DST edges', () => {
  for (const day of ['2026-03-29', '2026-10-25', '2026-08-15']) {
    const ref = madridDayBounds(at(`${day}T12:00:00Z`));
    for (let ms = ref.from.getTime(); ms < ref.to.getTime(); ms += 15 * 60000) {
      const b = madridDayBounds(new Date(ms));
      assert.equal(iso(b.from), iso(ref.from), `${new Date(ms).toISOString()} moved the start`);
      assert.equal(iso(b.to), iso(ref.to), `${new Date(ms).toISOString()} moved the end`);
    }
    // One instant before the start belongs to the previous day; the end belongs to the next.
    assert.notEqual(iso(madridDayBounds(new Date(ref.from.getTime() - 1)).from), iso(ref.from));
    assert.equal(iso(madridDayBounds(ref.to).from), iso(ref.to));
  }
});

test('the day after the 31st is the 1st — no calendar of our own', () => {
  assert.equal(iso(madridMidnight(2026, 12, 32)), iso(madridMidnight(2027, 1, 1)));
  assert.equal(iso(madridMidnight(2026, 2, 29)), iso(madridMidnight(2026, 3, 1)));
});

test('the filter uses the PocketBase literal, space-separated and with millis', () => {
  assert.equal(pbDateLiteral(at('2026-06-10T22:00:00Z')), '2026-06-10 22:00:00.000Z');
  assert.equal(
    madridTodayFilter('cuando', at('2026-06-11T09:00:00Z')),
    'cuando >= "2026-06-10 22:00:00.000Z" && cuando < "2026-06-11 22:00:00.000Z"',
  );
});
