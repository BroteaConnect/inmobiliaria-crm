// What the CRM is configured to do — defaults, merging and the local cache.
//
// Deliberately free of React and of PocketBase, for two reasons: it is the part
// that has to be right, so `node --test` checks it; and the defence this module
// exists for is that the `settings` collection may simply not be there. A
// missing collection, an empty one, a row holding nonsense and a 404 from a
// schema that has not been applied yet all resolve to the same thing — the
// defaults below — rather than to a blank screen.
//
// The React side lives in SettingsContext.tsx, the same split as
// i18n.ts / LocaleContext.tsx.
import type { AdapterKind } from '../integrations/types';

export interface ModuleSetting { v: 1; enabled: boolean }
/** Un dato del negocio: una línea de texto que la web pública también lee. */
export interface TextSetting { v: 1; text: string }
export interface IntegrationSetting { v: 1; adapter: AdapterKind; config?: Record<string, unknown> }
export type SettingValue = ModuleSetting | IntegrationSetting | TextSetting;
export type SettingsMap = Record<string, SettingValue>;

/** A row of the `settings` collection, as `src/crm/api.ts` reads it. */
export interface SettingRowLike { key: string; value: unknown }

/**
 * The truth when the database says nothing. Every key the app reads must be
 * here — an absent key is how a module disappears from the nav for everyone.
 */
export const DEFAULTS: SettingsMap = {
  'modules.today': { v: 1, enabled: true },
  'modules.leads': { v: 1, enabled: true },
  'modules.properties': { v: 1, enabled: true },
  'modules.imports': { v: 1, enabled: true },
  'modules.reports': { v: 1, enabled: true },
  'integrations.messaging': { v: 1, adapter: 'mock' },
  'integrations.drafting': { v: 1, adapter: 'mock' },
  'integrations.campaigns': { v: 1, adapter: 'mock' },
  'integrations.reports': { v: 1, adapter: 'mock' },
  'integrations.maps': { v: 1, adapter: 'mock' },
  // Los datos del negocio. Vacíos a propósito: el aviso legal y la política de
  // privacidad de la web los leen de aquí, y un NIF inventado publicado en una
  // página legal es peor que un hueco que se ve. Vacío significa «pendiente», y
  // la pantalla de Ajustes lo dice mientras lo esté.
  'negocio.razonSocial': { v: 1, text: '' },
  'negocio.nif': { v: 1, text: '' },
  'negocio.domicilio': { v: 1, text: '' },
  'negocio.registro': { v: 1, text: '' },
  'negocio.telefono': { v: 1, text: '' },
  'negocio.email': { v: 1, text: '' },
  'contacto.whatsapp': { v: 1, text: '' },
};

export const CACHE_KEY = 'crm_settings_v1';

/** Same rule as coerceAdapterKind in src/integrations/select.ts, kept local so
 *  this module has no runtime imports at all. Unknown is never 'live'. */
const asAdapterKind = (value: unknown): AdapterKind => (value === 'live' ? 'live' : 'mock');

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * PocketBase gives back a parsed object for a `json` field, but a `text` field
 * holding JSON — or a hand-edited row — gives back a string. Accept both rather
 * than losing a setting to a field type.
 */
function parseValue(value: unknown): Record<string, unknown> | null {
  if (isObject(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Coerce a stored value into the shape its key expects, or null if it cannot. */
function coerce(key: string, value: unknown): SettingValue | null {
  const raw = parseValue(value);
  if (!raw) return null;
  if (key.startsWith('modules.')) {
    return typeof raw.enabled === 'boolean' ? { v: 1, enabled: raw.enabled } : null;
  }
  if (key.startsWith('integrations.')) {
    const out: IntegrationSetting = { v: 1, adapter: asAdapterKind(raw.adapter) };
    if (isObject(raw.config)) out.config = raw.config;
    return out;
  }
  // `numero` además de `text`: la fila del número de WhatsApp puede haberse
  // escrito a mano antes de que existiera esta pantalla, y una fila válida no
  // se descarta por el nombre del campo.
  if (key.startsWith('negocio.') || key.startsWith('contacto.')) {
    const texto = typeof raw.text === 'string' ? raw.text
      : typeof raw.numero === 'string' ? raw.numero : null;
    return texto === null ? null : { v: 1, text: texto.trim() };
  }
  return null;
}

/**
 * Defaults, then whatever the stored rows validly override.
 *
 * Keys the app does not know are ignored on purpose: a row left behind by a
 * removed module, or written by a newer version of the app, must not be able to
 * introduce a setting nothing reads.
 */
export function mergeSettings(rows?: readonly SettingRowLike[] | null): SettingsMap {
  const out: SettingsMap = { ...DEFAULTS };
  for (const row of rows ?? []) {
    if (!row || typeof row.key !== 'string') continue;
    if (!(row.key in DEFAULTS)) continue;
    const value = coerce(row.key, row.value);
    if (value) out[row.key] = value;
  }
  return out;
}

/** Is this module switched on? An unknown module is off — it does not exist. */
export const moduleEnabled = (settings: SettingsMap, key: string): boolean => {
  const value = settings[key];
  return !!value && 'enabled' in value && value.enabled;
};

/** El texto de un dato del negocio, o cadena vacía si nadie lo ha rellenado. */
export const textOf = (settings: SettingsMap, key: string): string => {
  const value = settings[key];
  return value && 'text' in value ? value.text : '';
};

/** Las claves que la web pública necesita para no publicar un hueco. */
export const NEGOCIO_REQUERIDO = [
  'negocio.razonSocial', 'negocio.nif', 'negocio.domicilio', 'negocio.registro',
] as const;

/** Cuáles de esas siguen sin rellenar. */
export const negocioPendiente = (settings: SettingsMap): string[] =>
  NEGOCIO_REQUERIDO.filter((k) => !textOf(settings, k));

/** Which adapter this integration should use. Unknown falls back to the mock. */
export const adapterOf = (settings: SettingsMap, key: string): AdapterKind => {
  const value = settings[key];
  return value && 'adapter' in value ? asAdapterKind(value.adapter) : 'mock';
};

/** A settings map back as rows, which is how the cache and the collection hold it. */
export const toRows = (settings: SettingsMap): SettingRowLike[] =>
  Object.entries(settings).map(([key, value]) => ({ key, value }));

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage = (): StorageLike | null =>
  (typeof localStorage === 'undefined' ? null : localStorage);

/**
 * Last known values, so the first paint is not a round trip. The cache is never
 * trusted: it goes through the same merge as the database, so a stale or
 * corrupted entry degrades to the defaults like everything else.
 */
export function readCache(storage: StorageLike | null = browserStorage()): SettingsMap {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    return mergeSettings(isObject(parsed)
      ? Object.entries(parsed).map(([key, value]) => ({ key, value }))
      : null);
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeCache(settings: SettingsMap, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    // A full or disabled localStorage costs a slower first paint, nothing more.
  }
}
