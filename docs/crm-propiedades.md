# CRM — /propiedades view

How the CRM's properties page (`src/crm/Propiedades.tsx` + `src/crm/crm.css`)
lists, searches, creates, publishes and edits `propiedades` records in the
shared PocketBase. Scope: this repo only — the public catalog that consumes
`estado="publicada"` records is documented in the reference repo
(`BroteaConnect/inmobiliaria`).

## Lifecycle

| Action | Trigger | Backend call | Resulting estado |
|---|---|---|---|
| Create | `+ Nueva propiedad` → form → Guardar | `crearPropiedad` (POST) | always `borrador` |
| Publish / unpublish | card toggle (shown only for `borrador`/`publicada`) | `actualizarPropiedad(id, { estado })` | `publicada` ↔ `borrador` |
| Edit | `Editar` button on every card (any estado) | `actualizarPropiedad(id, payload)` (PATCH) | unchanged — edit never sends `estado` |
| Delete photo | `✕` on a thumbnail in the edit form (confirm-gated) | `quitarFoto(id, filename)` (PATCH `fotos-`) | unchanged |

Publishing is instant on the public site (it reads client-side with the
`estado="publicada"` filter; no rebuild).

## Search

The `.barra` header carries a search input (`.buscador`, ~44px touch
target). Behavior by query length (after `trim()`):

| Query | What happens |
|---|---|
| < 2 chars | full grid via `loadPropiedades()` (latest 200, no debounce) |
| ≥ 2 chars | **server-side** search via `buscarPropiedades(q)`, debounced 300 ms |

`buscarPropiedades` (in `api.ts`) builds a PocketBase `~` (contains) filter
over `titulo`, `municipio`, `direccion` and `descripcion`, OR-joined —
equivalent to:

```bash
curl -G "$PB/api/collections/propiedades/records" -H "Authorization: $TOKEN" \
  --data-urlencode 'filter=titulo ~ "marina" || municipio ~ "marina" || direccion ~ "marina" || descripcion ~ "marina"' \
  --data-urlencode 'sort=-created' --data-urlencode 'perPage=200'
```

Details that matter:

- **Case-insensitive, but no accent folding**: PocketBase `~` ignores case
  yet `"Malaga"` does **not** match `"Málaga"` on the server (unlike the
  Kanban's client-side lead search, which folds accents).
- **Input sanitization**: double quotes are escaped; backslashes are
  *stripped*, not escaped — the PocketBase filter parser doesn't guarantee
  `\\` as a pair and a 400 would leave the grid stale.
- **Stale-response guards**: `busquedaRef` holds the current query; a
  response is only applied if its query is still the one typed. The
  non-debounced full reload is guarded too (it could otherwise arrive after
  a later search and overwrite its results).
- **Errors** surface in the standard message banner ("No se pudo
  buscar: …"); an empty result set renders `.sin-resultados`
  ("Sin resultados para «q».").
- **Reloads respect the search**: `recargar()` (after create/edit/photo
  changes) re-runs the active search instead of resetting the grid.
- **Backend seam**: the query is isolated in `buscarPropiedades()` so the
  search backend can be swapped (e.g. for Meilisearch) without touching the
  UI. Today it is PocketBase `~` only — Meilisearch is **not** integrated.

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
  `fotos+`. The guard also bails while a photo deletion is in flight
  (`borrando`): two concurrent PATCHes on the same record could land out of
  order.

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

The file input still carries the hint "Las fotos nuevas se añaden a las
existentes" in edit mode.

Photo URL helpers in `api.ts`:

| Helper | Returns / effect |
|---|---|
| `fotoUrl(p, thumb = true)` | cover URL — always `fotos[0]` (`?thumb=600x400` unless `thumb: false`), `''` if no photos |
| `fotosUrls(p, thumb = true)` | array with **every** photo URL, in backend order |
| `quitarFoto(id, filename)` | PATCH `{ 'fotos-': [filename] }`; resolves to the updated record — file deletion is permanent |

### Current photos in the edit form

Edit mode renders a `.fotos-actuales` block between the propietario select
and the file input: a visible count ("4 fotos", or "Sin fotos todavía") plus
a horizontally scrollable thumbnail strip (`.tira-fotos`) of every current
photo via `fotosUrls(editando)` — `600x400` thumbs, lazy-loaded, backend
order. This is the upload feedback the form used to lack: new files are
appended at the **end** of `fotos`, so after saving they show up at the end
of the strip.

### Deleting a photo

Each thumbnail overlays a `✕` button (`.quitar-foto`, 44×44px touch target)
that removes exactly that photo. Mechanics:

- **Confirm-gated**: PocketBase deletes the file from disk permanently, so
  the click first asks `confirm('¿Eliminar esta foto? El borrado es
  permanente.')`.
- The call is `quitarFoto(id, filename)` — an immediate JSON PATCH using
  PocketBase's `fotos-` modifier (the mirror of `fotos+`), equivalent to:

```bash
curl -X PATCH "$PB/api/collections/propiedades/records/$ID" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"fotos-": ["cocina_ab12cd34.jpg"]}'
```

- **One deletion at a time**: `borrando` holds the in-flight filename; every
  `✕` and the `Guardar` button are disabled meanwhile (and both `borrarFoto`
  and submit bail out early) — two concurrent PATCHes on the same record
  could land out of order.
- **Refresh without losing edits**: on success the open form is updated with
  the record the PATCH returns, but **only if that same property is still
  open** (`setForm((f) => typeof f === 'object' && f.id === actualizada.id ?
  actualizada : f)`) — if the form was closed or another record opened while
  the response was in flight, it is left alone. The form key doesn't change,
  so the uncontrolled inputs keep any half-edited values; the card grid is
  refreshed via `recargar()`.
- Errors surface in the standard `.aviso-error` banner
  ("No se pudo eliminar la foto: …").

## Photo-count badge on cards

Every card cover (wrapped in `.portada`) overlays a `.n-fotos` badge
("📷 4"). It exists because the cover always renders `fotos[0]` while new
photos are appended at the end — the cover pixels never change after an
upload, so the incrementing count is the visible proof that it worked. The
badge is `pointer-events: none` and only rendered when the property has
photos (`.sinfoto` placeholder otherwise).

## Form layout (`.alta` in crm.css)

- `max-width: 720px`, vertical flex with `--space-3` gaps, heading switches
  between "Nueva propiedad" and `Editar "{titulo}"`.
- `.fila2`: 2-column grid for título/municipio/dirección; the first label
  (título) spans full width (`grid-column: 1 / -1`).
- `.fila`: existing 4-column grid for the numeric row (precio/hab/baños/m²).
- `.acciones`: flex row with `Guardar` (`.primario`, shows "Guardando…"
  while submitting) and a secondary `Cancelar` button that closes the form.
- `.pista`: muted helper text (used for the photo count and the
  photo-append note in edit mode).
- `.fotos-actuales` / `.tira-fotos`: edit-mode block with the photo count
  and a horizontally scrollable strip of 132×88 thumbnails; each `<li>` is
  `position: relative` so `.quitar-foto` (44×44px, top-right, danger
  background on hover, dimmed when disabled) can overlay its image.
- Card-side companions (outside `.alta`): `.portada` wraps the cover image
  with `position: relative` and `.n-fotos` is the pill badge pinned to its
  bottom-right corner.

Mobile collapses (desktop untouched, everything behind media queries):

| Breakpoint | `.fila` | `.fila2` | `.acciones` |
|---|---|---|---|
| ≤719.98px | 2 columns | 1 column | row |
| ≤479.98px | 1 column | 1 column | stacked, stretched |

All styling is token-based (`--surface`, `--border`, `--radius*`,
`--space-*`) and scoped under `.alta` so Login, Kanban and Importar are
unaffected.
