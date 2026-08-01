import { fmtMoney, intlOf, t } from '../lib/i18n';
// api.ts — typed helpers over the factory's PocketBase client for this CRM.
import { list, create, update, fileUrl, subscribe } from '../lib/pb';

// Los datos de la clienta operan en dirhams (AED); un único sitio para
// cambiar de mercado en el futuro.
// El mercado de la clienta opera en dirhams; Intl decide el formato por idioma.
export const fmtPrecio = (locale: string, n: number) =>
  (n != null && Number.isFinite(n) ? fmtMoney(locale, n, 'AED') : '—');

export const ETAPAS = ['nuevo', 'contactado', 'visita', 'oferta', 'reservado', 'vendido', 'nutriendo'] as const;
export type Etapa = (typeof ETAPAS)[number];

export interface Propiedad {
  id: string; collectionId: string; titulo: string; direccion: string; municipio: string;
  precio: number; habitaciones: number; banos: number; superficie: number;
  descripcion: string; estado: 'borrador' | 'publicada' | 'reservada' | 'vendida';
  fotos: string[]; propietario: string;
}

export interface Lead {
  id: string; nombre: string; telefono: string; email: string; mensaje: string;
  propiedad: string; etapa: Etapa; origen: string; created: string;
  ultimo_contacto?: string; criterios?: string;
  prioridad?: number; // 1–5; sin valor = sin prioridad
  expand?: { propiedad?: Propiedad };
}

export interface Propietario { id: string; nombre: string; telefono: string; email: string; notas: string }

export type Canal = 'nota' | 'llamada' | 'email' | 'whatsapp' | 'visita';
export type EstadoEnvio = 'registrado' | 'enviado' | 'entregado' | 'abierto' | 'click' | 'error';

export interface Actividad {
  id: string; lead: string; tipo: Canal; nota: string; created: string;
  direccion?: 'saliente' | 'entrante'; asunto?: string;
  estado_envio?: EstadoEnvio; mensaje_id?: string;
}

export const loadLeads = () =>
  list<Lead>('leads', { sort: '-created', perPage: '200', expand: 'propiedad' }).then((r) => r.items);

export const loadPropiedades = () =>
  list<Propiedad>('propiedades', { sort: '-created', perPage: '200' }).then((r) => r.items);

export const loadPropietarios = () =>
  list<Propietario>('propietarios', { sort: 'nombre', perPage: '200' }).then((r) => r.items);

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
  return list<Propiedad>('propiedades', { filter: filtro, sort: '-created', perPage: '200' })
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
export const crearLead = (data: Partial<Lead>) => create<Lead>('leads', data);
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

// Fotos reales de móvil: HEIC (iPhone) no está en la whitelist del backend y
// las fotos suelen superar los 5 MB. Re-codificamos en cliente a JPEG
// (máx. 2000 px) todo lo que no sea directamente aceptable.
const MIME_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const FOTO_MAX = 4.5 * 1024 * 1024;

export async function normalizaFoto(f: File): Promise<File> {
  if (MIME_OK.includes(f.type) && f.size <= FOTO_MAX) return f;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(f);
  } catch {
    throw new Error(`"${f.name}": este navegador no puede procesar ese formato de imagen — usa JPG, PNG o WebP.`);
  }
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error(`"${f.name}": no se pudo convertir a JPEG.`))), 'image/jpeg', 0.85));
  return new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

// El envío real lo hace el chasis (las credenciales SMTP nunca llegan al
// navegador); aquí solo pedimos el envío y él registra la actividad.
const OUTBOUND_URL = 'https://api.brotea.dev/send-email';

export async function enviarEmail(lead: Lead, asunto: string, texto: string) {
  const secret = import.meta.env.PUBLIC_OUTBOUND_SECRET as string | undefined;
  if (!secret) throw new Error('el envío de email no está configurado en esta app');
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
