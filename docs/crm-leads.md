# CRM: Kanban lead board

How the CRM's lead board (`src/crm/Kanban.tsx` + `src/crm/api.ts` +
`src/crm/crm.css`) lists, filters and prioritizes `leads` records in the
shared PocketBase. This page covers the board's states, the filter bar, the
card anatomy, the three-level priority and the side panel with history and
notes. The unattended rule is `desatendido()` in `api.ts`: a lead that is not
`vendido` or `nutriendo` and has no contact in the last two days
(`ultimo_contacto` empty or older than 48 h). Interface conventions shared by
every screen (tokens, icons, hit areas, copy) are in
[docs/crm-interface.md](crm-interface.md).

## Board basics

- One column per etapa: `nuevo`, `contactado`, `visita`, `oferta`,
  `reservado`, `vendido`, `nutriendo` (`ETAPAS` in `api.ts`).
- `loadLeads()` is `listAll('leads', { sort: '-created', expand: 'propiedad' })`:
  the whole collection, newest first, no page cap. The board live-reloads via
  the PocketBase realtime subscription `onLeadsChange` (`leads/*`); every
  reload goes through the same `recargar()`.
- **Seven stages fit a 1280px screen.** `.kanban` is a column-flow grid with
  `grid-auto-columns: minmax(160px, 1fr)` and a `--space-2` gap inside the
  1200px `.contenido` container, so all seven columns are visible side by
  side and widen on wider screens. Narrower than that the board scrolls
  sideways with `scroll-snap-type: x proximity` (each `.col` is
  `scroll-snap-align: start`). At or below 719.98px the columns are replaced by
  one column at a time, chosen with the `.etapas-movil` chips
  (`role="tablist"`, 44px tall, each showing the filtered count); the chosen
  stage is `data-etapa` on `.kanban`.
- Column headers show the **filtered** counts, in tabular numerals.

## Board states

The board tells four things apart, rendered above the columns (the columns
stay mounted underneath in every state, so the page keeps its shape):

| State | Condition | Rendered |
|---|---|---|
| Loading | before the first `loadLeads()` answer (`cargado === false`) | `<p class="tablero-estado" role="status">` with `list.loading` |
| Load failed | the last load rejected (`fallo` set) | `<p class="aviso aviso-error" role="alert">` with `list.error` and the error message |
| Empty pipeline | loaded, no error, zero leads | `<p class="tablero-estado" role="status">` with `lead.vacio` |
| Filtered to nothing | loaded, leads exist, `visibles.length === 0` | `<p class="tablero-estado" role="status">` with `lead.sinResultados` |

- A failed load is **never** shown as an empty pipeline: `lead.vacio` is gated
  on no error. Before this, a rejected `loadLeads()` was swallowed and an
  agent with forty leads read "No leads yet".
- `fallo` is set on every rejection, including the reloads triggered by SSE
  events, and cleared (`setFallo(null)`) on the next successful load. On a
  failure the previous `leads` array is left as it was, so the columns keep
  the last good data while the banner shows.

## Filter bar (`.filtros`)

Above the columns, the `+ New` button (`kit-btn kit-btn-primary`, opens the
manual lead panel) and two controls that narrow the board, both **100%
client-side** over the already-loaded window (no extra requests while typing):

| Control | Values | Effect |
|---|---|---|
| Property filter (the ui kit's `Select`, `filtros.propiedad`) | `''` (all properties) / `'sin'` (no property) / a property id | `'sin'` keeps only leads with an empty `propiedad` relation; an id keeps that property's leads. Options come from `loadPropiedades()`. `''` reaches the kit through its empty-value sentinel and comes back as `''`. |
| Search `<input type="search">` | free text | matched against `nombre`, `email`, `telefono` and `mensaje` via `coincideLead` |

- **Accent + case folding** on both sides of the lead search
  (`NFD`-normalize, strip combining marks, lowercase): typing `malaga`
  matches `"Málaga"`. This is the opposite of the /propiedades server-side
  search, which does **not** fold accents.
- **Filters survive SSE reloads**: filter state lives in its own React state,
  not derived from the data. A realtime reload replaces `leads` but never
  resets the selected property or the typed query. The visible list is
  re-derived on every render (`visibles = leads.filter(...)`).
- Both controls are 44px tall (`min-height: 44px`).

## Card anatomy (`.lead`)

A card is a way in, a name and one line of context. Everything else about the
lead lives in the side panel.

```html
<article class="lead desatendido">            <!-- .desatendido: 3px left border in --alert -->
  <button class="lead-abrir">                  <!-- opens the side panel -->
    <strong>Ana García</strong>                <!-- one line, ellipsis -->
    <span class="lead-contexto">
      <span class="lead-alerta" role="img" aria-label="Unattended"></span>
      Piso centro · 3 days ago
    </span>
  </button>
  <div class="mover">
    <button aria-label="Previous stage"><svg …/></button>   <!-- IconArrowLeft -->
    <button aria-label="Next stage"><svg …/></button>       <!-- IconArrowRight -->
  </div>
</article>
```

- **Unattended marker**: when `desatendido(l)` is true the context line starts
  with `.lead-alerta`, an 8px circle drawn in CSS (`background: var(--alert)`)
  on a `span` with `role="img"` and `aria-label={t('lead.desatendido')}`. No
  glyph character is typed; `role="img"` is what makes the label reach a
  screen reader. The card also gets the `desatendido` class, a 3px left
  border in the same `--alert` token. It is the only red on the card.
- **Context line**: the property title (when `expand.propiedad` is present)
  followed by `haceCuanto(locale, ultimo_contacto)` (`Intl.RelativeTimeFormat`;
  `time.sinContactar` when never contacted).
- **Stage arrows**: `.mover` holds two buttons with inline SVG icons
  (`IconArrowLeft` / `IconArrowRight` from `src/components/kit/Icono.tsx`),
  labelled `lead.etapaAnterior` / `lead.etapaSiguiente`, disabled on the first
  and last stage. Clicking calls `moverLead(id, etapa)` (PATCH `etapa`) and
  reloads:

```bash
curl -X PATCH "$PB/api/collections/leads/records/$ID" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"etapa": "visita"}'
```

- **Hit areas**: the arrows are drawn 44px wide and 36px tall and reach 44px
  tall through `::after { inset: -4px 0 }`. `.lead-abrir` (about 34px of
  name plus context) reaches 44px the same way, `::after { inset: -5px 0 }`;
  the two extensions are vertical only and never overlap.

## Priority: three levels

Priority is set in the side panel, not on the card. `.prioridad`
(`role="group"`, `aria-label` = `lead.prioridadAria`) holds three chips,
`nivel nivel-high`, `nivel-medium`, `nivel-low`, with `aria-pressed` and the
labels `priority.high|medium|low`:

- Clicking a level sets it; clicking the **active** level clears the priority
  (`setPrioridad(id, null)`). While unset, a muted `.sin` span shows
  `lead.sinPrioridad` ("No priority").
- The mapping to the stored 1 to 5 score lives in `src/crm/priority.ts` and
  is pure: `levelOf()` reads `>= 4` as high, `3` as medium, `1` or `2` as
  low, `0`/`null`/missing as none; `scoreOf()` writes `5`, `3`, `1` or
  `null`. No schema change: the `prioridad` number field of `leads` is
  unchanged (applied via BroteaConnect/inmobiliaria#14).

```bash
curl -X PATCH "$PB/api/collections/leads/records/$ID" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"prioridad": 3}'   # medium; send null to clear it
```

- **0 means unset**: PocketBase returns `0` for an empty number field; the UI
  treats `0`/missing as "no priority" (`levelOf` returns `none`, `?? 0` in
  the sort). Never render `0` as a real priority.
- **Per-column ordering** (`porPrioridad`): score descending (5 first),
  no-priority last; ties broken by `created` descending (newest first).
- After a change the board reloads (`recargar()`), so the card jumps to its
  new position immediately.
- UI: the chips are 2.75rem tall; the active chip takes `--signal-high`,
  `--signal-medium` or `--signal-low`. Red is reserved for the unattended
  marker.

## Side panel: record, notes and history

Clicking a card (`abrirFicha`) opens the lead in the kit `SidePanel`
(`src/components/kit/SidePanel.tsx`): title is the name, subtitle the property
title (or `filtros.sinPropiedad`). The footer holds the contact actions:

| Action | Rendered when | Effect |
|---|---|---|
| Call (`kit-btn kit-btn-ghost`, `tel:` link) | `telefono` set | `registrarContacto(id, 'llamada', …)`, then reload |
| WhatsApp (`kit-wa`, `wa.me` link) | `waLink(l)` non-empty | `registrarContacto(id, 'whatsapp', …)`, then reload |
| Send email (`kit-btn kit-btn-primary`) | `email` set | closes the record and opens the compositor, the ui kit's `Dialog` (subject and message prefilled from `email.*` copy); `enviarEmail()` posts to the chassis; sent or cancelled, the record reopens with its history reloaded. The outcome is a toast (`email.enviado` / `email.error`) |

`registrarContacto` creates the `actividades` row and, for every type except
`nota`, stamps `leads.ultimo_contacto`, which is what `desatendido()` reads.

The body shows the lead's message, the preferred time slot (`franja`), the
priority group above, a quick-note input and the history:

- **History** (`ul.historial`): the lead's activities from `actividades`,
  **newest first, latest 50** (`loadActividades`). Each `<li>` shows the
  channel label, the relative time, the delivery state when present
  (`envio.*`, nothing for `registrado`), the subject and the `nota` text
  (`.texto`: full row, `white-space: pre-wrap`, `overflow-wrap: anywhere`).
  Text is escaped by React; no HTML or markdown rendering. Empty history
  shows `lead.sinContactos`.
- **Adding a note**: type in `.ficha-nota` (placeholder `lead.nota`) and press
  Enter. `anotar()` is `registrarContacto(id, 'nota', texto)`:

```bash
curl -X POST "$PB/api/collections/actividades/records" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"lead": "'$LEAD_ID'", "tipo": "nota", "nota": "Prefiere visita el sábado", "direccion": "saliente", "estado_envio": "registrado"}'
```

  On success the draft is cleared and the history is reloaded with the fresh
  note on top. On failure `lead.notaError` is said inside the open panel (the
  `SidePanel` `error` prop, `role="alert"` above the footer) and as an error
  toast, and the draft text is **kept** so nothing is lost. The inline message
  is cleared when the panel is reopened or another lead opens.
- **Stale-response guard**: `abiertoRef` tracks which lead's panel is open;
  every activity load is checked against it before painting, so a late
  response can never render another lead's history. Opening a panel first
  clears any stale list, then loads.
- Logging a call/WhatsApp contact while the panel is open reloads the history
  through the same guarded loader.
- The panel is the ui kit's `Sheet` (see [docs/crm-interface.md](crm-interface.md)):
  it slides in with `--duration-fast`; on close it cuts, because it is mounted
  conditionally and the board is already there.

## Manual lead (`+ New`)

The `+ New` button opens a second `SidePanel` with name, phone, email,
property (the ui kit's `Select`, preselected from the active property filter;
`''` is `filtros.sinPropiedad`) and message. Create is enabled once a name
and a phone or email are present; it calls
`crearLead({ …, etapa: 'nuevo', origen: 'manual' })` and opens the new
record with an empty history, then loads it. `origen: 'manual'` keeps phone
and walk-in leads out of the "web" count in reports.

- While the create is in flight (`guardando`) the panel refuses to close:
  Escape and the overlay are ignored, so a panel cannot vanish mid-save and
  invite a second entry.
- A failed create (`lead.nuevoError`) is said inside the panel (`error`,
  `role="alert"`) and as an error toast; the form keeps what was typed.

## Owner, channel and language (E1, 2026-09-07)

Three optional fields joined `Lead` in `api.ts` (schema applied via
BroteaConnect/inmobiliaria#35):

```ts
asignado?: string;             // id of the `users` row that owns the lead; empty = unassigned
canal_preferido?: CanalMensaje; // 'email' | 'whatsapp'
idioma?: Idioma;               // 'es' | 'en'
expand?: { propiedad?: Propiedad; asignado?: Usuario };
```

`CanalMensaje` is the delivery channel of a message and is deliberately not
`Canal`, the activity kind (`nota | llamada | email | whatsapp | visita`): a
lead can only be written to by email or WhatsApp. Ask for
`expand: 'asignado'` to get the agent's `Usuario` (`id`, `email?`, `name?`).

```bash
curl -X PATCH "$PB/api/collections/leads/records/$ID" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"asignado": "'$USER_ID'", "canal_preferido": "whatsapp", "idioma": "en"}'
```

The board does not render or edit these fields yet; `loadLeads()` still
expands only `propiedad`. The full type reference, including the
`Visita`, `Plantilla`, `Campana` and `Envio` types, is in
[docs/crm-types.md](crm-types.md).
