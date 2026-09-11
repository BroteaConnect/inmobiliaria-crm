// Every assertion here is a way the property form has been wrong, or would be
// wrong the first time somebody edits a record instead of creating one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_FIELDS, canSave, fieldsOf, payloadOf } from './property-form';

const full = {
  titulo: '  Ático con terraza  ', municipio: 'Madrid', direccion: 'Calle Mayor, 3', // lang-sweep: allow
  precio: '620000', habitaciones: '3', banos: '2', superficie: '110',
  descripcion: 'Con terraza de 20 m².', propietario: 'own1', // lang-sweep: allow
};

test('a create omits what the agent left empty', () => {
  const p = payloadOf({ ...EMPTY_FIELDS, titulo: 'Piso en Getafe' }, false);
  // Only the title and the status a new property is born in.
  assert.deepEqual(Object.keys(p).sort(), ['estado', 'titulo']);
  assert.equal(p.estado, 'borrador');
  // A blank price must not reach PocketBase as 0 or null: the field keeps its
  // own default and the draft does not claim a price nobody set.
  assert.ok(!('precio' in p));
});

test('an edit sends every field, empties included, so clearing one clears it', () => {
  const p = payloadOf({ ...EMPTY_FIELDS, titulo: 'Piso en Getafe' }, true);
  assert.equal(p.municipio, '');
  assert.equal(p.direccion, '');
  assert.equal(p.descripcion, '');
  assert.equal(p.propietario, '', 'an owner removed in the form must be removed in the record');
  assert.equal(p.precio, null, 'a cleared number is null, not absent: absent would leave the old price');
  assert.equal(p.habitaciones, null);
});

test('a save never carries the status: publishing is its own decision', () => {
  assert.ok(!('estado' in payloadOf(full, true)));
});

test('numbers travel as numbers and the title is trimmed', () => {
  const p = payloadOf(full, false);
  assert.equal(p.titulo, 'Ático con terraza'); // lang-sweep: allow
  assert.equal(p.precio, 620000);
  assert.equal(typeof p.precio, 'number');
  assert.equal(p.superficie, 110);
});

test('something that is not a number is treated as blank, never as NaN', () => {
  const dirty = { ...EMPTY_FIELDS, titulo: 'X', precio: '620.000 AED' };
  assert.equal(payloadOf(dirty, true).precio, null);
  assert.ok(!('precio' in payloadOf(dirty, false)));
});

test('a stored record comes back into the form with empty boxes, not zeroes', () => {
  // PocketBase answers 0 for a number field that was never set; a form showing
  // "0 baths" invites the agent to save a lie.
  const f = fieldsOf({ titulo: 'Piso', precio: 0, habitaciones: 0, banos: 0, superficie: 0 });
  assert.equal(f.precio, '');
  assert.equal(f.banos, '');
  assert.equal(f.titulo, 'Piso');
});

test('a record with real numbers round-trips through the form unchanged', () => {
  const record = {
    titulo: 'Ático', municipio: 'Madrid', direccion: 'Mayor 3', precio: 620000, // lang-sweep: allow
    habitaciones: 3, banos: 2, superficie: 110, descripcion: 'Luminoso', propietario: 'own1', // lang-sweep: allow
  };
  const p = payloadOf(fieldsOf(record), true);
  for (const [k, v] of Object.entries(record)) assert.equal(p[k], v, k);
});

test('a missing text field is an empty box, not "undefined"', () => {
  const f = fieldsOf({ titulo: 'Piso' });
  assert.equal(f.municipio, '');
  assert.equal(f.propietario, '');
});

test('a property cannot be saved without a title', () => {
  assert.equal(canSave(EMPTY_FIELDS), false);
  assert.equal(canSave({ ...EMPTY_FIELDS, titulo: '   ' }), false);
  assert.equal(canSave({ ...EMPTY_FIELDS, titulo: 'Piso' }), true);
});
