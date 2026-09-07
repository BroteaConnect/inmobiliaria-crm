# CRM — API types reference

The exported types of `src/crm/api.ts`, one snippet per type. They mirror the
collections of the shared PocketBase, whose schema lives in the reference repo
(`BroteaConnect/inmobiliaria`, `pb/schema.json`); the CRM never declares
fields the schema does not have. The E1 block (visits, templates, campaigns,
deliveries — BroteaConnect/inmobiliaria-crm#40) is **types only**: no screen,
loader or mutator exists yet for `Visita`, `Plantilla`, `Campana` or `Envio`.

Field names keep the Spanish spelling of the production collections; select
values are the schema's, verbatim.

## Shared unions

```ts
export const ETAPAS = ['nuevo', 'contactado', 'visita', 'oferta', 'reservado', 'vendido', 'nutriendo'] as const;
export type Etapa = (typeof ETAPAS)[number];

// The kind of an activity.
export type Canal = 'nota' | 'llamada' | 'email' | 'whatsapp' | 'visita';

// The delivery channel of a message. Deliberately NOT `Canal`: a template or a
// campaign can only go out by email or WhatsApp.
export type CanalMensaje = 'email' | 'whatsapp';

export type Idioma = 'es' | 'en';

// 'simulado' is written by the mock messaging adapter: a send that never left.
export type EstadoEnvio =
  'registrado' | 'enviado' | 'entregado' | 'abierto' | 'click' | 'error' | 'simulado';
```

## `Usuario`

A row of the `users` auth collection, as seen through `expand`.

```ts
export interface Usuario { id: string; email?: string; name?: string }
```

## `Propiedad`

```ts
export interface Propiedad {
  id: string; collectionId: string; titulo: string; direccion: string; municipio: string;
  precio: number; habitaciones: number; banos: number; superficie: number;
  descripcion: string; estado: 'borrador' | 'publicada' | 'reservada' | 'vendida';
  fotos: string[]; propietario: string;
}
```

## `Lead`

```ts
export interface Lead {
  id: string; nombre: string; telefono: string; email: string; mensaje: string;
  propiedad: string; etapa: Etapa; origen: string; created: string;
  ultimo_contacto?: string; criterios?: string;
  franja?: string;               // mananas | tardes | finde
  prioridad?: number;            // 1–5; unset = no priority
  asignado?: string;             // the `users` row that owns the lead; empty = unassigned
  canal_preferido?: CanalMensaje;
  idioma?: Idioma;
  expand?: { propiedad?: Propiedad; asignado?: Usuario };
}
```

`asignado`, `canal_preferido` and `idioma` are the E1 additions — see
[docs/crm-leads.md](crm-leads.md#owner-channel-and-language-e1-2026-09-07).

## `Propietario`

```ts
export interface Propietario {
  id: string; nombre: string; telefono: string; email: string; notas: string;
  consentimiento?: boolean;      // marketing consent (E1)
  consentimiento_en?: string;    // ISO date it was recorded (E1)
}
```

## `Actividad`

```ts
export interface Actividad {
  id: string; lead: string; tipo: Canal; nota: string; created: string;
  direccion?: 'saliente' | 'entrante'; asunto?: string;
  estado_envio?: EstadoEnvio; mensaje_id?: string;
  campana?: string;              // the campaign that generated it, when not manual (E1)
}
```

## `Visita`

A visit as data: who goes where, when, and how it ended. Until E1 a visit was
only an activity kind (`tipo: 'visita'`).

```ts
export const VISITA_RESULTADOS =
  ['pendiente', 'confirmada', 'realizada', 'no_show', 'cancelada', 'reprogramada'] as const;
export type VisitaResultado = (typeof VISITA_RESULTADOS)[number];

export interface Visita {
  id: string; lead: string; propiedad: string; agente: string;
  cuando: string;                // ISO datetime of the appointment
  resultado?: VisitaResultado; notas?: string;
  created: string; updated: string;
  expand?: { lead?: Lead; propiedad?: Propiedad; agente?: Usuario };
}
```

## `Plantilla`

A message template in both app languages. `estado` is its lifecycle in the
CRM; `content_*` is the approval state of its Twilio Content counterpart
(WhatsApp) — a template can be `aprobada` here and still `pending` at Twilio.

```ts
export type PlantillaEstado = 'borrador' | 'aprobada' | 'retirada';
export type ContentEstado =
  'unsubmitted' | 'received' | 'pending' | 'approved' | 'rejected' | 'paused' | 'disabled';

export interface Plantilla {
  id: string; clave: string; nombre: string; canal: CanalMensaje;
  categoria?: 'utility' | 'marketing';
  asunto_es?: string; asunto_en?: string;
  cuerpo_es: string; cuerpo_en: string;
  variables?: string[];          // placeholder names the body uses, e.g. ['nombre', 'propiedad']
  evento?: string;               // the lifecycle event tied to this template, if any
  estado?: PlantillaEstado; version?: number;
  content_sid?: string; content_estado?: ContentEstado; content_motivo?: string;
  created: string; updated: string;
}
```

## `Campana` and `Segmento`

One template sent to a segment of leads at a cadence. In `Segmento` every
field is a filter and an absent one matches all.

```ts
export const CAMPANA_ESTADOS =
  ['borrador', 'programada', 'en_curso', 'pausada', 'completada', 'cancelada'] as const;
export type CampanaEstado = (typeof CAMPANA_ESTADOS)[number];

export interface Segmento {
  etapa?: Etapa[]; consentimiento?: boolean; origen?: string[];
  idioma?: Idioma; canal_preferido?: CanalMensaje; asignado?: string;
}

export interface Campana {
  id: string; nombre: string; plantilla: string; segmento?: Segmento;
  lote_diario?: number; intervalo_min?: number;
  hora_desde?: string; hora_hasta?: string;   // sending window, "HH:MM"
  inicio?: string; estado?: CampanaEstado; ultimo_envio_en?: string;
  informe?: unknown;             // whatever the runner summarises; its shape is the runner's
  created: string; updated: string;
}
```

## `Envio`

Delivery evidence: one row per message that went (or tried to go) out, with
the provider id and a timestamp for every state reached. The activity is what
the agent sees; the `Envio` is what a report counts. In PocketBase the
`envios` collection cannot be deleted by a signed-in user.

```ts
export interface Envio {
  id: string; lead: string; campana?: string; plantilla?: string; plantilla_version?: number;
  actividad?: string; canal: CanalMensaje; mensaje_id?: string; estado: EstadoEnvio;
  variables?: Record<string, string>;   // the values the placeholders were rendered with
  enviado_en?: string; entregado_en?: string; abierto_en?: string; click_en?: string;
  error_en?: string; error_codigo?: string; error_texto?: string;
  created: string; updated: string;
}
```

## `SettingRow`

```ts
export interface SettingRow { id: string; key: string; value: unknown; note?: string }
```

One row per `key`; uniqueness is enforced by `saveSetting()` (read before
write), never by the schema. No secrets are stored here.
