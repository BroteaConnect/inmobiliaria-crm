import { fmtMoney, intlOf, t } from '../lib/i18n';
// api.ts — typed helpers over the factory's PocketBase client for this CRM.
import { list, listAll, create, update, fileUrl, subscribe } from '../lib/pb';
import { currentUser } from '../lib/auth';
import { madridTodayFilter } from '../lib/madrid-day';
import { listUsersOrSelf } from '../lib/users';

// La moneda es un dato del negocio (`negocio.moneda` en Ajustes), no una
// constante: quien pinta el precio la pasa. Intl decide el formato por idioma
// ("1.234.567 AED" en es, "AED 1,234,567" en en).
// A property with no price is a property whose price nobody has set yet, and
// PocketBase answers 0 for a number field that was never written: printing
// "AED 0" on the card of every imported flat was the app saying it is free.
export const fmtPrecio = (locale: string, n: number, moneda: string) =>
  (n != null && Number.isFinite(n) && n !== 0 ? fmtMoney(locale, n, moneda) : '—');

export const ETAPAS = ['nuevo', 'contactado', 'visita', 'oferta', 'reservado', 'vendido', 'nutriendo'] as const;
export type Etapa = (typeof ETAPAS)[number];

// The four states of a property, in the order they happen. They are the
// publish control: the record's status group sets any of them, which a
// two-way "publish / unpublish" toggle could never do.
export const ESTADOS_PROPIEDAD = ['borrador', 'publicada', 'reservada', 'vendida'] as const;
export type EstadoPropiedad = (typeof ESTADOS_PROPIEDAD)[number];

export interface Propiedad {
  id: string; collectionId: string; titulo: string; direccion: string; municipio: string;
  // Master project / building of a Dubai import. Added to pb/schema.json by
  // the landing repo; the CRM sends them only once that schema is applied.
  proyecto?: string; edificio?: string;
  precio: number; habitaciones: number; banos: number; superficie: number;
  descripcion: string; estado: EstadoPropiedad;
  fotos: string[]; propietario: string;
}

// The delivery channel of a message. Deliberately NOT `Canal`, which is the
// kind of an activity (nota, llamada, visita...): a template or a campaign can
// only go out by email or WhatsApp.
export type CanalMensaje = 'email' | 'whatsapp';
export type Idioma = 'es' | 'en';

/** A row of the `users` auth collection, as seen through `expand` or `loadUsuarios`. */
export interface Usuario { id: string; email?: string; name?: string; avatar?: string; role?: string }

export interface Lead {
  id: string; nombre: string; telefono: string; email: string; mensaje: string;
  propiedad: string; etapa: Etapa; origen: string; created: string;
  ultimo_contacto?: string; criterios?: string;
  /** Franja del día que el lead eligió en la web: mananas | tardes | finde. */
  franja?: string;
  prioridad?: number; // 1–5; sin valor = sin prioridad
  /** The agent (a `users` row) who owns this lead; empty = unassigned. */
  asignado?: string;
  canal_preferido?: CanalMensaje;
  idioma?: Idioma;
  expand?: { propiedad?: Propiedad; asignado?: Usuario };
}

export interface Propietario {
  id: string; nombre: string; telefono: string; email: string; notas: string;
  /** Marketing consent and the moment it was recorded (ISO date). */
  consentimiento?: boolean; consentimiento_en?: string;
}

export type Canal = 'nota' | 'llamada' | 'email' | 'whatsapp' | 'visita';
// 'simulado' is the state of a send that never left: the mock messaging adapter
// writes it. It gets a value of its own because the digest counters in the
// sibling repo (jobs/lib.mjs) add up entregado|abierto|click, and a simulation
// counted as a real delivery is a report that lies. The value itself keeps the
// Spanish spelling of the select it belongs to — that column is production.
export type EstadoEnvio =
  'registrado' | 'enviado' | 'entregado' | 'abierto' | 'click' | 'error' | 'simulado';

export interface Actividad {
  id: string; lead: string; tipo: Canal; nota: string; created: string;
  direccion?: 'saliente' | 'entrante'; asunto?: string;
  estado_envio?: EstadoEnvio; mensaje_id?: string;
  /** The campaign that generated this activity, when it was not manual. */
  campana?: string;
}

// --- E1 data model: visits, templates, campaigns, deliveries -------------------
// Types only. Loaders and mutators arrive with the screens that need them
// (E4/E5); this block exists so that every field the schema declares has a
// name the CRM can spell.

// A visit as data: who goes where, when, and how it ended. Until now a visit
// was only an activity kind; the row is what the agenda and the no-show
// reminders are built on.
export const VISITA_RESULTADOS =
  ['pendiente', 'confirmada', 'realizada', 'no_show', 'cancelada', 'reprogramada'] as const;
export type VisitaResultado = (typeof VISITA_RESULTADOS)[number];

export interface Visita {
  id: string; lead: string; propiedad: string; agente: string;
  /** ISO datetime of the appointment. */
  cuando: string;
  resultado?: VisitaResultado; notas?: string;
  created: string; updated: string;
  expand?: { lead?: Lead; propiedad?: Propiedad; agente?: Usuario };
}

// A message template in both app languages, with its lifecycle here (estado)
// and, for WhatsApp, the approval state of its Twilio Content counterpart
// (content_*): a template can be approved in the CRM and still be pending
// at Twilio, and the UI has to say so.
export type PlantillaEstado = 'borrador' | 'aprobada' | 'retirada';
export type ContentEstado =
  'unsubmitted' | 'received' | 'pending' | 'approved' | 'rejected' | 'paused' | 'disabled';

export interface Plantilla {
  id: string; clave: string; nombre: string; canal: CanalMensaje;
  categoria?: 'utility' | 'marketing';
  asunto_es?: string; asunto_en?: string;
  cuerpo_es: string; cuerpo_en: string;
  /** Placeholder names the body uses, e.g. ['nombre', 'propiedad']. */
  variables?: string[];
  /** The lifecycle event that triggers this template automatically, if any. */
  evento?: string;
  estado?: PlantillaEstado; version?: number;
  content_sid?: string; content_estado?: ContentEstado; content_motivo?: string;
  /** The English Twilio Content: the chassis submits and reads back one per language. */
  content_sid_en?: string; content_estado_en?: ContentEstado; content_motivo_en?: string;
  created: string; updated: string;
}

// A campaign: one template sent to a segment of leads at a cadence (daily
// batch, minutes between sends, a time window) from a start date. `informe`
// is whatever the runner summarises at the end; its shape is the runner's.
export const CAMPANA_ESTADOS =
  ['borrador', 'programada', 'en_curso', 'pausada', 'completada', 'cancelada'] as const;
export type CampanaEstado = (typeof CAMPANA_ESTADOS)[number];

/** Which leads a campaign targets; every field is a filter, an absent one matches all. */
export interface Segmento {
  etapa?: Etapa[]; consentimiento?: boolean; origen?: string[];
  idioma?: Idioma; canal_preferido?: CanalMensaje; asignado?: string;
}

export interface Campana {
  id: string; nombre: string; plantilla: string; segmento?: Segmento;
  lote_diario?: number; intervalo_min?: number;
  /** Sending window, as "HH:MM". */
  hora_desde?: string; hora_hasta?: string;
  inicio?: string; estado?: CampanaEstado; ultimo_envio_en?: string;
  informe?: unknown;
  created: string; updated: string;
}

// Delivery evidence: one row per message that went (or tried to go) out,
// with the provider id and the timestamps of every state it reached. The
// activity is what the agent sees; the envio is what the report counts.
export interface Envio {
  id: string; lead: string; campana?: string; plantilla?: string; plantilla_version?: number;
  actividad?: string; canal: CanalMensaje; mensaje_id?: string; estado: EstadoEnvio;
  /** The values the placeholders were rendered with. */
  variables?: Record<string, string>;
  enviado_en?: string; entregado_en?: string; abierto_en?: string; click_en?: string;
  error_en?: string; error_codigo?: string; error_texto?: string;
  created: string; updated: string;
  expand?: { plantilla?: Plantilla };
}

// Paging lives in the db brick now: this app had its own copy for exactly one
// afternoon, which is one afternoon longer than a second implementation should
// live anywhere.
export const loadLeads = () =>
  listAll<Lead>('leads', { sort: '-created', expand: 'propiedad' });

export const loadPropiedades = () =>
  listAll<Propiedad>('propiedades', { sort: '-created' });

export const loadPropietarios = () =>
  listAll<Propietario>('propietarios', { sort: 'nombre' });

export const moverLead = (id: string, etapa: Etapa) => update<Lead>('leads', id, { etapa });

/** Prioridad 1–5; null la quita (el campo queda sin valor en el backend). */
export const setPrioridad = (id: string, n: number | null) =>
  update<Lead>('leads', id, { prioridad: n });

/** Orden dentro de cada columna: 5 primero, sin prioridad al final; a igual prioridad, el más reciente antes. */
export const porPrioridad = (a: Lead, b: Lead) =>
  (b.prioridad ?? 0) - (a.prioridad ?? 0) || b.created.localeCompare(a.created);

/** Pliega acentos y mayúsculas ("Málaga" → "malaga") para buscar en cliente. */
const plegar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Búsqueda de leads en cliente sobre nombre, email, teléfono y mensaje. */
export const coincideLead = (l: Lead, q: string) => {
  const t = plegar(q.trim());
  if (!t) return true;
  return [l.nombre, l.email, l.telefono, l.mensaje].some((c) => c && plegar(c).includes(t));
};

// Búsqueda de propiedades en servidor con el filtro `~` (contains) de
// PocketBase — aislada aquí para poder sustituirla por Meilisearch más
// adelante sin tocar la UI. Ojo: `~` ignora mayúsculas pero NO pliega
// acentos ("Malaga" ≠ "Málaga" en el servidor).
export const buscarPropiedades = (q: string) => {
  // Las barras invertidas se eliminan (no se escapan): el parser de filtros
  // de PocketBase no garantiza `\\` como par completo y un 400 dejaría la
  // rejilla colgada; ningún texto inmobiliario real las necesita.
  const seguro = q.replace(/\\/g, '').replace(/"/g, '\\"');
  const filtro = ['titulo', 'municipio', 'direccion', 'descripcion']
    .map((campo) => `${campo} ~ "${seguro}"`).join(' || ');
  return list<Propiedad>('propiedades', { filter: filtro, sort: '-created', perPage: '500' })
    .then((r) => r.items);
};

// Toda interacción con un lead pasa por aquí: crea la actividad y sella
// leads.ultimo_contacto, que es lo que la UI (y el futuro recordatorio
// automático de 48 h) usa para saber quién está desatendido.
export async function registrarContacto(
  leadId: string,
  tipo: Canal,
  nota: string,
  extra: Partial<Actividad> = {},
) {
  const act = await create<Actividad>('actividades', {
    lead: leadId, tipo, nota,
    direccion: extra.direccion ?? 'saliente',
    estado_envio: extra.estado_envio ?? 'registrado',
    ...extra,
  });
  if (tipo !== 'nota') {
    await update<Lead>('leads', leadId, { ultimo_contacto: new Date().toISOString() });
  }
  return act;
}

/** Nota manual: no cuenta como contacto con el cliente. */
export const anotar = (leadId: string, nota: string) => registrarContacto(leadId, 'nota', nota);

/**
 * The most recent activities across every lead — what Today needs to know who
 * wrote last. Bounded on purpose: the queue only cares about the recent past,
 * and a screen that reads the whole activity log to build a to-do list is a
 * screen that gets slower every month.
 */
export const loadActividadesRecientes = (limit = 200) =>
  list<Actividad>('actividades', { sort: '-created', perPage: String(limit) })
    .then((r) => r.items)
    .catch((): Actividad[] => []);

export const loadActividades = (leadId: string) =>
  list<Actividad>('actividades', { filter: `lead="${leadId}"`, sort: '-created', perPage: '50' })
    .then((r) => r.items);

export const etiquetaCanal = (locale: string, canal: Canal) => t(locale, `canal.${canal}`);
// Sin etiqueta para 'registrado': ese estado no se le muestra a la agente.
export const etiquetaEnvio = (locale: string, estado: EstadoEnvio) =>
  (estado === 'registrado' ? '' : t(locale, `envio.${estado}`));

/** "hace 3 días" — el dato que más se mira en el kanban.
 *  Intl.RelativeTimeFormat da "hoy"/"ayer"/"hace 3 días" y sus equivalentes en
 *  cualquier idioma, así que no hay una sola cadena que traducir a mano. */
export function haceCuanto(locale: string, iso?: string): string {
  if (!iso) return t(locale, 'time.sinContactar');
  const dias = Math.floor((Date.now() - new Date(iso.replace(' ', 'T')).getTime()) / 86400000);
  const rtf = new Intl.RelativeTimeFormat(intlOf(locale), { numeric: 'auto' });
  if (dias <= 0) return rtf.format(0, 'day');
  if (dias < 30) return rtf.format(-dias, 'day');
  return rtf.format(-Math.floor(dias / 30), 'month');
}

/** Un lead sin contacto en 2+ días necesita atención (regla del negocio). */
export const desatendido = (l: Lead) =>
  !['vendido', 'nutriendo'].includes(l.etapa) &&
  (!l.ultimo_contacto || Date.now() - new Date(l.ultimo_contacto.replace(' ', 'T')).getTime() > 2 * 86400000);

export const crearPropietario = (data: Partial<Propietario>) => create<Propietario>('propietarios', data);
// A lead somebody types in belongs to that somebody: the board's "mine" filter
// is empty otherwise. A caller that names an owner keeps it, and a break-glass
// session (PocketBase token, no Brotea user) leaves the field unset rather
// than inventing one.
export const crearLead = (data: Partial<Lead>) => {
  const me = currentUser();
  return create<Lead>('leads', data.asignado || !me?.id ? data : { ...data, asignado: me.id });
};
export const crearPropiedad = (data: FormData | object) => create<Propiedad>('propiedades', data);
export const actualizarPropiedad = (id: string, data: FormData | object) => update<Propiedad>('propiedades', id, data);

/** Portada: la primera foto (la que enseñan las cards). */
export const fotoUrl = (p: Propiedad, thumb = true) =>
  p.fotos?.length ? fileUrl(p, p.fotos[0]) + (thumb ? '?thumb=600x400' : '') : '';

/** Todas las fotos de la propiedad, en el orden del backend. */
export const fotosUrls = (p: Propiedad, thumb = true): string[] =>
  (p.fotos ?? []).map((f) => fileUrl(p, f) + (thumb ? '?thumb=600x400' : ''));

/** Quita UNA foto ('fotos-', sintaxis PocketBase). El borrado del fichero es permanente. */
export const quitarFoto = (id: string, filename: string) =>
  actualizarPropiedad(id, { 'fotos-': [filename] });

export const onLeadsChange = (cb: () => void) => subscribe(['leads/*'], cb);

// --- visits and agents (E4) ---------------------------------------------------
// The agenda reads visits by the agency's calendar day, not the browser's:
// src/lib/madrid-day.ts owns that arithmetic (and its DST tests).

/** Today's visits, "today" being the Madrid calendar day that contains `now`, soonest first. */
export const loadVisitasDeHoy = (now: Date = new Date()) =>
  listAll<Visita>('visitas', {
    filter: madridTodayFilter('cuando', now), sort: 'cuando', expand: 'lead,propiedad,agente',
  });

/** Every visit of one lead, most recent first. */
export const loadVisitasDeLead = (leadId: string) =>
  listAll<Visita>('visitas', { filter: `lead="${leadId}"`, sort: '-cuando', expand: 'propiedad,agente' });

/** What a new visit needs: `cuando` is an ISO UTC datetime (`Date#toISOString()`). */
export interface NuevaVisita { lead: string; propiedad?: string; agente?: string; cuando: string; notas?: string }

/** A visit is born `pendiente`; confirming it is a separate act. */
export const crearVisita = (data: NuevaVisita) =>
  create<Visita>('visitas', { ...data, resultado: 'pendiente' });

export const actualizarVisita = (id: string, data: Partial<Pick<Visita, 'resultado' | 'cuando' | 'notas'>>) =>
  update<Visita>('visitas', id, data);

/** Hand a lead to an agent (a `users` id); null leaves it unassigned. */
export const asignarLead = (id: string, userId: string | null) =>
  update<Lead>('leads', id, { asignado: userId ?? '' });

/**
 * The agents a lead or a visit can be assigned to, by name. While the `users`
 * rule is still closed on an instance the server answers 403/400: that is the
 * signed-in agent alone, never an error (src/lib/users.ts).
 */
export const loadUsuarios = () =>
  listUsersOrSelf(() => listAll<Usuario>('users', { sort: 'name' }), currentUser);

export const onVisitasChange = (cb: () => void) => subscribe(['visitas/*'], cb);

// --- templates and sends (E5) -------------------------------------------------
// The template rows are read and edited here; every SEND goes through the
// chassis, which holds the provider credentials and writes the activity and
// the `envios` row. There is exactly one send path in this app — the one
// `enviarEmail` has always used — and this block widens it rather than
// opening a second one: same host, same secret, same "the CRM never guesses a
// success" rule. A non-2xx, or a 200 carrying `ok: false`, is a ChassisError
// with the sentence the chassis chose.

const CHASSIS_URL = 'https://api.brotea.dev';

/** A refusal or a failure from the chassis, with its own sentence kept. */
export class ChassisError extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ChassisError';
    this.status = status;
    this.detail = detail;
  }
}

type ChassisPath = '/send-email' | '/send-whatsapp' | '/content/sync';

/** The sentence for the agent, in the order the chassis contract names it:
 *  `error.text`, then `error.code`, then `error` as a string, then
 *  `detail`, then the bare status. */
function textoDeChasis(detail: unknown, status: number): string {
  const d = detail as { error?: { text?: string; code?: string } | string; detail?: string } | null;
  if (d && typeof d === 'object') {
    const e = d.error;
    if (e && typeof e === 'object') {
      if (e.text) return String(e.text);
      if (e.code) return String(e.code);
    }
    if (typeof e === 'string' && e) return e;
    if (typeof d.detail === 'string' && d.detail) return d.detail;
  }
  return `HTTP ${status}`;
}

async function chassis<T extends { ok?: boolean }>(path: ChassisPath, body: object, locale: string): Promise<T> {
  const secret = import.meta.env.PUBLIC_OUTBOUND_SECRET as string | undefined;
  if (!secret) throw new Error(t(locale, 'chasis.sinConfigurar'));
  const res = await fetch(`${CHASSIS_URL}${path}?secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as T;
  if (!res.ok) throw new ChassisError(textoDeChasis(json, res.status), res.status, json);
  if (json && json.ok === false) throw new ChassisError(textoDeChasis(json, res.status), res.status, json);
  return json;
}

export const loadPlantillas = () => listAll<Plantilla>('plantillas', { sort: 'canal,clave' });
/** Only the editable columns travel (plantilla-form.ts builds the body): never clave, canal, evento or content_*. */
export const guardarPlantilla = (id: string, data: Record<string, unknown>) =>
  update<Plantilla>('plantillas', id, data);

export interface ContentResult {
  ok?: boolean; clave: string;
  content_sid?: string; content_sid_en?: string;
  content_estado?: ContentEstado; content_estado_en?: ContentEstado;
  content_motivo?: string; content_motivo_en?: string;
}
/** Read Twilio's approval state back into the rows. Reads and records; it submits nothing. */
export const sincronizarContent = (clave: string, locale: string) =>
  chassis<{ ok: boolean; updated?: ContentResult[] }>('/content/sync', { clave }, locale);

export interface EnvioPlantilla { lead_id: string; plantilla: string; variables: Record<string, string> }
export interface EnvioResult {
  ok?: boolean; envio_id?: string; actividad_id?: string | null; mensaje_id?: string;
  estado?: EstadoEnvio; via?: string;
}
/**
 * Send one template to one lead. The chassis resolves the address, the
 * language (from the lead's `idioma`) and the channel rules; the CRM says
 * who, which template and with which values, and nothing else.
 */
export const enviarPlantilla = (canal: CanalMensaje, body: EnvioPlantilla, locale: string) =>
  chassis<EnvioResult>(canal === 'whatsapp' ? '/send-whatsapp' : '/send-email', body, locale);

/** The delivery evidence of one lead, newest first. Never throws: no rows is no rows. */
export const loadEnviosDeLead = (leadId: string) =>
  list<Envio>('envios', { filter: `lead="${leadId}"`, sort: '-created', perPage: '100', expand: 'plantilla' })
    .then((r) => r.items)
    .catch((): Envio[] => []);

// --- configuration (the `settings` collection) --------------------------------
// One row per key. This project's schema format declares no indexes, so `key`
// uniqueness cannot be expressed declaratively — it is enforced here instead,
// by reading before writing.
//
// There are NO secrets in here. Any signed-in user can read the collection and
// the browser bundle is public: `settings` only stores WHICH adapter is
// selected. Credentials keep following the `enviarEmail` precedent, where the
// actual send happens in the chassis.

export interface SettingRow { id: string; key: string; value: unknown; note?: string }

/** Every configuration row. The schema for this collection lives in the sibling
 *  repo, so a not-yet-applied schema answers 404 — that resolves to no rows,
 *  and the app falls back to the defaults in src/lib/settings.ts. */
export const loadSettings = () =>
  listAll<SettingRow>('settings', { sort: 'key' }).catch((): SettingRow[] => []);

/** Write ONE key: update its row if it exists, create it if it does not. */
export async function saveSetting(key: string, value: unknown, note?: string) {
  const safe = key.replace(/\\/g, '').replace(/"/g, '\\"');
  const found = await list<SettingRow>('settings', { filter: `key="${safe}"`, perPage: '1' });
  const data = { key, value, ...(note !== undefined ? { note } : {}) };
  const row = found.items[0];
  return row
    ? update<SettingRow>('settings', row.id, data)
    : create<SettingRow>('settings', data);
}

// Fotos reales de móvil: HEIC (iPhone) no está en la whitelist del backend y
// las fotos suelen superar los 5 MB. Re-codificamos en cliente a JPEG
// (máx. 2000 px) todo lo que no sea directamente aceptable.
const MIME_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const FOTO_MAX = 4.5 * 1024 * 1024;

// `locale` because these two failures are shown to the agent: they were the
// last Spanish sentences the English UI could still print.
export async function normalizaFoto(f: File, locale = 'es'): Promise<File> {
  if (MIME_OK.includes(f.type) && f.size <= FOTO_MAX) return f;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(f);
  } catch {
    throw new Error(t(locale, 'prop.fotoFormato', { nombre: f.name }));
  }
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error(t(locale, 'prop.fotoConversion', { nombre: f.name })))), 'image/jpeg', 0.85));
  return new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

// El envío real lo hace el chasis (las credenciales SMTP nunca llegan al
// navegador); aquí solo pedimos el envío y él registra la actividad.
const OUTBOUND_URL = `${CHASSIS_URL}/send-email`;

// `locale` because the one failure that is the app's own — no secret in this
// build — is shown to the agent, and it was the last Spanish sentence the
// English UI printed.
export async function enviarEmail(lead: Lead, asunto: string, texto: string, locale = 'es') {
  const secret = import.meta.env.PUBLIC_OUTBOUND_SECRET as string | undefined;
  if (!secret) throw new Error(t(locale, 'chasis.sinConfigurar'));
  const res = await fetch(`${OUTBOUND_URL}?secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: lead.email, subject: asunto, text: texto,
      lead_id: lead.id, from_name: 'Inmobiliaria',
    }),
  });
  if (!res.ok) {
    const detalle = await res.json().catch(() => ({}));
    throw new Error(detalle.detail || detalle.error || `error ${res.status}`);
  }
  return res.json() as Promise<{ message_id: string; activity_id: string | null }>;
}

export const waLink = (l: Lead) => {
  const tel = (l.telefono || '').replace(/[^\d+]/g, '');
  const txt = encodeURIComponent(`Hola ${l.nombre}, soy tu agente inmobiliaria. Gracias por tu interés${l.expand?.propiedad ? ` en "${l.expand.propiedad.titulo}"` : ''} — ¿cuándo te viene bien hablar?`);
  return tel ? `https://wa.me/${tel.replace('+', '')}?text=${txt}` : '';
};
