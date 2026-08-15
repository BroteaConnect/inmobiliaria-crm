// Cada aserción es una forma en que un informe puede mentir sin fallar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embudo, nuevos, periodos, procedencia, tiempoPrimeraRespuesta, variacion } from './informes.ts';

const AHORA = Date.UTC(2026, 7, 15, 12, 0, 0);
const hace = (dias, horas = 0) => new Date(AHORA - dias * 86400000 - horas * 3600000).toISOString();
const { actual, previo } = periodos(30, AHORA);

test('los periodos no se solapan ni dejan hueco', () => {
  assert.equal(previo.hasta, actual.desde);
  assert.equal(actual.hasta - actual.desde, previo.hasta - previo.desde);
});

test('un lead cuenta en el periodo en el que se creó, y solo en uno', () => {
  const leads = [
    { id: '1', created: hace(2) }, { id: '2', created: hace(29) },
    { id: '3', created: hace(31) }, { id: '4', created: hace(400) },
  ];
  assert.equal(nuevos(leads, actual), 2);
  assert.equal(nuevos(leads, previo), 1);
});

test('la variación no dice "infinito por ciento"', () => {
  // 0 → 3 no es un aumento del infinito: es «3, antes ninguno», y una tarjeta
  // que imprime Infinity es una tarjeta que nadie vuelve a mirar.
  assert.equal(variacion(3, 0), null);
  assert.equal(variacion(12, 10), 20);
  assert.equal(variacion(8, 10), -20);
  assert.equal(variacion(0, 0), null);
});

test('el embudo respeta el orden del tablero y cuenta ceros', () => {
  const etapas = ['nuevo', 'contactado', 'visita'];
  const out = embudo([{ etapa: 'nuevo' }, { etapa: 'visita' }, { etapa: 'nuevo' }], etapas);
  assert.deepEqual(out, [{ etapa: 'nuevo', n: 2 }, { etapa: 'contactado', n: 0 }, { etapa: 'visita', n: 1 }]);
});

test('la primera respuesta se mide en mediana, no en media', () => {
  // Tres respuestas rápidas y una tardísima: la media diría 30 h, la mediana
  // dice 2, y 2 es lo que pasa de verdad casi siempre.
  const leads = [1, 2, 3, 4].map((n) => ({ id: `l${n}`, created: hace(5) }));
  const acts = [
    { lead: 'l1', created: hace(5, -1), direccion: 'saliente', tipo: 'llamada' },
    { lead: 'l2', created: hace(5, -2), direccion: 'saliente', tipo: 'email' },
    { lead: 'l3', created: hace(5, -3), direccion: 'saliente', tipo: 'llamada' },
    { lead: 'l4', created: hace(5, -120), direccion: 'saliente', tipo: 'llamada' },
  ];
  const r = tiempoPrimeraRespuesta(leads, acts, actual);
  assert.equal(r.medidos, 4);
  assert.equal(r.horas, 2.5);
});

test('un lead sin responder no cuenta como respuesta instantánea', () => {
  // Contarlo como cero diría que se responde más rápido de lo que se responde.
  const leads = [{ id: 'a', created: hace(3) }, { id: 'b', created: hace(3) }];
  const acts = [{ lead: 'a', created: hace(3, -4), direccion: 'saliente', tipo: 'llamada' }];
  const r = tiempoPrimeraRespuesta(leads, acts, actual);
  assert.equal(r.medidos, 1);
  assert.equal(r.sinResponder, 1);
  assert.equal(r.horas, 4);
});

test('una nota no es responder al cliente, y lo entrante tampoco', () => {
  const leads = [{ id: 'a', created: hace(3) }];
  const acts = [
    { lead: 'a', created: hace(3, -1), direccion: 'saliente', tipo: 'nota' },
    { lead: 'a', created: hace(3, -2), direccion: 'entrante', tipo: 'whatsapp' },
  ];
  assert.equal(tiempoPrimeraRespuesta(leads, acts, actual).sinResponder, 1);
});

test('una actividad anterior al lead no cuenta como su respuesta', () => {
  // Pasa al importar histórico: la fecha de creación es la de la importación.
  const leads = [{ id: 'a', created: hace(3) }];
  const acts = [{ lead: 'a', created: hace(10), direccion: 'saliente', tipo: 'llamada' }];
  assert.equal(tiempoPrimeraRespuesta(leads, acts, actual).sinResponder, 1);
});

test('la procedencia normaliza el texto libre y no inventa origen', () => {
  const leads = [
    { created: hace(1), origen: 'Web' }, { created: hace(2), origen: 'web ' },
    { created: hace(3), origen: 'manual' }, { created: hace(4), origen: '' },
    { created: hace(40), origen: 'web' },
  ];
  assert.deepEqual(procedencia(leads, actual), [
    { origen: 'web', n: 2 }, { origen: '(sin origen)', n: 1 }, { origen: 'manual', n: 1 },
  ]);
});
