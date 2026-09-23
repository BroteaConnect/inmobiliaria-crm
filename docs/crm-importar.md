# CRM — /importar view

How the CRM's import page (`src/crm/Importar.tsx`) turns a CSV/TSV export —
in practice the Dubai transaction register — into `propietarios`,
`propiedades` (always `borrador`) and historical `leads`. The screen and the
loop live in the component; every decision about a column or a row lives in
`src/crm/import-mapping.ts`, a pure module gated by
`src/crm/import-mapping.test.mjs` (`node --test`, see
`.github/workflows/logic.yml`).

## Column heuristics (`adivina`)

Each header is lowercased and run through an ordered list of regexes; the
first match wins and the agent can override any guess in the mapping table
(labels come from `campo.<name>` in `src/locales/*.json`). The targets are
`CAMPOS`: person (`p_nombre`, `p_telefono`, `p_email`, `p_pais`,
`party_tipo`), property (`titulo`, `municipio`, `zona`, `proyecto`,
`edificio`, `unidad`, `direccion`, `precio`, `habitaciones`, `banos`,
`superficie`, `descripcion`) and transaction (`t_fecha`, `t_proc`).

The register's headers land as follows:

| Header | Field |
|---|---|
| Master Project | `municipio` (the zone the agents name) |
| AreaNameEn / Area / Community / District | `zona` (fallback zone) |
| ProjectNameEn | `proyecto` |
| BuildingNameEn | `edificio` |
| UnitNumber | `unidad` |
| Size (sq.ft) / Property Size | `superficie` (sq ft → m²) |
| Transaction Value | `precio` |
| NameEn / Mobile / ProcedurePartyTypeNameEn | `p_nombre` / `p_telefono` / `party_tipo` |

The `zona` rule sits **before** the `superficie` rule and the size rule no
longer matches a bare `area`: in a DLD export "Area" is the community, not a
square footage.

## The junk rule (`esZonaValida`, `limpiarZona`)

A cell is not a zone when, after trimming and collapsing spaces, it is:

- empty;
- only punctuation, symbols or spaces (`-`, `—`, `/`);
- numeric (`0`, `12`, `1,200`);
- one of `JUNK`: `master project`, `masterproject`, `project`, `area`,
  `community`, `district`, `municipio`, `zona`, `n/a`, `na`, `none`, `null`,
  `nil`, `tbd`, `unknown`, `desconocido`, `sin datos` (case-insensitive);
- longer than 80 characters.

`municipio` is the cleaned Master Project, else the cleaned Area/Community,
else absent. `proyecto` and `edificio` are cleaned the same way. A junk value
is **omitted** from the record, never stored as `""` or `"-"`.

Why: the matcher job in the landing repo builds its zone vocabulary from what
these fields hold and a `"-"` in the vocabulary makes every historical lead
whose `criterios` says `Compró en - · …` a candidate for every property with
that `"-"` — a shortlist blast the day a Dubai draft is published.

**Twin file.** `jobs/lib.mjs` in `BroteaConnect/inmobiliaria` carries the
same list as `JUNK_ZONA` and the same rules (minus the 80-character cap), and
its test pins the same vector table. Change both or neither.

## What a row becomes

- Title: the explicit `titulo` column, else `proyecto-or-municipio · edificio
  · unidad N` with the junk left out (`Burj Vista 1 · unidad 2205` when the
  master project is `-`).
- Property (`propiedadDe`): `titulo`, `municipio`, `proyecto`, `edificio`,
  `direccion` (explicit, else `edificio, unidad`), `precio`, `habitaciones`,
  `banos`, `superficie` (m²), `descripcion` (+ the transaction context),
  `estado: 'borrador'`; the loop adds `propietario`. Empties are omitted.
- Buyer rows (`party_tipo` matches `buyer|comprador`) become leads with
  `criterios` = `Compró en <title> · ~<price> · <context>` (`criteriosDe`),
  the exact shape the matcher parses. Junk never reaches the text.

## Dedupe key (`claveDuplicado`)

Existing property titles and new ones are compared through the same key:
lowercase, split on ` · `, leading segments that fail `esZonaValida`
dropped (the last segment always survives). So a CSV imported **before** the
junk rule (`- · Burj Vista 1 · unidad 2205`) and re-imported **after** it
(`Burj Vista 1 · unidad 2205`) creates no duplicate. Only leading junk is
dropped: a junk-looking segment in the middle is part of the name. Leads are
deduped by name, owners by name, as before.
