import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CACHE_KEY, DEFAULTS, adapterOf, mergeSettings, moduleEnabled, negocioPendiente, readCache, textOf, toRows, writeCache } from './settings';

const fakeStorage = (seed = {}) => {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
  };
};

test('no rows at all means the defaults, never a blank app', () => {
  assert.deepEqual(mergeSettings(), DEFAULTS);
  assert.deepEqual(mergeSettings(null), DEFAULTS);
  assert.deepEqual(mergeSettings([]), DEFAULTS);
});

test('a missing collection reads like an empty one', () => {
  // This is the two-repo trap: the schema lives in the sibling repo, so the
  // CRM can be deployed before `settings` exists. loadSettings() answers [].
  const settings = mergeSettings([]);
  assert.equal(moduleEnabled(settings, 'modules.today'), true);
  assert.equal(adapterOf(settings, 'integrations.messaging'), 'mock');
});

test('stored rows override the defaults', () => {
  const settings = mergeSettings([
    { key: 'modules.imports', value: { v: 1, enabled: false } },
    { key: 'integrations.drafting', value: { v: 1, adapter: 'live' } },
  ]);
  assert.equal(moduleEnabled(settings, 'modules.imports'), false);
  assert.equal(adapterOf(settings, 'integrations.drafting'), 'live');
  assert.equal(moduleEnabled(settings, 'modules.today'), true, 'untouched keys keep their default');
});

test('keys the app does not know are ignored', () => {
  const settings = mergeSettings([
    { key: 'modules.campaigns', value: { v: 1, enabled: true } },
    { key: 'whatever', value: { v: 1, enabled: true } },
  ]);
  assert.deepEqual(Object.keys(settings).sort(), Object.keys(DEFAULTS).sort());
});

test('a malformed value falls back to its default instead of throwing', () => {
  const settings = mergeSettings([
    { key: 'modules.today', value: null },
    { key: 'modules.leads', value: 'yes' },
    { key: 'modules.properties', value: { v: 1, enabled: 'true' } },
    { key: 'modules.imports', value: [1, 2, 3] },
  ]);
  for (const key of ['modules.today', 'modules.leads', 'modules.properties', 'modules.imports']) {
    assert.equal(moduleEnabled(settings, key), true, `${key} should have kept its default`);
  }
});

test('a value stored as a JSON string is still a value', () => {
  const settings = mergeSettings([{ key: 'modules.leads', value: '{"v":1,"enabled":false}' }]);
  assert.equal(moduleEnabled(settings, 'modules.leads'), false);
});

test('an unknown adapter is the mock, never live', () => {
  const settings = mergeSettings([
    { key: 'integrations.messaging', value: { v: 1, adapter: 'chatgpt-9' } },
    { key: 'integrations.reports', value: { v: 1 } },
  ]);
  assert.equal(adapterOf(settings, 'integrations.messaging'), 'mock');
  assert.equal(adapterOf(settings, 'integrations.reports'), 'mock');
  assert.equal(adapterOf(settings, 'integrations.nothing-here'), 'mock');
});

test('a non-secret config blob survives the round trip', () => {
  const settings = mergeSettings([
    { key: 'integrations.maps', value: { v: 1, adapter: 'live', config: { provider: 'osm' } } },
  ]);
  assert.deepEqual(settings['integrations.maps'], { v: 1, adapter: 'live', config: { provider: 'osm' } });
});

test('an unknown module is off — it does not exist', () => {
  assert.equal(moduleEnabled(DEFAULTS, 'modules.telepathy'), false);
});

test('the cache is written, read back and merged like any other source', () => {
  const storage = fakeStorage();
  const settings = mergeSettings([{ key: 'modules.imports', value: { v: 1, enabled: false } }]);
  writeCache(settings, storage);
  assert.ok(storage.data[CACHE_KEY], 'nothing was cached');
  assert.equal(moduleEnabled(readCache(storage), 'modules.imports'), false);
});

test('a corrupted or absent cache degrades to the defaults', () => {
  assert.deepEqual(readCache(fakeStorage()), DEFAULTS);
  assert.deepEqual(readCache(fakeStorage({ [CACHE_KEY]: 'not json' })), DEFAULTS);
  assert.deepEqual(readCache(fakeStorage({ [CACHE_KEY]: '[1,2,3]' })), DEFAULTS);
  assert.deepEqual(readCache(null), DEFAULTS, 'no localStorage at all is not a crash');
});

test('a storage that refuses to write costs a slower paint, not an error', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.doesNotThrow(() => writeCache(DEFAULTS, broken));
});

test('rows and the map are the same thing seen twice', () => {
  assert.deepEqual(mergeSettings(toRows(DEFAULTS)), DEFAULTS);
});

// — Datos del negocio —————————————————————————————————————————————
// Son los que la web pública pone en su aviso legal, así que lo que importa es
// que un valor a medias no llegue a una página legal como si fuera bueno.

test('un dato del negocio se lee como texto, y vacío significa pendiente', () => {
  const s = mergeSettings([{ key: 'negocio.nif', value: { v: 1, text: 'B12345678' } }]);
  assert.equal(textOf(s, 'negocio.nif'), 'B12345678');
  assert.equal(textOf(s, 'negocio.razonSocial'), '');
  assert.deepEqual(negocioPendiente(s), ['negocio.razonSocial', 'negocio.domicilio', 'negocio.registro']);
});

test('los espacios no cuentan como rellenado', () => {
  // Un campo con un espacio se ve igual de vacío en la página y distinto en la
  // base de datos: la que manda es la página.
  const s = mergeSettings([{ key: 'negocio.razonSocial', value: { v: 1, text: '   ' } }]);
  assert.equal(textOf(s, 'negocio.razonSocial'), '');
  assert.ok(negocioPendiente(s).includes('negocio.razonSocial'));
});

test('acepta la fila que alguien escribió a mano antes de esta pantalla', () => {
  const s = mergeSettings([{ key: 'contacto.whatsapp', value: { numero: '+34600123456' } }]);
  assert.equal(textOf(s, 'contacto.whatsapp'), '+34600123456');
});

test('una fila con la forma equivocada no borra el dato, deja el vacío', () => {
  const s = mergeSettings([{ key: 'negocio.nif', value: { v: 1, enabled: true } }]);
  assert.equal(textOf(s, 'negocio.nif'), '');
});

test('el JSON guardado como cadena también vale', () => {
  // PocketBase devuelve string si el campo es `text` en vez de `json`.
  const s = mergeSettings([{ key: 'negocio.domicilio', value: '{"v":1,"text":"Calle Mayor 3"}' }]);
  assert.equal(textOf(s, 'negocio.domicilio'), 'Calle Mayor 3');
});
