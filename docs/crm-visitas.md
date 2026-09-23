# CRM — visits and agents (E4)

How the CRM schedules and follows up `visitas` records in the shared
PocketBase, and how a lead is handed to an agent. Shipped as phase E4 of the
estate agency build-out (BroteaConnect/inmobiliaria-crm#48, 2026-09-23). Three
files carry it: `src/crm/api.ts` (the "visits and agents (E4)" section),
`src/lib/madrid-day.ts` (the calendar arithmetic) and
`src/crm/VisitaDialog.tsx` (the form). The screens that use them are Today
(`src/features/today/Today.tsx`), the lead panel in Kanban
([docs/crm-leads.md](crm-leads.md#side-panel-record-notes-and-history)) and
Ajustes (`src/crm/Ajustes.tsx`). Scope: this repo only; the `visitas` schema
and the `users` rules live in the reference repo (`BroteaConnect/inmobiliaria`,
`pb/schema.json`). Interface conventions shared by every screen are in
[docs/crm-interface.md](crm-interface.md).

## Lifecycle

| Action | Trigger | Backend call | Resulting `resultado` |
|---|---|---|---|
| Schedule | `+ Visita` on Today, or `Programar visita` in the lead panel → the visit dialog → Programar | `crearVisita` (POST) | always `pendiente` |
| Set the outcome | the outcome `Select` on the visit's row on Today | `actualizarVisita(id, { resultado })` (PATCH) | the one that was picked |
| Hand a lead to an agent | the "Asignado a" `Select` in the lead panel | `asignarLead(id, userId \| null)` (PATCH `leads.asignado`) | n/a |

A visit is born `pendiente`; confirming it is a separate act. There is no
edit form for a visit yet: `actualizarVisita` accepts `cuando` and `notas` as
well, but only the outcome has a control.

## Data functions (`src/crm/api.ts`)

```ts
loadVisitasDeHoy(now: Date = new Date()): Promise<Visita[]>
loadVisitasDeLead(leadId: string): Promise<Visita[]>
crearVisita(data: NuevaVisita): Promise<Visita>
actualizarVisita(id: string, data: Partial<Pick<Visita, 'resultado' | 'cuando' | 'notas'>>): Promise<Visita>
asignarLead(id: string, userId: string | null): Promise<Lead>
loadUsuarios(): Promise<Usuario[]>
onVisitasChange(cb: () => void): () => void
```

- `loadVisitasDeHoy(now?)` is `listAll('visitas', …)` filtered to the
  **Madrid calendar day** that contains `now` (`madridTodayFilter('cuando',
  now)`), sorted by `cuando` ascending, with `lead`, `propiedad` and `agente`
  expanded. Equivalent request for 2026-09-23 (CEST, UTC+2):

```bash
curl -G "$PB/api/collections/visitas/records" -H "Authorization: $TOKEN" \
  --data-urlencode 'filter=cuando >= "2026-09-22 22:00:00.000Z" && cuando < "2026-09-23 22:00:00.000Z"' \
  --data-urlencode 'sort=cuando' --data-urlencode 'expand=lead,propiedad,agente'
```

- `loadVisitasDeLead(leadId)` is every visit of one lead, `-cuando` (most
  recent first), expanding `propiedad,agente`.
- `crearVisita(data)` posts `{ ...data, resultado: 'pendiente' }`. `cuando` is
  an ISO UTC datetime (`Date#toISOString()`); `propiedad`, `agente` and `notas`
  are optional and omitted when empty, never sent as `''`:

```bash
curl -X POST "$PB/api/collections/visitas/records" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"lead": "'$LEAD_ID'", "propiedad": "'$PROP_ID'", "agente": "'$USER_ID'",
       "cuando": "2026-09-23T08:30:00.000Z", "notas": "Llaves en la oficina", "resultado": "pendiente"}'
```

- `asignarLead(id, null)` writes `asignado: ''` (PocketBase clears a relation
  with the empty string, not with `null`).
- `loadUsuarios()` is `listAll('users', { sort: 'name' })` wrapped in
  `listUsersOrSelf` (`src/lib/users.ts`): it **never throws**. When the
  server refuses the list (403, or 400 on an instance whose `users` rule is
  still unset) it resolves to the signed-in user alone, or to `[]` for a
  break-glass session with no Brotea user. Every agent picker in the CRM reads
  it, so a closed directory degrades to "just you", never to a dead screen.
- `onVisitasChange(cb)` is the realtime subscription to `visitas/*`, the same
  pattern as `onLeadsChange`; it returns the unsubscribe.

`crearLead()` also changed in E4: it defaults `asignado` to the signed-in
user's id unless the caller names one (see
[docs/crm-leads.md](crm-leads.md#manual-lead--new)).

## Today: "Visitas de hoy"

The agenda is a section (`.today-visitas`, `aria-labelledby`) above the
reply queue on `/hoy`. Its header shows `visitas.hoy` with the count once
loaded and `+ Visita` (`visitas.nueva`, `kit-btn kit-btn-primary`), which
opens the visit dialog with no lead preselected and the queue's leads as the
search set.

The visits are loaded **apart from the queue** (`loadVisitasDeHoy`, its own
loading and error state), so a failing `visitas` collection does not take the
queue down and the other way round. States:

| State | Condition | Rendered |
|---|---|---|
| Load failed | `visitasError` set | `<p class="aviso aviso-error" role="alert">` with `visitas.error` and the message |
| Loading | first load in flight, no error | `<p class="today-status" role="status">` with `visitas.cargando` |
| Empty | loaded, no error, zero visits | `<p class="today-status" role="status">` with `visitas.vacio` |

An error never reads as a free day: the empty state is gated on "no error".

Each visit is a kit `ListCard`:

- **signal**: the time on the Madrid clock (`<time class="visita-hora">`,
  `horaMadrid`, 24 h) and the outcome chip
  (`.visita-estado.visita-estado-<resultado>`, label `visitas.resultado.*`);
  an unset `resultado` is rendered as `pendiente`;
- **name**: the lead's name (`expand.lead`);
- **context**: the property title (or `filtros.sinPropiedad`) `·` the agent's
  name or email (or `visitas.sinAgente`);
- **action**: a ui kit `Select` over `VISITA_RESULTADOS` (`aria-label`
  `visitas.resultadoAria`). Picking a value calls
  `actualizarVisita(id, { resultado })`; the row is patched locally once the
  server has it (the realtime event agrees a moment later) and the outcome is
  a toast: `visitas.resultadoCambiado` (`ok`) or `visitas.resultadoError`
  (`error`).

**One write at a time per visit, never per list**: `escribiendo` is a `Set`
of visit ids in flight; only the row being saved has its `Select` disabled,
and a second pick on the same row while it saves is ignored. Row B never goes
dead while row A is saving.

The section reloads on every `visitas/*` realtime event
(`onVisitasChange(recargarVisitas)`) and after the dialog books a visit. The
queue underneath still reloads on `leads/*` only.

## The visit dialog (`src/crm/VisitaDialog.tsx`)

The new-visit form is the kit's `Dialog`, **not** an `EditSheet`: it opens
from the lead panel, which is already a sheet, and a second sheet over the
first would leave two panels and no board. The precedent is the email
compositor: the record steps aside, the question is answered in the middle of
the screen, and the record comes back with the visit in it (Kanban's
`programarVisita` closes the panel, `cerrarVisita` reopens it with visits and
history reloaded). The rest of the form anatomy holds
([docs/crm-interface.md](crm-interface.md#interactive-primitives-come-from-the-ui-kit)).

```tsx
<VisitaDialog lead={lead} onClose={…} onCreated={(visita) => …} />        // lead panel: preselected
<VisitaDialog leads={leads} onClose={…} onCreated={() => …} />            // Today: search
```

| Field | Control | Default | Notes |
|---|---|---|---|
| Lead | preselected (`lead` prop) or a `<input type="search">` over the board's matcher `coincideLead` | the caller's lead | up to 8 results from the caller's `leads`; when that list is empty (still loading, or failed) the dialog loads `loadLeads()` itself, because a search that can only answer "no match" is a dead end. `Cambiar` clears the choice |
| Property | ui kit `Select` | the lead's `propiedad` | options are the **published** properties only (`estado === 'publicada'`); the lead's own property stays selectable even as a draft; an id neither list can name (deleted since) drops to `''` before submit |
| Agent | ui kit `Select` over `loadUsuarios()` | the signed-in user (`currentUser().id`) | `''` is `visitas.sinAgente`; a break-glass session defaults to nobody |
| Date and time | `<input type="datetime-local" required step={900}>` | `nextMadridSlot()`, the next round half hour on the Madrid clock | read as Europe/Madrid wall time (below); the hint `visitas.campo.cuandoAyuda` says so |
| Notes | `<textarea>` | empty | trimmed; omitted when empty |

Both `Select`s carry a `key` derived from their option values
(`claveDe(opciones)`). Inside a `<form>` Radix mirrors the value into a hidden
native `<select>`, and a value that changes in the same render as the options
arrive finds no `<option>` yet: the native control collapses to `''` and
Radix reports that back, which is how the default agent went missing. A fresh
mount with value and options together never fires that report.

Submit (`Programar`, `form="visita-form"`, Enter in any field): the two rules
`required` cannot express are said in the dialog's `error` (`role="alert"`):
no chosen lead → `visitas.faltaLead`; a wall clock that does not parse →
`visitas.faltaCuando`. Then `crearVisita({ lead, propiedad?, agente?, cuando:
instante.toISOString(), notas? })`, a toast `visitas.creada` with the booked
time formatted in Madrid (`Intl.DateTimeFormat` with `timeZone:
'Europe/Madrid'`), and `onCreated(visita)`. A failure is said inside the
dialog (`visitas.crearError`) and as an error toast, the form keeps what was
typed. While saving both buttons are disabled and `onOpenChange` is ignored,
so the dialog cannot vanish mid-save; the primary is never disabled for an
incomplete form.

### The Madrid-time contract (`src/lib/madrid-day.ts`)

"Today's visits" is a business question asked in Madrid, and the answer has
to be the same whether the agent's laptop is in Madrid, Dubai or on a plane.
`madrid-day.ts` is pure and dependency-free (`node --test` checks the DST
edges) and never uses a fixed offset: every conversion asks
`Intl.DateTimeFormat` with `timeZone: 'Europe/Madrid'`.

| Export | What it answers |
|---|---|
| `MADRID_TZ` | `'Europe/Madrid'` |
| `madridInstant(y, m, d, h?, min?)` | the UTC instant at which a Madrid wall clock reads that time (`m` is 1 to 12; `d` may overflow the month) |
| `madridMidnight(y, m, d)` | the instant the Madrid calendar day begins |
| `madridDayBounds(now?)` | `{ from, to }`, the `[from, to)` UTC bounds of the Madrid day containing `now` |
| `madridTodayFilter(field, now?)` | the PocketBase filter `field >= "<from>" && field < "<to>"`, literals as `YYYY-MM-DD HH:MM:SS.sssZ` (`pbDateLiteral`) |
| `madridWallOf(instant)` | the `datetime-local` value (`YYYY-MM-DDTHH:MM`) a Madrid clock shows for `instant` |
| `instantOfMadridWall(wall)` | the instant a `datetime-local` value names when read as Madrid wall time; `null` if malformed |
| `nextMadridSlot(now?, stepMinutes = 30)` | the next round slot on the Madrid clock, as a `datetime-local` value |

A `<input type="datetime-local">` holds `"YYYY-MM-DDTHH:MM"` with no zone at
all, and a browser in Dubai would read `10:30` as Gulf time and book the visit
two hours off. The dialog reads the field through `instantOfMadridWall` and
stores `cuando` as UTC, so an agent booking from Dubai and one booking from
Madrid book the same instant when they type the same clock. A wall time that
does not exist (02:30 on the spring-forward night) resolves to the instant
the clock actually showed next; an ambiguous one (02:30 on the fall-back
night) resolves to one of its two instants. Every rendering of `cuando`
(`horaMadrid`, `fechaHoraMadrid` in `VisitaDialog.tsx`, the `visitas.creada`
toast) formats with `timeZone: MADRID_TZ` and `hourCycle: 'h23'`.

## Outcomes

`VISITA_RESULTADOS` in `api.ts`, verbatim from the schema's select:

| Value | `en` | `es` |
|---|---|---|
| `pendiente` | Pending | Pendiente |
| `confirmada` | Confirmed | Confirmada |
| `realizada` | Done | Realizada |
| `no_show` | No-show | No se presentó |
| `cancelada` | Cancelled | Cancelada |
| `reprogramada` | Rescheduled | Reprogramada |

Labels are `visitas.resultado.<value>` in both locales; the chip class is
`visita-estado-<value>`. Setting an outcome does not create an `actividades`
row and does not touch `leads.ultimo_contacto`: a visit is its own record,
not a contact.

## Agents

- **The lead panel's "Asignado a"** (Kanban) is a `Select` over
  `loadUsuarios()` plus `lead.asignadoNadie` (`''`); an assigned id the
  directory does not list shows as `lead.asignadoOtro` and is never dropped.
  Details in [docs/crm-leads.md](crm-leads.md#side-panel-record-notes-and-history).
- **The agent on duty** is the `agentes.guardia` setting, edited in Ajustes
  under "Agentes" ("Agente de guardia", a `Select` over `loadUsuarios()` with
  `ajustes.agentes.nadie` as `''`). It is the `users` id the chassis
  (`api.brotea.dev` `POST /requirements`, `source: lead_web`, with the
  `lead_id`) assigns web leads to. `src/lib/settings.ts` coerces the
  `agentes.` prefix like `negocio.` and `contacto.`: one line of text,
  `{ v: 1, text: '<users id>' }`, default `''` (nobody on duty; a web lead
  then arrives unassigned and the board shows it as such). The row is written
  through `saveSetting('agentes.guardia', { v: 1, text: id })`:

```bash
curl -X POST "$PB/api/collections/settings/records" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"key": "agentes.guardia", "value": {"v": 1, "text": "'$USER_ID'"}}'
```

- **`users` rules**: list and view are `@request.auth.id != ""` (any
  signed-in user) so the pickers can list colleagues by name. `Usuario` gained
  `avatar?` and `role?` ([docs/crm-types.md](crm-types.md#usuario)). The rule
  is applied through the reference repo's schema; until it reaches an
  instance, `loadUsuarios()` answers the signed-in agent alone.

## Styles

All of it is token-based, as the E2 gate requires:

- `.visita-estado` (`crm.css`) is the same recipe as a property's `.estado`:
  the colour goes in the background at 22% and the word stays in `--text`.
  `confirmada` mixes `--primary`, `realizada` `--ok`, `no_show` `--warn`,
  `cancelada` `--danger`; `pendiente` and `reprogramada` keep the default
  `--muted`. No colour of its own.
- `.visita-hora` (`today.css`) is bold with tabular numerals;
  `.today .visita-resultado` gives the row's `Select` a `min-width` of
  10.5rem, and under 620px the card stacks and the control takes the row.
- `.ficha-visitas` in the lead panel: one flex row per visit, the `<time>`
  never wraps, `.lugar` takes the rest with an ellipsis.
- `.lead-resultados` (the dialog's search results, 44px rows, `max-height:
  16rem`), `.lead-elegido` (the chosen lead and its Cambiar button) and
  `.campo-ayuda` (the Madrid-time hint under the field).
- `.ajustes-guardia .ui-select` (`ajustes.css`) fixes the on-duty select at
  12rem and lets it take the row under 480px.

## Review screenshots

`docs/review/e4-visits/` holds the E4 shots: Today with the agenda, the visit
dialog, the lead panel with assignee and visits, and the Agentes section of
Ajustes. The PR body of #48 embeds them.
