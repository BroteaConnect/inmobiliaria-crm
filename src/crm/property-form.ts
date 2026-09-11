// What the property form sends, and nothing else — pure, so `node --test` can
// check it (see property-form.test.mjs).
//
// This is the subtlest thing on the Properties screen and it had no test: a
// create and an edit must build DIFFERENT payloads out of the same fields.
//
//   · Creating omits what is empty. PocketBase is being handed a new record,
//     and a field it never receives keeps its own default; sending `null` for
//     a number the agent left blank is how a draft ends up claiming a price.
//   · Editing sends everything, empties included. A PATCH that omits a field
//     leaves the stored value alone, so a price the agent CLEARED would
//     silently survive — the bug this file exists to make impossible.
//
// `estado` is never part of either payload. It is changed from the record, on
// its own, by the status buttons: a save that also published a property would
// be a decision nobody asked for.
//
// The field NAMES are PocketBase's and stay as they are in the database.
import type { Propiedad } from './api';

/** The editable fields, as the inputs hold them: strings, always. */
export interface PropertyFields {
  titulo: string;
  municipio: string;
  direccion: string;
  precio: string;
  habitaciones: string;
  banos: string;
  superficie: string;
  descripcion: string;
  propietario: string;
}

export const TEXT_FIELDS = ['municipio', 'direccion', 'descripcion', 'propietario'] as const;
export const NUMBER_FIELDS = ['precio', 'habitaciones', 'banos', 'superficie'] as const;

export const EMPTY_FIELDS: PropertyFields = {
  titulo: '', municipio: '', direccion: '', precio: '',
  habitaciones: '', banos: '', superficie: '', descripcion: '', propietario: '',
};

/** A stored record, as the form holds it. A missing number is an empty box,
 *  never a zero: PocketBase returns 0 for a number field that was never set. */
export function fieldsOf(p: Partial<Propiedad>): PropertyFields {
  const num = (v: number | undefined | null) =>
    (v == null || v === 0 || !Number.isFinite(v) ? '' : String(v));
  return {
    titulo: p.titulo ?? '',
    municipio: p.municipio ?? '',
    direccion: p.direccion ?? '',
    precio: num(p.precio),
    habitaciones: num(p.habitaciones),
    banos: num(p.banos),
    superficie: num(p.superficie),
    descripcion: p.descripcion ?? '',
    propietario: p.propietario ?? '',
  };
}

/** A title is the one thing a property cannot be saved without. */
export const canSave = (f: PropertyFields) => f.titulo.trim().length > 0;

/**
 * The body for the create or the edit.
 * @param editing true for a PATCH over an existing record, false for a create.
 */
export function payloadOf(f: PropertyFields, editing: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { titulo: f.titulo.trim() };
  for (const k of TEXT_FIELDS) {
    const v = f[k].trim();
    if (editing || v) payload[k] = v;
  }
  for (const k of NUMBER_FIELDS) {
    const raw = f[k].trim();
    const n = Number(raw);
    if (raw === '' || Number.isNaN(n)) {
      if (editing) payload[k] = null;
    } else {
      payload[k] = n;
    }
  }
  if (!editing) payload.estado = 'borrador';
  return payload;
}
