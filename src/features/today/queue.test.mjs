import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUCKETS, STALE_MS, buildQueue, summarize } from './queue';

const NOW = Date.parse('2026-08-15T09:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const HOUR = 3600000;
const DAY = 86400000;

const lead = (over = {}) => ({
  id: 'l1', nombre: 'Ada', telefono: '', email: '', mensaje: '', propiedad: '',
  etapa: 'nuevo', origen: 'web', created: ago(HOUR), ...over,
});

const inbound = (over = {}) => ({
  id: 'a1', lead: 'l1', tipo: 'whatsapp', nota: 'hola', created: ago(HOUR),
  direccion: 'entrante', ...over,
});

test('an empty day produces an empty queue, not a placeholder', () => {
  assert.deepEqual(buildQueue({ leads: [], now: NOW }), []);
  assert.deepEqual(buildQueue({ leads: [], activities: [], now: NOW }), []);
});

test('a new lead nobody has answered is the first bucket', () => {
  const q = buildQueue({ leads: [lead()], now: NOW });
  assert.equal(q.length, 1);
  assert.equal(q[0].bucket, 'newUnanswered');
  assert.equal(q[0].since, lead().created, 'the wait is measured from when it came in');
});

test('a client who wrote after our last contact needs a reply', () => {
  const l = lead({ etapa: 'contactado', ultimo_contacto: ago(4 * HOUR) });
  const q = buildQueue({ leads: [l], activities: [inbound({ created: ago(HOUR) })], now: NOW });
  assert.equal(q.length, 1);
  assert.equal(q[0].bucket, 'draftReady');
  assert.equal(q[0].trigger?.id, 'a1');
});

test('an inbound message older than our reply is already answered', () => {
  const l = lead({ etapa: 'contactado', ultimo_contacto: ago(HOUR) });
  const q = buildQueue({ leads: [l], activities: [inbound({ created: ago(4 * HOUR) })], now: NOW });
  assert.deepEqual(q, [], 'we answered after they wrote; nothing is owed');
});

test('only the newest inbound message counts', () => {
  const l = lead({ etapa: 'contactado', ultimo_contacto: ago(2 * HOUR) });
  const q = buildQueue({
    leads: [l],
    activities: [inbound({ id: 'old', created: ago(5 * HOUR) }), inbound({ id: 'new', created: ago(HOUR) })],
    now: NOW,
  });
  assert.equal(q[0].trigger?.id, 'new');
});

test('outbound activity never puts a lead in the reply bucket', () => {
  const l = lead({ etapa: 'contactado', ultimo_contacto: ago(HOUR) });
  const q = buildQueue({
    leads: [l],
    activities: [inbound({ direccion: 'saliente', created: ago(1000) })],
    now: NOW,
  });
  assert.deepEqual(q, []);
});

test('two days without contact is stale, one day is not', () => {
  const stale = lead({ id: 'l1', etapa: 'visita', ultimo_contacto: ago(STALE_MS + HOUR) });
  const fresh = lead({ id: 'l2', etapa: 'visita', ultimo_contacto: ago(DAY) });
  const q = buildQueue({ leads: [stale, fresh], now: NOW });
  assert.deepEqual(q.map((i) => [i.lead.id, i.bucket]), [['l1', 'stale']]);
});

test('sold and parked leads are waiting on nobody', () => {
  const leads = [
    lead({ id: 'l1', etapa: 'vendido', ultimo_contacto: ago(30 * DAY) }),
    lead({ id: 'l2', etapa: 'nutriendo', ultimo_contacto: ago(30 * DAY) }),
  ];
  assert.deepEqual(buildQueue({ leads, now: NOW }), []);
});

test('a lead lands in exactly one bucket', () => {
  // New, never contacted AND far past the stale threshold: both rules match.
  const l = lead({ created: ago(10 * DAY) });
  const q = buildQueue({ leads: [l], activities: [inbound({ created: ago(9 * DAY) })], now: NOW });
  assert.equal(q.length, 1);
  assert.equal(q[0].bucket, 'newUnanswered', 'the first matching bucket wins');
});

test('buckets order the day, then priority, then the longest wait', () => {
  const leads = [
    lead({ id: 'stale', etapa: 'visita', ultimo_contacto: ago(9 * DAY) }),
    lead({ id: 'newLow', created: ago(2 * HOUR), prioridad: 1 }),
    lead({ id: 'newHigh', created: ago(HOUR), prioridad: 5 }),
  ];
  const q = buildQueue({ leads, now: NOW });
  assert.deepEqual(q.map((i) => i.lead.id), ['newHigh', 'newLow', 'stale']);
  assert.deepEqual([...BUCKETS], ['newUnanswered', 'draftReady', 'stale']);
});

test('equal priority inside a bucket puts the longest wait first', () => {
  const leads = [
    lead({ id: 'recent', created: ago(HOUR) }),
    lead({ id: 'older', created: ago(6 * HOUR) }),
  ];
  assert.deepEqual(buildQueue({ leads, now: NOW }).map((i) => i.lead.id), ['older', 'recent']);
});

test('a dismissed lead leaves the queue for the day', () => {
  const q = buildQueue({ leads: [lead()], dismissed: ['l1'], now: NOW });
  assert.deepEqual(q, []);
});

test('the summary counts rows, never illustrations', () => {
  const leads = [
    lead({ id: 'l1', created: ago(HOUR) }),
    lead({ id: 'l2', etapa: 'visita', created: ago(20 * DAY), ultimo_contacto: ago(9 * DAY) }),
    lead({ id: 'l3', etapa: 'vendido', created: ago(20 * DAY), ultimo_contacto: ago(9 * DAY) }),
  ];
  const s = summarize(leads, buildQueue({ leads, now: NOW }), NOW);
  assert.equal(s.total, 3);
  assert.equal(s.pending, 2, 'the sold lead is not queued');
  assert.equal(s.unattended, 2, 'the sold lead is not unattended either');
  assert.equal(s.newThisWeek, 1);
});

test('an empty board summarises to zeroes, not to blanks', () => {
  assert.deepEqual(summarize([], [], NOW), { total: 0, pending: 0, unattended: 0, newThisWeek: 0 });
});
