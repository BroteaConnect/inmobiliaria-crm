import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adapterFor, coerceAdapterKind, isAdapterBuilt, isPortAvailable } from './select';
import { createMockMessaging } from './messaging/mock';
import { createMockDrafting } from './drafting/mock';

const portWith = (adapters) => ({ id: 'test', labelKey: 'integration.test', adapters });

test('an unknown adapter value resolves to the mock, never to live', () => {
  assert.equal(coerceAdapterKind('live'), 'live');
  assert.equal(coerceAdapterKind('mock'), 'mock');
  assert.equal(coerceAdapterKind('LIVE'), 'mock');
  assert.equal(coerceAdapterKind(undefined), 'mock');
  assert.equal(coerceAdapterKind(null), 'mock');
  assert.equal(coerceAdapterKind(true), 'mock');
  assert.equal(coerceAdapterKind({ adapter: 'live' }), 'mock');
});

test('asking for an adapter nobody built falls back to the mock, and says so', () => {
  const port = portWith({ mock: () => ({ live: false }), live: () => null });
  const chosen = adapterFor(port, 'live');
  assert.equal(chosen.kind, 'mock', 'the caller must be able to tell it did not get live');
  assert.equal(chosen.api.live, false);
});

test('a port with nothing behind it hands back null instead of pretending', () => {
  const port = portWith({ mock: () => null, live: () => null });
  assert.deepEqual(adapterFor(port, 'mock'), { kind: 'mock', api: null });
  assert.equal(isPortAvailable(port), false);
  assert.equal(isAdapterBuilt(port, 'mock'), false);
});

test('a built adapter is the one you get', () => {
  const live = { live: true };
  const port = portWith({ mock: () => ({ live: false }), live: () => live });
  const chosen = adapterFor(port, 'live');
  assert.equal(chosen.kind, 'live');
  assert.equal(chosen.api, live);
  assert.equal(isPortAvailable(port), true);
});

test('every mock messaging receipt is marked simulated', async () => {
  const messaging = createMockMessaging({ now: () => new Date('2026-08-15T09:00:00.000Z'), newId: () => 'sim_1' });
  assert.equal(messaging.live, false);
  const receipt = await messaging.send({ leadId: 'l1', channel: 'whatsapp', body: 'hola' });
  assert.equal(receipt.simulated, true);
  assert.equal(receipt.messageId, 'sim_1');
  assert.equal(receipt.queuedAt, '2026-08-15T09:00:00.000Z');
});

test('a simulated send is written down as simulado, not as enviado', async () => {
  const written = [];
  const messaging = createMockMessaging({
    record: async (m) => { written.push(m); },
    newId: () => 'sim_1',
  });
  await messaging.send({ leadId: 'l1', channel: 'email', body: 'hola', subject: 'Hi' });
  assert.equal(written.length, 1);
  assert.equal(written[0].receipt.simulated, true);
  assert.equal(written[0].leadId, 'l1');
  assert.equal(written[0].subject, 'Hi');
});

test('a send whose activity could not be written is not a success', async () => {
  const messaging = createMockMessaging({ record: async () => { throw new Error('pb 404'); } });
  await assert.rejects(() => messaging.send({ leadId: 'l1', channel: 'whatsapp', body: 'hola' }), /pb 404/);
});

test('the mock draft is composed from locale keys, never from literals', async () => {
  const asked = [];
  const translate = (locale, key, vars) => { asked.push(key); return `[${key}:${vars?.name ?? vars?.property ?? vars?.title ?? ''}]`; };
  const drafting = createMockDrafting({ translate });
  assert.equal(drafting.live, false);

  const out = await drafting.draft({
    lead: { id: 'l1', nombre: 'Ada', expand: { propiedad: { titulo: 'Marina 3B' } } },
    locale: 'es',
  });
  assert.equal(out.simulated, true);
  assert.deepEqual(asked, [
    'draft.template.greeting',
    'draft.template.property',
    'draft.template.body',
    'draft.template.signoff',
  ]);
  assert.ok(out.text.includes('[draft.template.greeting:Ada]'));
});

test('a lead with no property asks for no property fragment', async () => {
  const asked = [];
  const drafting = createMockDrafting({ translate: (l, key) => { asked.push(key); return key; } });
  await drafting.draft({ lead: { id: 'l1', nombre: 'Ada' }, locale: 'en' });
  assert.ok(!asked.includes('draft.template.property'));
});

test('the tones pick different keys, and short drops the sign-off', async () => {
  const keysFor = async (tone) => {
    const asked = [];
    const drafting = createMockDrafting({ translate: (l, key) => { asked.push(key); return key; } });
    await drafting.draft({ lead: { id: 'l1', nombre: 'Ada' }, locale: 'es', tone });
    return asked;
  };
  assert.ok((await keysFor('formal')).includes('draft.template.greetingFormal'));
  const short = await keysFor('short');
  assert.ok(short.includes('draft.template.bodyShort'));
  assert.ok(!short.includes('draft.template.signoff'));
});
