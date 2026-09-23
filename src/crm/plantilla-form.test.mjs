// Every assertion here is a way the template editor or the send dialog could
// be wrong without anybody noticing until a phone shows "{{fecha}}" in plain
// text or a lead in Dubai is told a flat costs AED 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PLANTILLA, WINDOW_MS, congelados, contentAprobado, contentEstadoDe, esDirty, faltantes, fieldsOf,
  payloadOf, placeholdersOf, render, reparoDe, validate, variablesDeLead, ventanaAbierta, viaPrevista,
} from './plantilla-form';

const ok = {
  ...EMPTY_PLANTILLA,
  nombre: 'Confirmación de visita', // lang-sweep: allow
  categoria: 'utility',
  cuerpo_es: 'Hola {{nombre}}, te esperamos en {{propiedad}} el {{fecha}}.', // lang-sweep: allow
  cuerpo_en: 'Hi {{nombre}}, see you at {{propiedad}} on {{fecha}}.',
  variables: ['nombre', 'propiedad', 'fecha'],
  estado: 'aprobada',
};
const codes = (f) => validate(f).map((p) => p.code);

test('placeholdersOf: unique, in order of first appearance, single braces ignored', () => {
  assert.deepEqual(placeholdersOf('{{b}} y {{a}} y {{ b }} y {c} y {{a}}'), ['b', 'a']);
  assert.deepEqual(placeholdersOf(''), []);
  assert.deepEqual(placeholdersOf(undefined), []);
});

test('an undeclared placeholder is reported per language, subject included', () => {
  const es = validate({ ...ok, cuerpo_es: `${ok.cuerpo_es} a las {{hora}}` });
  assert.deepEqual(es.find((p) => p.code === 'noDeclarada'), { code: 'noDeclarada', idioma: 'es', variables: ['hora'] });
  const en = validate({ ...ok, asunto_en: 'About {{agente}}', asunto_es: 'Sobre {{agente}}' }); // lang-sweep: allow
  const noDeclaradas = en.filter((p) => p.code === 'noDeclarada');
  assert.deepEqual(noDeclaradas.map((p) => p.idioma), ['es', 'en']);
  assert.deepEqual(noDeclaradas[1].variables, ['agente']);
});

test('the two languages must use the same placeholders, whichever side has the extra one', () => {
  const masEs = validate({ ...ok, cuerpo_es: `${ok.cuerpo_es} {{fecha}} {{nombre}}`, cuerpo_en: 'Hi {{nombre}}.' });
  assert.deepEqual(masEs.find((p) => p.code === 'distintas'), { code: 'distintas', es: ['nombre', 'propiedad', 'fecha'], en: ['nombre'] });
  const masEn = validate({ ...ok, cuerpo_es: 'Hola {{nombre}}.', variables: ['nombre', 'propiedad', 'fecha'] }); // lang-sweep: allow
  assert.equal(masEn.find((p) => p.code === 'distintas').en.length, 3);
  // Order is not a difference: the Spanish sentence may put the date first.
  assert.deepEqual(codes({ ...ok, cuerpo_es: 'El {{fecha}} en {{propiedad}}, {{nombre}}.' }), []);
  // A declared variable nobody uses is allowed: the seed declares `agente`
  // on templates whose body does not mention it yet.
  assert.deepEqual(codes({ ...ok, variables: [...ok.variables, 'agente'] }), []);
});

test('a name, both bodies and well-formed variable names are required', () => {
  assert.deepEqual(codes({ ...ok, nombre: '  ' }), ['faltaNombre']);
  assert.deepEqual(codes({ ...ok, cuerpo_en: '' }), ['faltaCuerpo', 'distintas']);
  const malos = validate({ ...ok, variables: [...ok.variables, 'Fecha Hora', '1x'] });
  assert.deepEqual(malos.map((p) => p.nombre).filter(Boolean), ['Fecha Hora', '1x']);
  assert.deepEqual(codes(ok), []);
});

test('payloadOf bumps the version from whatever is stored, 0 included', () => {
  assert.equal(payloadOf(ok, { version: 0 }).version, 1);
  assert.equal(payloadOf(ok, {}).version, 1);
  assert.equal(payloadOf(ok, { version: 3 }).version, 4);
});

test('payloadOf never carries the platform\'s or the chassis\'s columns', () => {
  const p = payloadOf(ok, { version: 1, clave: 'visita.confirmacion', canal: 'whatsapp', evento: 'visita.created', content_sid: 'HX1', content_estado: 'approved' });
  for (const k of ['clave', 'canal', 'evento', 'content_sid', 'content_estado', 'content_motivo', 'content_sid_en', 'content_estado_en', 'content_motivo_en', 'id']) {
    assert.ok(!(k in p), `${k} must not be in the payload`);
  }
  assert.deepEqual(Object.keys(p).sort(), ['asunto_en', 'asunto_es', 'categoria', 'cuerpo_en', 'cuerpo_es', 'estado', 'nombre', 'variables', 'version']);
});

test('payloadOf sends empties (a cleared subject clears it) and dedupes the variables', () => {
  const p = payloadOf({ ...ok, asunto_es: '', asunto_en: ' ', categoria: '', variables: [' nombre', 'nombre', 'fecha ', 'propiedad', ''] }, { version: 2 });
  assert.equal(p.asunto_es, '');
  assert.equal(p.asunto_en, '');
  assert.equal(p.categoria, '');
  assert.deepEqual(p.variables, ['nombre', 'fecha', 'propiedad']);
});

test('fieldsOf tolerates variables stored as null, as a JSON string or as something else', () => {
  assert.deepEqual(fieldsOf({ nombre: 'X', variables: null }).variables, []);
  assert.deepEqual(fieldsOf({ nombre: 'X', variables: '["nombre","fecha"]' }).variables, ['nombre', 'fecha']);
  assert.deepEqual(fieldsOf({ nombre: 'X', variables: 'nombre, fecha' }).variables, ['nombre', 'fecha']);
  assert.deepEqual(fieldsOf({ nombre: 'X', variables: 42 }).variables, []);
  assert.deepEqual(fieldsOf({ nombre: 'X', variables: { a: 1 } }).variables, []);
  const f = fieldsOf({});
  assert.equal(f.nombre, '');
  assert.equal(f.estado, 'borrador');
  assert.equal(f.categoria, '');
  for (const v of Object.values(f)) assert.notEqual(v, undefined);
});

test('render fills what it knows and leaves the rest as written; faltantes names what is empty', () => {
  assert.equal(render('Hola {{nombre}}, {{ propiedad }} el {{fecha}}', { nombre: 'Laura', propiedad: 'Ático' }), 'Hola Laura, Ático el {{fecha}}'); // lang-sweep: allow
  assert.equal(render('{{x}}', { x: '' }), '{{x}}');
  assert.deepEqual(faltantes(['nombre', 'fecha', 'hora'], { nombre: 'Laura', fecha: '  ' }), ['fecha', 'hora']);
  assert.deepEqual(faltantes([], {}), []);
});

test('variablesDeLead never says "undefined" and a price of 0 is an empty box', () => {
  const sinNada = variablesDeLead({ id: 'l1', nombre: 'Laura' }, undefined, 'AED', 'es');
  assert.deepEqual(sinNada, { nombre: 'Laura', propiedad: '', zona: '', precio: '', agente: '' });
  for (const v of Object.values(sinNada)) assert.ok(!v.includes('undefined'));
  const cero = variablesDeLead({ id: 'l1', nombre: 'Laura', expand: { propiedad: { titulo: 'Ático', municipio: 'Dubai Marina', precio: 0 } } }, 'Ana', 'AED', 'en'); // lang-sweep: allow
  assert.equal(cero.precio, '');
  assert.equal(cero.propiedad, 'Ático'); // lang-sweep: allow
  assert.equal(cero.zona, 'Dubai Marina');
  assert.equal(cero.agente, 'Ana');
  const conPrecio = variablesDeLead({ id: 'l1', nombre: 'Laura', expand: { propiedad: { titulo: 'X', municipio: 'Y', precio: 1200000 } } }, 'Ana', 'AED', 'en');
  assert.match(conPrecio.precio, /1,200,000/);
  assert.match(conPrecio.precio, /AED/);
});

test('a stored row round-trips through the form: fieldsOf then payloadOf changes nothing but the version', () => {
  const row = {
    nombre: 'Confirmación de visita', categoria: 'utility', asunto_es: 'Visita', asunto_en: 'Visit', // lang-sweep: allow
    cuerpo_es: ok.cuerpo_es, cuerpo_en: ok.cuerpo_en, variables: ['nombre', 'propiedad', 'fecha'], estado: 'aprobada', version: 5,
  };
  const p = payloadOf(fieldsOf(row), row);
  for (const [k, v] of Object.entries(row)) {
    if (k === 'version') assert.equal(p.version, 6);
    else assert.deepEqual(p[k], v, k);
  }
});

test('esDirty sees every field, and a form nobody touched is not dirty', () => {
  const f = fieldsOf(ok);
  assert.equal(esDirty(f, fieldsOf(ok)), false);
  assert.equal(esDirty(f, { ...f, nombre: 'Otro' }), true);
  assert.equal(esDirty(f, { ...f, estado: 'retirada' }), true);
  assert.equal(esDirty(f, { ...f, categoria: 'marketing' }), true);
  assert.equal(esDirty(f, { ...f, asunto_en: 'x' }), true);
  assert.equal(esDirty(f, { ...f, cuerpo_es: 'x' }), true);
  assert.equal(esDirty(f, { ...f, variables: [...f.variables, 'hora'] }), true);
  assert.equal(esDirty(f, { ...f, variables: [...f.variables].reverse() }), true);
});

// --- what can leave, and when -------------------------------------------------

const AHORA = new Date('2026-09-23T12:00:00.000Z');
/** PocketBase's own format: a space instead of the T. */
const haceHoras = (h) => new Date(AHORA.getTime() - h * 3600_000).toISOString().replace('T', ' ');
const entrante = (h) => ({ tipo: 'whatsapp', direccion: 'entrante', created: haceHoras(h) });

test('the 24-hour window opens on an inbound WhatsApp and on nothing else', () => {
  assert.equal(ventanaAbierta([], AHORA), false);
  assert.equal(ventanaAbierta([entrante(2)], AHORA), true);
  assert.equal(ventanaAbierta([entrante(23.9)], AHORA), true);
  assert.equal(ventanaAbierta([entrante(25)], AHORA), false);
  // Our own outbound message does not open it, nor does a call or an email.
  assert.equal(ventanaAbierta([{ tipo: 'whatsapp', direccion: 'saliente', created: haceHoras(1) }], AHORA), false);
  assert.equal(ventanaAbierta([{ tipo: 'llamada', direccion: 'entrante', created: haceHoras(1) }], AHORA), false);
  assert.equal(ventanaAbierta([{ tipo: 'email', direccion: 'entrante', created: haceHoras(1) }], AHORA), false);
  // An old one first: the whole list is read, not only its head.
  assert.equal(ventanaAbierta([entrante(40), entrante(3)], AHORA), true);
  // Garbage is a closed window, never a crash.
  assert.equal(ventanaAbierta([{ tipo: 'whatsapp', direccion: 'entrante', created: 'no es una fecha' }], AHORA), false); // lang-sweep: allow
  assert.equal(ventanaAbierta(undefined, AHORA), false);
  assert.equal(WINDOW_MS, 24 * 3600_000);
});

test('the Twilio Content read is the one of the language that would be sent', () => {
  const row = { canal: 'whatsapp', estado: 'aprobada', content_estado: 'approved', content_estado_en: 'pending', content_sid_en: 'HX2' };
  assert.equal(contentEstadoDe(row, 'es'), 'approved');
  assert.equal(contentEstadoDe(row, 'en'), 'pending');
  // No English Content was ever created: the row has one Content and it answers.
  const solo = { canal: 'whatsapp', estado: 'aprobada', content_estado: 'approved' };
  assert.equal(contentEstadoDe(solo, 'en'), 'approved');
  assert.equal(contentEstadoDe({ canal: 'whatsapp' }, 'es'), 'unsubmitted');
});

test('a retired template never leaves, whatever the channel or the window', () => {
  for (const canal of ['email', 'whatsapp']) {
    for (const ventana of [true, false]) {
      const r = reparoDe({ canal, estado: 'retirada', content_estado: 'approved' }, 'es', ventana);
      assert.deepEqual(r, { nivel: 'bloqueo', code: 'retirada' });
    }
  }
});

test('WhatsApp without an approved Content: blocked outside the window, a warning inside it', () => {
  const p = { canal: 'whatsapp', estado: 'aprobada', content_estado: 'pending' };
  assert.deepEqual(reparoDe(p, 'es', false), { nivel: 'bloqueo', code: 'twilio', estado: 'pending' });
  assert.deepEqual(reparoDe(p, 'es', true), { nivel: 'aviso', code: 'ventana', estado: 'pending' });
  // Approved: nothing to say, window or no window.
  const ok = { canal: 'whatsapp', estado: 'aprobada', content_estado: 'approved' };
  assert.equal(reparoDe(ok, 'es', false), null);
  assert.equal(reparoDe(ok, 'es', true), null);
  // Approved in Spanish, pending in English: the lead's language decides.
  const media = { canal: 'whatsapp', estado: 'aprobada', content_estado: 'approved', content_estado_en: 'pending', content_sid_en: 'HX2' };
  assert.equal(reparoDe(media, 'es', false), null);
  assert.equal(reparoDe(media, 'en', false).nivel, 'bloqueo');
});

test('an email template only answers to its own lifecycle, and a draft is a warning', () => {
  assert.equal(reparoDe({ canal: 'email', estado: 'aprobada' }, 'es', false), null);
  assert.deepEqual(reparoDe({ canal: 'email', estado: 'borrador' }, 'es', false),
    { nivel: 'aviso', code: 'borrador', estado: 'borrador' });
  // A draft is never a block: the chassis sends it, and the dialog shows the
  // exact text before it goes.
  assert.equal(reparoDe({ canal: 'email', estado: 'borrador' }, 'es', false).nivel, 'aviso');
  assert.deepEqual(reparoDe({ canal: 'whatsapp', estado: 'borrador', content_estado: 'approved' }, 'es', false),
    { nivel: 'aviso', code: 'borrador', estado: 'borrador' });
});

// --- what Meta holds, and what the CRM may still change -----------------------
// The day a template is approved, the row stops being the text the client
// reads. Everything below is that day.

test('a Content is approved when either language is, and never off WhatsApp', () => {
  assert.equal(contentAprobado({ canal: 'whatsapp', content_estado: 'approved' }), true);
  assert.equal(contentAprobado({ canal: 'whatsapp', content_estado_en: 'approved' }), true);
  assert.equal(contentAprobado({ canal: 'whatsapp', content_estado: 'pending' }), false);
  assert.equal(contentAprobado({ canal: 'whatsapp' }), false);
  // An email template has no Content at all: nothing about it is frozen.
  assert.equal(contentAprobado({ canal: 'email', content_estado: 'approved' }), false);
});

test('the frozen fields are the two bodies and the variable list, order included', () => {
  const actual = fieldsOf({ ...ok });
  assert.deepEqual(congelados({ ...actual }, actual), []);
  // A name the agent could no longer send: the chassis maps values onto
  // {{1}} {{2}} {{3}} in THIS order, so removing one moves every later value.
  assert.deepEqual(congelados({ ...actual, variables: ['nombre', 'fecha'] }, actual), ['variables']);
  // Reordering changes nothing visible in the CRM and everything on the phone.
  assert.deepEqual(congelados({ ...actual, variables: ['propiedad', 'nombre', 'fecha'] }, actual), ['variables']);
  assert.deepEqual(congelados({ ...actual, cuerpo_es: 'otra cosa {{nombre}}' }, actual), ['cuerpo_es']); // lang-sweep: allow
  assert.deepEqual(congelados({ ...actual, cuerpo_en: 'something else {{nombre}}' }, actual), ['cuerpo_en']);
  // The name, the category and the lifecycle are not Meta's business.
  assert.deepEqual(congelados({ ...actual, nombre: 'Otro', estado: 'retirada', categoria: 'marketing' }, actual), []);
});

test('which text actually reaches the lead', () => {
  // Outside the window WhatsApp only carries the Content Meta approved, and
  // the CRM does not hold that text: the preview may not promise it.
  assert.equal(viaPrevista('whatsapp', false), 'content');
  // Inside it the chassis renders the row's own body, which IS the preview.
  assert.equal(viaPrevista('whatsapp', true), 'free_text');
  assert.equal(viaPrevista('email', false), 'email');
  assert.equal(viaPrevista('email', true), 'email');
});
