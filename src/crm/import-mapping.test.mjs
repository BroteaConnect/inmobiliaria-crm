// Every assertion here is a way the importer fed the matcher junk, or would
// the first time a Dubai export lands with a "-" in Master Project.
//
// The esZonaValida vector table is to be mirrored in jobs/lib.test.mjs of
// the landing repo (BroteaConnect/inmobiliaria, landing PR of the same E5
// phase): the two files gate the same rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPOS, JUNK, adivina, claveDuplicado, clavesDuplicado, criteriosDe, esZonaValida,
  limpiarTexto, limpiarZona, municipioDe, numero, propiedadDe, superficieM2, tituloDe,
} from './import-mapping';

/** An Accessor over a header→value object, the way the loop builds one. */
const fila = (celdas) => (campo) => (celdas[campo] ?? '').trim();

const limpia = {
  party_tipo: 'Seller', p_nombre: 'Aisha', municipio: 'Dubai Marina',
  edificio: 'Marina Gate 1', unidad: '1413',
};

test('adivina: the transaction-register headers land on their fields', () => {
  const vectores = {
    'Master Project': 'municipio',
    BuildingNameEn: 'edificio',
    AreaNameEn: 'zona',
    Area: 'zona',
    Community: 'zona',
    'Size (sq.ft)': 'superficie',
    'Property Size': 'superficie',
    'Built-up Area': 'superficie',
    'Plot Area': 'superficie',
    'Carpet Area': 'superficie',
    ProjectNameEn: 'proyecto',
    UnitNumber: 'unidad',
    'Transaction Value': 'precio',
    NameEn: 'p_nombre',
    Mobile: 'p_telefono',
    ProcedurePartyTypeNameEn: 'party_tipo',
  };
  for (const [header, campo] of Object.entries(vectores)) {
    assert.equal(adivina(header), campo, header);
  }
  assert.ok(CAMPOS.includes('zona'), 'zona is a mapping target the select offers');
  assert.equal(adivina('whatever'), '', 'an unknown header is ignored, not guessed');
});

test('esZonaValida: the vectors the twin file also pins', () => {
  for (const v of ['Dubai Marina', 'Jumeirah Lakes Towers', 'Marsa Dubai']) {
    assert.equal(esZonaValida(v), true, v);
  }
  const malas = ['', '-', '—', 'N/A', 'n/a', '0', '12', 'Master Project', 'master  project', 'x'.repeat(81)];
  for (const v of malas) assert.equal(esZonaValida(v), false, JSON.stringify(v));
  for (const j of JUNK) assert.equal(esZonaValida(j.toUpperCase()), false, j);
  assert.equal(limpiarZona('  Dubai   Marina '), 'Dubai Marina');
  assert.equal(limpiarZona(' - '), '');
});

test('a clean row becomes a draft with its zone, building and address', () => {
  const p = propiedadDe(fila(limpia));
  assert.deepEqual(p, {
    titulo: 'Dubai Marina · Marina Gate 1 · unidad 1413', // lang-sweep: allow
    municipio: 'Dubai Marina',
    edificio: 'Marina Gate 1',
    direccion: 'Marina Gate 1, 1413',
    estado: 'borrador',
  });
  assert.ok(!('proyecto' in p), 'an unmapped project is absent, not ""');
  assert.ok(!('precio' in p), 'a blank price is absent, not 0');
});

test('a junk master project is dropped: no municipio, a title without it', () => {
  const val = fila({ municipio: '-', edificio: 'Burj Vista 1', unidad: '2205' });
  const p = propiedadDe(val);
  assert.ok(!('municipio' in p), 'junk never reaches municipio');
  assert.equal(p.titulo, 'Burj Vista 1 · unidad 2205'); // lang-sweep: allow
  assert.equal(p.edificio, 'Burj Vista 1');
  assert.equal(municipioDe(val), '');
  assert.equal(tituloDe(fila({ municipio: 'N/A', edificio: 'Burj Vista 1' })), 'Burj Vista 1');
});

test('a junk unit is dropped from the title and the address, a numeric one is kept', () => {
  const p = propiedadDe(fila({ municipio: 'Dubai Marina', edificio: 'Marina Gate 1', unidad: '-' }));
  assert.equal(p.titulo, 'Dubai Marina · Marina Gate 1');
  assert.equal(p.direccion, 'Marina Gate 1');
  assert.equal(tituloDe(fila({ edificio: 'Marina Gate 1', unidad: 'N/A' })), 'Marina Gate 1');
  assert.equal(tituloDe(fila({ edificio: 'Marina Gate 1', unidad: ' 2205 ' })), 'Marina Gate 1 · unidad 2205'); // lang-sweep: allow
  assert.equal(limpiarTexto('2205'), '2205', 'a unit is a number: numerics survive');
  assert.equal(limpiarTexto('—'), '');
  assert.equal(limpiarTexto('tbd'), '');
});

test('the Area/Community column backs up a junk master project', () => {
  const val = fila({ municipio: '-', zona: 'Burj Khalifa', edificio: 'Burj Vista 1', unidad: '2205' });
  const p = propiedadDe(val);
  assert.equal(p.municipio, 'Burj Khalifa');
  assert.equal(p.titulo, 'Burj Khalifa · Burj Vista 1 · unidad 2205'); // lang-sweep: allow
  // A real master project wins over the community: the first is the zone the
  // agents name.
  assert.equal(municipioDe(fila({ municipio: 'Dubai Marina', zona: 'Marsa Dubai' })), 'Dubai Marina');
  // Junk in both stays junk.
  assert.equal(municipioDe(fila({ municipio: 'Area', zona: '0' })), '');
});

test('criteriosDe keeps the exact shape the matcher parses, junk-free', () => {
  const val = fila({
    municipio: 'Jumeirah Lakes Towers', edificio: 'Seven City', unidad: '1413',
    precio: '1200000', t_proc: 'compra', t_fecha: '29/12/2022', p_pais: 'España',
  });
  assert.equal(
    criteriosDe(val),
    'Compró en Jumeirah Lakes Towers · Seven City · unidad 1413 · ~1200000 · Procedimiento: compra · Fecha: 29/12/2022 · País: España', // lang-sweep: allow
  );
  const sucio = criteriosDe(fila({ municipio: '-', edificio: 'Marina Gate 1', unidad: '1413', precio: '1,200,000' }));
  assert.equal(sucio, 'Compró en Marina Gate 1 · unidad 1413 · ~1,200,000'); // lang-sweep: allow
  assert.ok(!sucio.includes('-  ') && !sucio.startsWith('Compró en -'), 'no junk in the text'); // lang-sweep: allow
  assert.equal(criteriosDe(fila({})), '', 'nothing to say, nothing said');
});

test('claveDuplicado: a title imported with the junk equals the one imported without', () => {
  assert.equal(
    claveDuplicado('- · Burj Vista 1 · unidad 2205'), // lang-sweep: allow
    claveDuplicado('Burj Vista 1 · unidad 2205'), // lang-sweep: allow
  );
  assert.equal(claveDuplicado('BURJ VISTA 1 · Unidad 2205'), 'burj vista 1 · unidad 2205'); // lang-sweep: allow
  assert.equal(claveDuplicado('N/A · - · Marina Gate 1'), 'marina gate 1');
  // Only LEADING junk goes: a junk segment in the middle is part of the name.
  assert.equal(claveDuplicado('Dubai Marina · - · unidad 3'), 'dubai marina · - · unidad 3'); // lang-sweep: allow
  // A title that is junk end to end still keys to something, never to ''.
  assert.equal(claveDuplicado('-'), '-');
  assert.equal(claveDuplicado('Piso en Chamberí'), 'piso en chamberí'); // lang-sweep: allow
});

test('clavesDuplicado: a zone that appears between two imports does not double the row', () => {
  const existentes = new Set(clavesDuplicado('- · Burj Vista 1 · unidad 2205')); // lang-sweep: allow
  const nueva = clavesDuplicado('Burj Khalifa · Burj Vista 1 · unidad 2205'); // lang-sweep: allow
  assert.deepEqual(nueva, ['burj khalifa · burj vista 1 · unidad 2205', 'burj vista 1 · unidad 2205']); // lang-sweep: allow
  assert.ok(nueva.some((k) => existentes.has(k)), 'the building · unit tail is the shared key');
  // And the other way round: the zoned row exists, the CSV without an Area column comes back.
  const zonadas = new Set(clavesDuplicado('Burj Khalifa · Burj Vista 1 · unidad 2205')); // lang-sweep: allow
  assert.ok(clavesDuplicado('Burj Vista 1 · unidad 2205').some((k) => zonadas.has(k))); // lang-sweep: allow
  // Two segments have no tail: unit 1413 in two buildings is two flats.
  assert.deepEqual(clavesDuplicado('Marina Gate 1 · unidad 1413'), ['marina gate 1 · unidad 1413']); // lang-sweep: allow
  const otra = new Set(clavesDuplicado('Marina Gate 2 · unidad 1413')); // lang-sweep: allow
  assert.ok(!clavesDuplicado('Marina Gate 1 · unidad 1413').some((k) => otra.has(k))); // lang-sweep: allow
  // A one-segment title answers to itself only.
  assert.deepEqual(clavesDuplicado('Piso en Chamberí'), ['piso en chamberí']); // lang-sweep: allow
});

test('numero and superficieM2 are unchanged', () => {
  assert.equal(numero('1,250,000.50'), 1250000.5);
  assert.equal(numero('AED 1,200,000'), 1200000);
  assert.equal(numero('620000'), 620000);
  assert.equal(numero('0'), undefined);
  assert.equal(numero(''), undefined);
  assert.equal(numero('abc'), undefined);
  assert.equal(superficieM2('1,000'), 93);
  assert.equal(superficieM2('1184.03'), 110);
  assert.equal(superficieM2(''), undefined);
});
