# CRM — /propiedades view

How the CRM's properties page (`src/crm/Propiedades.tsx` + `src/crm/crm.css`)
lists, searches, creates, publishes and edits `propiedades` records in the
shared PocketBase. Scope: this repo only — the public catalog that consumes
`estado="publicada"` records is documented in the reference repo
(`BroteaConnect/inmobiliaria`).

## Lifecycle

| Action | Trigger | Backend call | Resulting estado |
|---|---|---|---|
| Create | `+ Nueva propiedad` in the bar → the form in the panel → Guardar | `crearPropiedad` (POST, JSON) | always `borrador` |
| Change status | one of the four buttons of the status group, in the record | `actualizarPropiedad(id, { estado })` | the one that was pressed |
| Edit | primary `Editar` in the record's footer (any estado) | `actualizarPropiedad(id, payload)` (PATCH, JSON) | unchanged: a save never sends `estado` |
| Change the price | the price itself, in the record, through a kit `Popover` | `actualizarPropiedad(id, { precio })` | unchanged |
| Add photos | the file input in the record | `actualizarPropiedad(id, FormData)` (PATCH `fotos+`) | unchanged |
| Delete a photo | `IconClose` (`.quitar-foto`, named by a ui kit `Tooltip`) on a thumbnail in the record, confirm-gated | `quitarFoto(id, filename)` (PATCH `fotos-`) | unchanged |
| Add an owner | `+ Nuevo propietario…` in the owner picker of the form | `crearPropietario` (POST) | unchanged |

A card has one way in: its body (`.ficha .cuerpo`) is a button that opens the
property in the kit `SidePanel` (the ui kit's `Sheet` since 2026-09-11, see
[docs/crm-interface.md](crm-interface.md)). Everything above happens in that
one panel, which since 2026-09-11 has three modes — `ficha`, `editar`,
`nueva` — held in a single `Panel` state:

```ts
type Panel = { modo: 'ficha' | 'editar'; id: string } | { modo: 'nueva' } | null;
```

Editing no longer closes the record and unfolds a form over the grid: the
fields replace the record's contents in place and saving comes straight back
to it. That is the same shape as the lead board's new-lead panel, and the
component both screens now share is `src/components/kit/EditSheet.tsx`.

A failure of any of those actions is said **inside** the panel (the `error`
prop, `role="alert"` above the footer) **and** as an error toast: an open
sheet hides the toast viewport from assistive technology, so the toast alone
is feedback a screen-reader user never gets. `panelError` is cleared when the
panel closes, when another record opens and when the failing action is retried.

Outcomes on this page are toasts from the ui kit's `useToast()`, never a
banner that pushes the grid down: `prop.guardada` / `prop.actualizada` /
`prop.fotosSubidas` (`ok`), `prop.errorGuardar`, `prop.errorFoto`,
`prop.errorSubirFotos`, `prop.errorEstado` and `prop.errorBuscar` (`error`).

Publishing is instant on the public site (it reads client-side with the
`estado="publicada"` filter; no rebuild).

## Search

The `.barra` header carries a search input (`.buscador`, ~44px touch
target). Behavior by query length (after `trim()`):

| Query | What happens |
|---|---|
| < 2 chars | full grid via `loadPropiedades()` (`listAll`, the whole collection, no debounce) |
| ≥ 2 chars | **server-side** search via `buscarPropiedades(q)`, debounced 300 ms |

Both come from the list brick's `useRemoteList` (`src/lib/useList.ts`,
`minChars: 2`), which exposes `items`, `loading`, `error`, `query` and
`reload()`; the page is then cut into 12 cards by `useList`.

`buscarPropiedades` (in `api.ts`) builds a PocketBase `~` (contains) filter
over `titulo`, `municipio`, `direccion` and `descripcion`, OR-joined —
equivalent to:

```bash
curl -G "$PB/api/collections/propiedades/records" -H "Authorization: $TOKEN" \
  --data-urlencode 'filter=titulo ~ "marina" || municipio ~ "marina" || direccion ~ "marina" || descripcion ~ "marina"' \
  --data-urlencode 'sort=-created' --data-urlencode 'perPage=500'
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
- **Errors** surface as an error toast (`prop.errorBuscar`), fired from
  `remoto.error` by an effect with a stable id, so a search that fails on
  every keystroke shows one toast replaced in place, not a stack:

```tsx
useEffect(() => {
  if (remoto.error) toast({ id: 'prop-search', tone: 'error', title: t('prop.errorBuscar', { error: remoto.error.message }) });
}, [remoto.error, t, toast]);
```

  The list states below decide what else renders.
- **Reloads respect the search**: `recargar()` (after create/edit/photo
  changes) re-runs the active search instead of resetting the grid.
- **Backend seam**: the query is isolated in `buscarPropiedades()` so the
  search backend can be swapped (e.g. for Meilisearch) without touching the
  UI. Today it is PocketBase `~` only — Meilisearch is **not** integrated.

### List states

Loading and empty come from the list brick's `ListStatus`
(`src/components/Pager.tsx`), rendered between the form and the grid; "no
results" keeps its own paragraph because it names the search:

```tsx
<ListStatus loading={remoto.loading}
  empty={!remoto.loading && !remoto.error && props.length === 0 && busqueda.trim().length < 2} />
{!remoto.loading && busqueda.trim().length >= 2 && props.length === 0 && (
  <p className="sin-resultados">{t('prop.sinResultados', { q: busqueda.trim() })}</p>
)}
```

| State | Condition | Rendered |
|---|---|---|
| Loading | `remoto.loading` | `<p class="list-status">` with `list.loading` |
| Empty collection | not loading, no error, zero items, query shorter than 2 chars | `<p class="list-status">` with `list.empty` |
| No results | not loading, query of 2+ chars, zero items | `<p class="sin-resultados">` with `prop.sinResultados` and the query |
| Error | `remoto.error` set | the `prop-search` toast with `prop.errorBuscar` (above); `ListStatus` is not given the `error` prop |

`empty` requires `!remoto.error`, so the error toast and `list.empty` never
render together (before this fix both showed after a failed load). Both
`ListStatus` and the "no results" paragraph are suppressed while a request is
in flight.

## Card summary line

The one-line summary under a card title, and the panel subtitle, are built by
`metaDe()` in `Propiedades.tsx`: the municipio, then the room count and the
area, each only when the record has it:

```ts
const metaDe = (p: Propiedad) => [
  p.municipio,
  p.habitaciones != null && t('prop.meta.rooms', { n: p.habitaciones }),
  p.superficie != null && t('prop.meta.area', { n: p.superficie }),
].filter(Boolean).join(' · ');
```

`prop.meta.rooms` is `"{n} beds"` / `"{n} hab"` and `prop.meta.area` is
`"{n} m²"`. A missing count is left out; the old single `prop.meta` key with
en-dash placeholders for unknown values is gone. `.ficha .meta` and
`.ficha .precio` use tabular numerals.

## The panel's three modes

### Reading a record

The record shows what is known and lets three decisions be taken without a
form, because each of them is a single value:

- **The price is a button.** Pressing it opens a kit `Popover` with a number
  input and `Guardar`; Enter saves, Escape closes. A blur does not save:
  clicking "Cancel" and having the value saved anyway is the classic
  click-to-edit trap.
- **The status is a group of four buttons** (`.estados`), one per value of
  `ESTADOS_PROPIEDAD`, the current one marked with `aria-pressed` and the
  colour its badge has in the grid. This IS the publish control: the old
  footer toggle could only swing between `borrador` and `publicada`, so
  marking a flat as reserved meant opening the form.
- **Photos are added and removed here**, not in the form (see below).

The footer therefore carries exactly one action, `Editar`, and one primary
per view holds.

### The form (create and edit)

`EditSheet` wraps the kit's `Sheet`: fields in one column, one primary that
saves and one ghost that gives up, and three things the old inline form did
not have.

- **The fields are a real `<form>`**, so Enter saves and `required` is the
  browser's job. The submit button sits in the panel's footer, outside the
  form element, and reaches it through `form="<id>"`.
- **It cannot be closed while it is saving.** A panel that vanishes mid-save
  invites a second entry, and the first one lands seconds later.
- **Inputs are controlled**, held in one `PropertyFields` object of strings
  (`src/crm/property-form.ts`). The old form was uncontrolled
  (`defaultValue`) and depended on a `key` remount that included
  `owners.length`, because an edit opened before the owners had loaded would
  resolve the select to the empty option and silently unlink the owner on
  save. With controlled fields that whole class of bug is gone, and so is the
  key.

`fieldsOf(record)` maps a stored record into the form and **a zero number
becomes an empty box**: PocketBase answers `0` for a number field that was
never set, and a form offering "0 baths" invites the agent to save a lie. The
same reasoning made `fmtPrecio` render `0` as `—` rather than "AED 0".

Saving returns to `ficha` mode on the record that was just written (the one
the POST or PATCH returned), never to the grid: the next thing an agent does
with a property they have just described is add its photos.

The owner picker is the ui kit's `Select`, not a native one, because it has to
carry a row that is a verb rather than a value: `+ Nuevo propietario…`, which
opens `OwnerDialog` over the sheet. That row sits **second**, right under
`Sin propietario` — this agency has 202 owners, and at the bottom of the list
it would be a row nobody ever scrolls to. Creating an owner links it to the
field and leaves the form exactly as it was.

`src/crm/OwnerDialog.tsx` is a kit `Dialog` with name, phone, email and a
consent `Toggle`; consent stores `consentimiento_en` with the moment it was
given, because that instant is the proof and cannot be recovered later from
the row's creation date.

### PATCH payload semantics

`payloadOf(fields, editing)` in `src/crm/property-form.ts` is pure and unit
tested (`property-form.test.mjs`, 9 assertions) — it is the subtlest thing on
this page and it had no test before. A create and an edit build **different**
payloads out of the same fields:

| Field kind | Create (POST) | Edit (PATCH) |
|---|---|---|
| Text (`municipio`, `direccion`, `descripcion`, `propietario`) | omitted when empty | `''`, which clears it |
| Number (`precio`, `habitaciones`, `banos`, `superficie`) | omitted when empty | `null`, which clears it |
| `estado` | `'borrador'` | never sent |

Omitting a field in a PATCH leaves the stored value alone, so a price the
agent **cleared** would silently survive; sending `null` on a create would
write a value nobody typed. Equivalent request for an edit:

```bash
curl -X PATCH "$PB/api/collections/propiedades/records/$ID" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"titulo":"Piso centro","municipio":"","precio":null, ...}'
```

Both calls are now **plain JSON**. Photos left the form, so the multipart
path with `@jsonPayload` (which existed only to keep the clearing `null`s
alive beside the files) is gone, and with it the double-submit hazard of
appending the same photos twice.

### Photos, on the record

The record shows every photo as a grid of thumbnails (`.ficha-fotos`, a
`<ul>`) and a file input beneath it. Choosing files uploads them immediately:
there is no second button, because on a phone the picker IS the button.

```js
for (const f of fotos) fd.append('fotos+', f, f.name); // append, never replace
```

New files are **appended** with PocketBase's `fotos+` multipart key. Plain
`fotos` on a PATCH would replace the whole set (silent data loss). Each file
goes through `normalizaFoto` first (HEIC and anything over 4.5 MB is
re-encoded to JPEG, max 2000px), and a neutral progress toast
(`prop.preparandoFotos`, `id: 'prop-fotos'`) shows while that runs, dismissed
in the `finally` so it never outlives its result.

Photo URL helpers in `api.ts`:

| Helper | Returns / effect |
|---|---|
| `fotoUrl(p, thumb = true)` | cover URL — always `fotos[0]` (`?thumb=600x400` unless `thumb: false`), `''` if no photos |
| `fotosUrls(p, thumb = true)` | array with **every** photo URL, in backend order |
| `quitarFoto(id, filename)` | PATCH `{ 'fotos-': [filename] }`; resolves to the updated record — file deletion is permanent |

### Deleting a photo

Each thumbnail overlays a close button (`.quitar-foto`, 44×44px touch target,
an inline SVG `IconClose` rather than a `✕` character; `aria-label` =
`prop.eliminarFoto`) that removes exactly that photo. The button is wrapped in
the ui kit's `Tooltip`, which shows `prop.eliminarFotoTitle` on hover and
focus; the `aria-label` stays on the button, because a tooltip is not one.

- **Confirm-gated**: PocketBase deletes the file from disk permanently, so
  the click first asks `confirm('¿Eliminar esta foto? El borrado es
  permanente.')`.
- **One write at a time**: `borrando` holds the in-flight filename and
  `subiendo` the upload; each bails out if the other is running, because two
  concurrent PATCHes on the same record can land out of order.
- **The panel does not wait for the list.** Every mutation stores the record
  it returned in `fresco`, which the panel prefers over the list copy for the
  open id until it closes. Without it the panel would blink shut after a
  create (the list reloads asynchronously) and a photo just uploaded would
  take a round trip to appear.

### What the record shows is never a stale copy

`ficha` is resolved on every render from the open id: `fresco` when it matches,
otherwise the row in the list. There is no second copy of the record in state
that can disagree with the grid — the bug the previous version avoided with a
`key` remount, avoided here by not keeping the copy at all.

## Photo-count badge on cards

Every card cover (wrapped in `.portada`) overlays a `.n-fotos` badge: an
inline SVG `IconCamera` (`size={12}`) followed by the count. It exists
because the cover always renders `fotos[0]` while new photos are appended at
the end: the cover pixels never change after an upload, so the incrementing
count is the visible proof that it worked.

```tsx
<span className="n-fotos" data-num title={t('prop.fotos', { count: p.fotos.length })}>
  <IconCamera size={12} /> {p.fotos.length}
</span>
```

- `data-num` opts the count into tabular numerals (`[data-num]` in
  `base.css`), so a badge going from 9 to 10 does not shift.
- Colours are the inverted pair, `color-mix(… var(--bg-invert) 65%,
  transparent)` on `var(--text-invert)`, so the badge reads over any photo in
  both colour schemes; no literal colour.
- The badge is `pointer-events: none` and only rendered when the property has
  photos. Otherwise the `.sinfoto` placeholder shows `IconCamera` at
  `size={32}` with `aria-hidden="true"`; no emoji in either place.

## Form and record layout (crm.css)

The `.alta` block that unfolded over the grid is gone. What is left is scoped
to the panel and shared with the rest of the CRM:

- `.campo`: one field, label above its control, full width — the same class
  the lead panel uses.
- `.campos-2`: two columns where they fit, one column under 420px. The four
  numbers of a property in a single row only fitted on a laptop, and the agent
  works on a phone.
- `.ficha-precio`: the price as a button that does not look like one until it
  is hovered (`--primary` on hover); `.precio-form` is the popover's row.
- `.estados` / `.estado-btn`: the four status buttons; the active one takes
  the colour its badge has in the grid (`--ok`, `--muted`, `--warn`,
  `--primary`).
- `.ficha-fotos`: a two-column grid of 3:2 thumbnails, each `<li>`
  `position: relative` so `.quitar-foto` can overlay it.
- `.ficha-dueno`: the owner line, label in small caps like `.ficha-franja` on
  the lead.
- `.pista`: muted helper text (now global, it was `.alta .pista`).

All of it is token-based (`--surface`, `--border`, `--radius*`, `--space-*`,
`--duration-press`, `--ease-out`); no literal colour, curve or duration, which
is what the E2 gate greps for.

One fix that belongs to the kit rather than to this screen landed with it:
`.kit-toggle` now states `flex-direction: row`. The CRM styles every `label`
as a column (field above its input) and a toggle is a label too, so the switch
had been rendering above its own text — visible in Ajustes as well as in the
new owner dialog.
