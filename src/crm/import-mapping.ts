// How a CSV column becomes a CRM field, and how a row becomes a property or a
// lead — pure, so `node --test` can check it (see import-mapping.test.mjs).
// `Importar.tsx` keeps the screen and the loop; every decision lives here.
//
// Why this file exists: the matcher (jobs/lib.mjs in the landing repo) finds
// the leads that fit a property by the ZONE its fields name, and it builds its
// zone vocabulary from what the importer stores. A Dubai transaction export
// has three levels — Master Project, Area/Community, BuildingNameEn — and a
// cell that is "-" or "N/A" is not a zone: stored verbatim, that junk enters
// the vocabulary and every historical lead carrying the same junk becomes a
// candidate for every property carrying it. So:
//
//   · the building name reaches its own field (`edificio`; `proyecto` and
//     `edificio` are added to pb/schema.json by the landing repo, and the CRM
//     sends them only once that schema is applied), never only the title;
//   · a junk zone is dropped, and the Area/Community column is a fallback
//     for a junk Master Project;
//   · the duplicate key of a title ignores its leading junk segments, so a
//     re-import of a CSV that was first imported WITH the junk in the title
//     creates no second property.
//
// TWIN FILE: `jobs/lib.mjs` of BroteaConnect/inmobiliaria (the matcher,
// PR #46) carries `JUNK_ZONA` / `esZonaValida`. The two lists are identical
// as of 2026-09-23 and so is the minimum length; the 80-char cap is CRM-only
// (the matcher has no length cap). Change one, change the other, and keep the
// two vector tables in their tests identical.
//
// The field NAMES are PocketBase's and stay as they are in the database.

/** The target of each column. The label the agent sees comes from the
 *  dictionary (`campo.<name>`); only the field name lives here. */
export const CAMPOS = [
  '', 'p_nombre', 'p_telefono', 'p_email', 'p_pais', 'party_tipo',
  'titulo', 'municipio', 'zona', 'proyecto', 'edificio', 'unidad', 'direccion',
  'precio', 'habitaciones', 'banos', 'superficie', 'descripcion',
  't_fecha', 't_proc',
] as const;

export type Campo = (typeof CAMPOS)[number];

/** Reads one mapped field of the current row, trimmed; '' when unmapped. */
export type Accessor = (campo: Campo) => string;

/**
 * Header autodetection: Spanish synonyms plus the transaction-register schema
 * (Transaction Date/Value, Master Project, AreaNameEn, BuildingNameEn,
 * UnitNumber, ProcedurePartyTypeNameEn, NameEn, Mobile, ProcedureNameEn…).
 * To support another spreadsheet, add its headers here. Order matters: the
 * first rule that matches wins, and `zona` sits before `superficie` because a
 * DLD export's "Area" is the community, not a size.
 */
export function adivina(header: string): Campo {
  const s = header.toLowerCase().trim();
  if (/transaction ?date|^fecha/.test(s)) return 't_fecha';
  if (/transaction ?value|valor|precio|importe|amount/.test(s)) return 'precio';
  if (/master ?project/.test(s)) return 'municipio';
  if (/building/.test(s)) return 'edificio';
  if (/unit ?(number|no)|^unidad/.test(s)) return 'unidad';
  if (/party ?type|^rol/.test(s)) return 'party_tipo';
  if (/procedure ?name|procedimiento/.test(s)) return 't_proc';
  if (/country|país|pais|nacionalidad/.test(s)) return 'p_pais';
  if (/mobile|m[óo]vil|tel[eé]fono|phone/.test(s)) return 'p_telefono';
  if (/^project|proyecto/.test(s)) return 'proyecto';
  if (/^name(en)?$|nombre|propietari|dueñ|cliente|vendedor/.test(s)) return 'p_nombre';
  if (/t[ií]tulo|inmueble|vivienda/.test(s)) return 'titulo';
  if (/municipio|ciudad|localidad|zona/.test(s)) return 'municipio';
  if (/direc/.test(s)) return 'direccion';
  if (/habitacion|dormitor|bedroom/.test(s)) return 'habitaciones';
  if (/bañ|bathroom/.test(s)) return 'banos';
  if (/^area( ?name)?( ?en)?$|community|district|comunidad|barrio/.test(s)) return 'zona';
  // A trailing "area" sits AFTER the zona rule: "Built-up Area" / "Plot Area" /
  // "Carpet Area" are sizes, "Area" / "AreaNameEn" already went to zona.
  if (/superficie|metros|m2|m²|\bsize\b|sqft|sq\.? ?ft|area ?\(|\barea$/.test(s)) return 'superficie';
  if (/descrip|observa|notas/.test(s)) return 'descripcion';
  if (/mail/.test(s)) return 'p_email';
  return '';
}

/**
 * Cell values that are a header repeated, a placeholder or a "no data" word,
 * never a zone. Lowercase, single-spaced. Identical to `JUNK_ZONA` in the
 * landing repo (see the header comment). The three "… name" entries are a
 * header row that leaked into the live data.
 */
export const JUNK = [
  'master project', 'masterproject', 'project', 'area', 'community', 'district',
  'municipio', 'zona', 'n/a', 'na', 'none', 'null', 'nil', 'tbd', 'unknown',
  'desconocido', 'sin datos', 'building name', 'project name', 'proejct name',
];

const RE_ONLY_SYMBOLS = /^[\p{P}\p{S}\s]+$/u;
const RE_NUMERIC = /^[\d.,\s-]+$/;
// Shorter than three characters is a code or a typo, never a zone ("v3",
// "ok"); "JLT" is the shortest real one. The cap is CRM-only.
const MIN_ZONA = 3;
const MAX_ZONA = 80;

const collapse = (v: string) => v.trim().replace(/\s+/g, ' ');

/** A zone the matcher may put in its vocabulary. */
export function esZonaValida(v: string): boolean {
  const s = collapse(v);
  if (s.length < MIN_ZONA || s.length > MAX_ZONA) return false;
  if (RE_ONLY_SYMBOLS.test(s) || RE_NUMERIC.test(s)) return false;
  return !JUNK.includes(s.toLowerCase());
}

/** Trimmed, single-spaced; '' when it is not a zone at all. */
export function limpiarZona(v: string): string {
  const s = collapse(v);
  return esZonaValida(s) ? s : '';
}

/** A free-text cell that is not a zone but can still be a placeholder:
 *  only-symbols and JUNK words are dropped, numerics are kept (a unit is
 *  "2205"). Trimmed and single-spaced. */
export function limpiarTexto(v: string): string {
  const s = collapse(v);
  if (!s || RE_ONLY_SYMBOLS.test(s) || JUNK.includes(s.toLowerCase())) return '';
  return s;
}

/** The Master Project column, or the Area/Community one when that is junk. */
export const municipioDe = (val: Accessor): string =>
  limpiarZona(val('municipio')) || limpiarZona(val('zona')) || '';

export const edificioDe = (val: Accessor): string => limpiarZona(val('edificio'));

export const proyectoDe = (val: Accessor): string => limpiarZona(val('proyecto'));

export const unidadDe = (val: Accessor): string => limpiarTexto(val('unidad'));

/** An explicit title, else project-or-zone · building · unit, junk left out. */
export function tituloDe(val: Accessor): string {
  const unidad = unidadDe(val);
  return val('titulo') || [
    proyectoDe(val) || municipioDe(val),
    edificioDe(val),
    unidad && `unidad ${unidad}`, // lang-sweep: allow
  ].filter(Boolean).join(' · ');
}

/** The transaction's context, the way both owners' notes and leads' criteria carry it. */
export function contextoDe(val: Accessor): string {
  return [
    val('t_proc') && `Procedimiento: ${val('t_proc')}`, // lang-sweep: allow
    val('t_fecha') && `Fecha: ${val('t_fecha')}`, // lang-sweep: allow
    val('p_pais') && `País: ${val('p_pais')}`, // lang-sweep: allow
  ].filter(Boolean).join(' · ');
}

/**
 * A historical buyer's `criterios`. The matcher in the landing repo parses
 * this exact shape ("Compró en <title> · ~<price> · <context>"), so the title
 * here is the same junk-free one the property gets.
 */
export function criteriosDe(val: Accessor): string {
  const titulo = tituloDe(val);
  return [
    titulo && `Compró en ${titulo}`, // lang-sweep: allow
    val('precio') && `~${val('precio')}`,
    contextoDe(val),
  ].filter(Boolean).join(' · ');
}

/** "1,250,000.50" → 1250000.5 (thousands separator out, decimal in). */
export const numero = (v: string): number | undefined => {
  const limpio = v.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

/** The transaction register's Size is in square feet; the CRM stores m². */
const SQFT_A_M2 = 0.092903;
export const superficieM2 = (v: string): number | undefined => {
  const n = numero(v);
  return n === undefined ? undefined : Math.round(n * SQFT_A_M2);
};

/** What the importer sends to `crearPropiedad` for one row (the owner is
 *  added by the loop). Empties are omitted: a field PocketBase never receives
 *  keeps its own default, and a draft must not claim a price nobody set. */
export interface PropiedadImportada {
  titulo: string;
  municipio?: string;
  proyecto?: string;
  edificio?: string;
  direccion?: string;
  precio?: number;
  habitaciones?: number;
  banos?: number;
  superficie?: number;
  descripcion?: string;
  estado: 'borrador';
}

export function propiedadDe(val: Accessor): PropiedadImportada {
  const edificio = edificioDe(val);
  const textos = {
    municipio: municipioDe(val),
    proyecto: proyectoDe(val),
    edificio,
    direccion: val('direccion') || [edificio, unidadDe(val)].filter(Boolean).join(', '),
    descripcion: [val('descripcion'), contextoDe(val)].filter(Boolean).join(' — '),
  };
  const numeros = {
    precio: numero(val('precio')),
    habitaciones: numero(val('habitaciones')),
    banos: numero(val('banos')),
    superficie: superficieM2(val('superficie')),
  };
  const p: PropiedadImportada = { titulo: tituloDe(val), estado: 'borrador' };
  for (const k of Object.keys(textos) as Array<keyof typeof textos>) if (textos[k]) p[k] = textos[k];
  for (const k of Object.keys(numeros) as Array<keyof typeof numeros>) {
    const n = numeros[k];
    if (n !== undefined) p[k] = n;
  }
  return p;
}

/**
 * The key two titles are compared by when looking for a duplicate: lowercase,
 * with the leading segments that are not a zone dropped. "- · Burj Vista 1 ·
 * unidad 2205" (imported before the junk rule) and "Burj Vista 1 · unidad
 * 2205" (imported after it) are the same property. The last segment always
 * survives, so a title never keys to ''.
 */
export function claveDuplicado(titulo: string): string {
  const segmentos = titulo.toLowerCase().split(' · ');
  let i = 0;
  while (i < segmentos.length - 1 && !esZonaValida(segmentos[i])) i++;
  return segmentos.slice(i).join(' · ');
}

/**
 * Every key a title answers to: `claveDuplicado` of the whole title and,
 * when it has three or more segments (zone · building · unit), of the tail
 * without the zone. A row imported under the old code as "- · Burj Vista 1 ·
 * unidad 2205" and the same row now titled "Burj Khalifa · Burj Vista 1 ·
 * unidad 2205" (the Area column supplies the zone) share the tail key —
 * building plus unit IS the physical property. Two-segment titles have no
 * tail: "unidad 2205" alone would make every 2205 in the city one flat.
 */
export function clavesDuplicado(titulo: string): string[] {
  const completa = claveDuplicado(titulo);
  const segmentos = titulo.split(' · ');
  if (segmentos.length < 3) return [completa];
  const cola = claveDuplicado(segmentos.slice(1).join(' · '));
  return cola === completa ? [completa] : [completa, cola];
}
