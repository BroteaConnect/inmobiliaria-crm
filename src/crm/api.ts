// api.ts — typed helpers over the factory's PocketBase client for this CRM.
import { list, create, update, fileUrl, subscribe } from '../lib/pb';

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
  expand?: { propiedad?: Propiedad };
}

export interface Propietario { id: string; nombre: string; telefono: string; email: string; notas: string }

export const loadLeads = () =>
  list<Lead>('leads', { sort: '-created', perPage: '200', expand: 'propiedad' }).then((r) => r.items);

export const loadPropiedades = () =>
  list<Propiedad>('propiedades', { sort: '-created', perPage: '200' }).then((r) => r.items);

export const loadPropietarios = () =>
  list<Propietario>('propietarios', { sort: 'nombre', perPage: '200' }).then((r) => r.items);

export const moverLead = (id: string, etapa: Etapa) => update<Lead>('leads', id, { etapa });

export const anotar = (leadId: string, tipo: string, nota: string) =>
  create('actividades', { lead: leadId, tipo, nota });

export const crearPropietario = (data: Partial<Propietario>) => create<Propietario>('propietarios', data);
export const crearPropiedad = (data: FormData | object) => create<Propiedad>('propiedades', data);
export const actualizarPropiedad = (id: string, data: FormData | object) => update<Propiedad>('propiedades', id, data);

export const fotoUrl = (p: Propiedad, thumb = true) =>
  p.fotos?.length ? fileUrl(p, p.fotos[0]) + (thumb ? '?thumb=600x400' : '') : '';

export const onLeadsChange = (cb: () => void) => subscribe(['leads/*'], cb);

export const waLink = (l: Lead) => {
  const tel = (l.telefono || '').replace(/[^\d+]/g, '');
  const txt = encodeURIComponent(`Hola ${l.nombre}, soy tu agente inmobiliaria. Gracias por tu interés${l.expand?.propiedad ? ` en "${l.expand.propiedad.titulo}"` : ''} — ¿cuándo te viene bien hablar?`);
  return tel ? `https://wa.me/${tel.replace('+', '')}?text=${txt}` : '';
};
