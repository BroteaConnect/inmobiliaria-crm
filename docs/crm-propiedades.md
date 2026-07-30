# CRM — /propiedades view

How the CRM's properties page (`src/crm/Propiedades.tsx` + `src/crm/crm.css`)
lists, creates, publishes and edits `propiedades` records in the shared
PocketBase. Scope: this repo only — the public catalog that consumes
`estado="publicada"` records is documented in the reference repo
(`BroteaConnect/inmobiliaria`).

## Lifecycle

| Action | Trigger | Backend call | Resulting estado |
|---|---|---|---|
| Create | `+ Nueva propiedad` → form → Guardar | `crearPropiedad` (POST) | always `borrador` |
| Publish / unpublish | card toggle (shown only for `borrador`/`publicada`) | `actualizarPropiedad(id, { estado })` | `publicada` ↔ `borrador` |
| Edit | `Editar` button on every card (any estado) | `actualizarPropiedad(id, payload)` (PATCH) | unchanged — edit never sends `estado` |

Publishing is instant on the public site (it reads client-side with the
`estado="publicada"` filter; no rebuild).

## Edit flow

Every card has an `Editar` button that reopens the alta form prefilled with
that record. Mechanics:

- One form serves both modes, driven by
  `useState<'cerrado' | 'nueva' | Propiedad>` — an object value means
  edit mode.
- Inputs are **uncontrolled** (`defaultValue`); fresh values per record are
  guaranteed by a **key remount**:
  `key={`${editando ? editando.id : 'nueva'}-${owners.length}`}`.
  `owners.length` is part of the key on purpose: if editing starts before
  the propietarios list has loaded, the select remounts once owners arrive
  so its `defaultValue` resolves (otherwise it would show "—" and saving
  would unlink the owner).
- Opening edit mode scrolls the form into view (the clicked card may be far
  down the grid).
- Submit is double-click-guarded (`enviando` state disables both buttons and
  bails out early) — a double submit in edit mode would duplicate photos via
  `fotos+`.

### PATCH payload semantics

Edit sends **every** field, including empty ones — omitting them (as the
create path does) would silently keep the old value in the backend:

| Field kind | Empty in the form sends | Effect |
|---|---|---|
| Text (`municipio`, `direccion`, `descripcion`, `propietario`) | `''` | clears the field |
| Number (`precio`, `habitaciones`, `banos`, `superficie`) | `null` | clears the field |
| `estado` | never sent | publish state untouched by edits |

Equivalent request (what `actualizarPropiedad` issues without new photos):

```bash
curl -X PATCH "$PB/api/collections/propiedades/records/$ID" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"titulo":"Piso centro","municipio":"","precio":null, ...}'
```

The create path is the opposite: an explicit payload with **only non-empty
fields** plus `estado: 'borrador'` (empty multipart parts trip the backend).

### Photos on edit

New files are **appended** using PocketBase's `fotos+` multipart key —
existing photos are kept. Plain `fotos` on a PATCH would replace the whole
set (silent data loss). In the multipart case the scalar fields travel in a
single `@jsonPayload` part (PocketBase merges it as JSON) so the `null`s
that clear numeric fields survive — as empty multipart parts they would trip
the backend:

```js
fd.append('@jsonPayload', JSON.stringify(payload)); // '' and null preserved
for (const f of fotos) fd.append('fotos+', f, f.name); // append, not replace
```

Deleting individual photos is **not supported** from this form; the UI says
so next to the file input ("Las fotos nuevas se añaden a las existentes").

## Form layout (`.alta` in crm.css)

- `max-width: 720px`, vertical flex with `--space-3` gaps, heading switches
  between "Nueva propiedad" and `Editar "{titulo}"`.
- `.fila2`: 2-column grid for título/municipio/dirección; the first label
  (título) spans full width (`grid-column: 1 / -1`).
- `.fila`: existing 4-column grid for the numeric row (precio/hab/baños/m²).
- `.acciones`: flex row with `Guardar` (`.primario`, shows "Guardando…"
  while submitting) and a secondary `Cancelar` button that closes the form.
- `.pista`: muted helper text (used for the photo-append note in edit mode).

Mobile collapses (desktop untouched, everything behind media queries):

| Breakpoint | `.fila` | `.fila2` | `.acciones` |
|---|---|---|---|
| ≤719.98px | 2 columns | 1 column | row |
| ≤479.98px | 1 column | 1 column | stacked, stretched |

All styling is token-based (`--surface`, `--border`, `--radius*`,
`--space-*`) and scoped under `.alta` so Login, Kanban and Importar are
unaffected.
