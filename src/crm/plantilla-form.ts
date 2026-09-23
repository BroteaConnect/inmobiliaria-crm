// What the template editor validates and sends, and what the send dialog
// renders — pure, so `node --test` can check it (see plantilla-form.test.mjs).
// Sibling of property-form.ts, same reasons: the subtle rules of a form are
// the ones that go wrong silently, and a form that runs in a browser cannot be
// asserted from a test runner.
//
// The rules a template cannot be saved against:
//
//   · every {{placeholder}} the two bodies (and, for email, the two subjects)
//     use is declared in `variables`; the chassis renders from that list and
//     an undeclared one reaches the phone as "{{fecha}}" in plain text.
//   · Spanish and English use the SAME set of placeholders. A lead who asked
//     in English gets the English text with the values the Spanish one
//     declared; a variable one language uses and the other does not is a
//     value that goes missing in one of them.
//   · a variable name is [a-z][a-z0-9_]*, which is what Twilio Content and
//     the seed accept.
//
// The payload always sends every editable field, empties included — this is
// an edit-only form (rows are seeded by the platform) and a PATCH that omits
// a field keeps the stored value, so a subject the agent CLEARED would
// survive. It never carries clave, canal, evento or the Twilio `content_*`
// columns: those are the platform's and the chassis's to write.
//
// `version` goes up by one on every real save: `envios.plantilla_version`
// records which text actually went out, and a version that does not move is
// a record that lies.
import type { Lead, Plantilla, PlantillaEstado } from './api';

export interface PlantillaFields {
  nombre: string;
  categoria: 'utility' | 'marketing' | '';
  asunto_es: string;
  asunto_en: string;
  cuerpo_es: string;
  cuerpo_en: string;
  variables: string[];
  estado: PlantillaEstado;
}

export const EMPTY_PLANTILLA: PlantillaFields = {
  nombre: '', categoria: '', asunto_es: '', asunto_en: '', cuerpo_es: '', cuerpo_en: '',
  variables: [], estado: 'borrador',
};

/** A variable name as Twilio Content and the seed accept it. */
export const RE_VARIABLE = /^[a-z][a-z0-9_]*$/;
/** A placeholder in a body: `{{nombre}}`, spaces inside the braces tolerated. */
export const RE_PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const ESTADOS: PlantillaEstado[] = ['borrador', 'aprobada', 'retirada'];

/** `variables` as stored: an array, a JSON string of one, or nothing at all. */
function variablesDe(v: unknown): string[] {
  let raw: unknown = v;
  if (typeof raw === 'string') {
    const texto: string = raw;
    try { raw = JSON.parse(texto); } catch { raw = texto.split(',').map((s) => s.trim()); }
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const s = String(x ?? '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** A stored row, as the form holds it. Nothing here is ever `undefined`. */
export function fieldsOf(p: Partial<Plantilla>): PlantillaFields {
  const categoria = p.categoria === 'utility' || p.categoria === 'marketing' ? p.categoria : '';
  return {
    nombre: p.nombre ?? '',
    categoria,
    asunto_es: p.asunto_es ?? '',
    asunto_en: p.asunto_en ?? '',
    cuerpo_es: p.cuerpo_es ?? '',
    cuerpo_en: p.cuerpo_en ?? '',
    variables: variablesDe(p.variables),
    estado: p.estado && ESTADOS.includes(p.estado) ? p.estado : 'borrador',
  };
}

/** The placeholders a text uses: unique, in order of first appearance. */
export function placeholdersOf(texto: string): string[] {
  const out: string[] = [];
  for (const m of String(texto ?? '').matchAll(RE_PLACEHOLDER)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export type Problema =
  | { code: 'faltaNombre' }
  | { code: 'faltaCuerpo' }
  | { code: 'variableNombre'; nombre: string }
  | { code: 'noDeclarada'; idioma: 'es' | 'en'; variables: string[] }
  | { code: 'distintas'; es: string[]; en: string[] };

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * Everything that stops this template from being saved, worst first. An empty
 * list means saveable. Each code maps 1:1 to a `plantillas.error<Code>` key.
 */
export function validate(f: PlantillaFields): Problema[] {
  const out: Problema[] = [];
  if (!f.nombre.trim()) out.push({ code: 'faltaNombre' });
  if (!f.cuerpo_es.trim() || !f.cuerpo_en.trim()) out.push({ code: 'faltaCuerpo' });
  const declared = f.variables.map((v) => v.trim()).filter(Boolean);
  for (const v of declared) {
    if (!RE_VARIABLE.test(v)) out.push({ code: 'variableNombre', nombre: v });
  }
  // Subject and body count together: a subject placeholder is rendered by
  // the same list, and an email whose subject says "{{propiedad}}" is exactly
  // as broken as one whose body does.
  const es = placeholdersOf(`${f.asunto_es}\n${f.cuerpo_es}`);
  const en = placeholdersOf(`${f.asunto_en}\n${f.cuerpo_en}`);
  const noEs = es.filter((p) => !declared.includes(p));
  const noEn = en.filter((p) => !declared.includes(p));
  if (noEs.length) out.push({ code: 'noDeclarada', idioma: 'es', variables: noEs });
  if (noEn.length) out.push({ code: 'noDeclarada', idioma: 'en', variables: noEn });
  if (!sameSet(es, en)) out.push({ code: 'distintas', es, en });
  return out;
}

/**
 * The PATCH body. Every editable field, empties included; `variables`
 * deduped and trimmed; `version` one above what is stored. Never `clave`,
 * `canal`, `evento` or any `content_*`.
 */
export function payloadOf(f: PlantillaFields, actual: Pick<Plantilla, 'version'>): Record<string, unknown> {
  const stored = Number(actual.version);
  return {
    nombre: f.nombre.trim(),
    categoria: f.categoria,
    asunto_es: f.asunto_es.trim(),
    asunto_en: f.asunto_en.trim(),
    cuerpo_es: f.cuerpo_es.trim(),
    cuerpo_en: f.cuerpo_en.trim(),
    variables: variablesDe(f.variables),
    estado: f.estado,
    version: (Number.isFinite(stored) && stored > 0 ? stored : 0) + 1,
  };
}

/** `{{x}}` → `valores.x`. A placeholder with no value stays as written. */
export function render(texto: string, valores: Record<string, string>): string {
  return String(texto ?? '').replace(RE_PLACEHOLDER, (m, nombre: string) =>
    (valores[nombre] != null && valores[nombre] !== '' ? valores[nombre] : m));
}

/** The declared variables that still have no value. */
export function faltantes(variables: string[], valores: Record<string, string>): string[] {
  return variables.filter((v) => !(valores[v] ?? '').trim());
}

/**
 * What the CRM already knows about a lead, under the names the seed uses:
 * nombre, propiedad, zona, precio, agente. Never the string "undefined"; a
 * price of 0 is a price nobody set (PocketBase answers 0 for an unset number)
 * and so is an empty box, not "AED 0".
 */
export function variablesDeLead(lead: Lead, agente: string, moneda: string, locale: string): Record<string, string> {
  const p = lead.expand?.propiedad;
  const precio = Number(p?.precio);
  let precioTexto = '';
  if (Number.isFinite(precio) && precio !== 0) {
    try {
      precioTexto = new Intl.NumberFormat(locale || 'es', { style: 'currency', currency: moneda || 'EUR', maximumFractionDigits: 0 }).format(precio);
    } catch {
      precioTexto = String(precio);
    }
  }
  return {
    nombre: String(lead.nombre ?? ''),
    propiedad: String(p?.titulo ?? ''),
    zona: String(p?.municipio ?? ''),
    precio: precioTexto,
    agente: String(agente ?? ''),
  };
}

/** Has anything changed? A save with nothing to save must not bump the version. */
export function esDirty(a: PlantillaFields, b: PlantillaFields): boolean {
  return a.nombre !== b.nombre || a.categoria !== b.categoria || a.estado !== b.estado
    || a.asunto_es !== b.asunto_es || a.asunto_en !== b.asunto_en
    || a.cuerpo_es !== b.cuerpo_es || a.cuerpo_en !== b.cuerpo_en
    || a.variables.join('\n') !== b.variables.join('\n');
}

// --- sending one template to one lead -----------------------------------------
// Two facts decide whether a template can reach this lead right now, and the
// CRM knows both without asking the chassis:
//
//   · the template's own lifecycle. `retirada` is refused by the chassis
//     (template_retired); `borrador` is not refused, it is simply a draft
//     going to a client.
//   · for WhatsApp, Meta's 24-hour customer-service window. Inside it the
//     chassis sends free text and the Twilio approval does not matter at all;
//     outside it, only an `approved` Content can leave. Saying "not approved,
//     not sendable" while the lead wrote ten minutes ago would be the app
//     refusing a send that works.
//
// The window is read from the same activities the record already shows: the
// latest INBOUND WhatsApp activity opens it, exactly as the chassis computes
// it (requirements-api/src/window.js). A window we cannot see is a closed one,
// which at worst costs a warning the agent can ignore.

/** PocketBase writes "2026-09-23 10:00:00.000Z"; Date.parse wants the T. */
export const pbDate = (s: string) => new Date(String(s ?? '').replace(' ', 'T'));

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Is Meta's 24-hour window open for this lead, judged from its own activities? */
export function ventanaAbierta(
  actividades: { tipo?: string; direccion?: string; created?: string }[],
  now: Date = new Date(),
): boolean {
  for (const a of actividades ?? []) {
    if (a.tipo !== 'whatsapp' || a.direccion !== 'entrante' || !a.created) continue;
    const at = pbDate(a.created);
    if (!Number.isNaN(at.getTime()) && now.getTime() - at.getTime() < WINDOW_MS) return true;
  }
  return false;
}

/**
 * Why this template cannot (or should not) go out right now.
 * `bloqueo` is refused by the UI before anything leaves; `aviso` is said and
 * sent anyway. `null` is a clean send.
 */
export type Reparo =
  | { nivel: 'bloqueo'; code: 'retirada' }
  | { nivel: 'bloqueo'; code: 'twilio'; estado: string }
  | { nivel: 'aviso'; code: 'borrador'; estado: string }
  | { nivel: 'aviso'; code: 'ventana'; estado: string }
  | null;

type ParaEnviar = Pick<Plantilla, 'canal' | 'estado' | 'content_estado' | 'content_estado_en' | 'content_sid_en'>;

/**
 * The Twilio Content state of the half that would actually be sent. The
 * chassis never falls back between languages for the Content pair (a
 * wrong-language template is a switch the lead notices), so neither does
 * this — except when no English Content was ever created, where the row only
 * has one Content and that one is the answer.
 */
export function contentEstadoDe(p: ParaEnviar, idioma: 'es' | 'en'): string {
  if (idioma === 'en' && p.content_sid_en) return p.content_estado_en || 'unsubmitted';
  if (idioma === 'en' && !p.content_sid_en) return p.content_estado_en || p.content_estado || 'unsubmitted';
  return p.content_estado || 'unsubmitted';
}

/** The one thing worth saying about this send before the agent presses Enviar. */
export function reparoDe(p: ParaEnviar, idioma: 'es' | 'en', ventana: boolean): Reparo {
  if (p.estado === 'retirada') return { nivel: 'bloqueo', code: 'retirada' };
  if (p.canal === 'whatsapp') {
    const estado = contentEstadoDe(p, idioma);
    if (estado !== 'approved') {
      return ventana
        ? { nivel: 'aviso', code: 'ventana', estado }
        : { nivel: 'bloqueo', code: 'twilio', estado };
    }
  }
  if (p.estado !== 'aprobada') return { nivel: 'aviso', code: 'borrador', estado: p.estado || 'borrador' };
  return null;
}
