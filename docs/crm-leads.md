# CRM — Kanban lead board

How the CRM's lead board (`src/crm/Kanban.tsx` + `src/crm/api.ts` +
`src/crm/crm.css`) filters and prioritizes `leads` records in the shared
PocketBase. This page covers the filter bar and the 1–5 priority; contact
logging, email sending and the unattended (⚠) rule live in the code
comments in `api.ts`.

## Board basics

- One column per etapa: `nuevo`, `contactado`, `visita`, `oferta`,
  `reservado`, `vendido`, `nutriendo` (`ETAPAS` in `api.ts`).
- `loadLeads()` fetches the latest 200 leads (`sort: -created`,
  `expand: propiedad`); the board live-reloads via the PocketBase realtime
  subscription `onLeadsChange` (`leads/*`).

## Filter bar (`.filtros`)

Above the columns, two controls narrow the board — both **100% client-side**
over the already-loaded window (no extra requests while typing):

| Control | Values | Effect |
|---|---|---|
| Property `<select>` | `''` (Todas las propiedades) / `'sin'` (Sin propiedad) / a property id | `'sin'` keeps only leads with an empty `propiedad` relation; an id keeps that property's leads. Options come from `loadPropiedades()` (latest 200). |
| Search `<input type="search">` | free text | matched against `nombre`, `email`, `telefono` and `mensaje` via `coincideLead` |

- **Accent + case folding** on both sides of the lead search
  (`NFD`-normalize, strip combining marks, lowercase): typing `malaga`
  matches `"Málaga"`. Note this is the opposite of the /propiedades
  server-side search, which does **not** fold accents.
- **Filters survive SSE reloads**: filter state lives in its own React
  state, not derived from the data — a realtime reload replaces `leads` but
  never resets the selected property or the typed query. The visible list
  is re-derived on every render (`visibles = leads.filter(...)`).
- Column headers show the **filtered** counts.

## Priority 1–5

Each card renders five toggle buttons (`.prioridad`, `role="group"`):

- Clicking a number sets it; clicking the **active** number clears the
  priority (`setPrioridad(id, null)`). While unset, a muted `—` is shown.
- Persisted in the `prioridad` number field of the `leads` collection
  (schema applied via BroteaConnect/inmobiliaria#14):

```bash
curl -X PATCH "$PB/api/collections/leads/records/$ID" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"prioridad": 3}'   # send null to clear it
```

- **0 means unset**: PocketBase returns `0` for an empty number field; the
  UI treats `0`/missing as "no priority" (falsy checks in the card,
  `?? 0` in the sort) — never render `0` as a real priority.
- **Per-column ordering** (`porPrioridad`): priority descending (5 first),
  no-priority last; ties broken by `created` descending (newest first).
- After a change the board reloads (`recargar()`), so the card jumps to its
  new position immediately.
- UI: 32px round dots whose `::after` overlay expands the touch target to
  ~44px (mobile clients); active state and colors use theme tokens
  (`--primary`, `--primary-contrast`, `--border`).
