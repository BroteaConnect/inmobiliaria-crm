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
| Size (sq.ft) / Property Size / Built-up Area / Plot Area | `superficie` (sq ft → m²) |
| Transaction Value | `precio` |
| NameEn / Mobile / ProcedurePartyTypeNameEn | `p_nombre` / `p_telefono` / `party_tipo` |

The `zona` rule sits **before** the `superficie` rule and the size rule no
longer matches a bare `area`: in a DLD export "Area" is the community, not a
square footage. A header that *ends* in "area" (`Built-up Area`, `Plot Area`,
`Carpet Area`) still reaches `superficie`, because that rule runs after
`Area`/`AreaNameEn` have already been claimed by `zona`.

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

`unidad` goes through the lighter `limpiarTexto`: only-symbols and the
`JUNK` words are dropped, numerics are kept (a unit *is* `2205`). So
`unidad: "-"` yields neither `… · unidad -` in the title nor
`Marina Gate 1, -` in the address.

Why: the matcher job in the landing repo builds its zone vocabulary from what
these fields hold and a `"-"` in the vocabulary makes every historical lead
whose `criterios` says `Compró en - · …` a candidate for every property with
that `"-"` — a shortlist blast the day a Dubai draft is published.

**Twin file.** The list and the rules (minus the 80-character cap) are to be
mirrored as `JUNK_ZONA` / `esZonaValida` in `jobs/lib.mjs` of
`BroteaConnect/inmobiliaria` (landing PR of the same E5 phase), with the
same vector table in its test. Change both or neither.

## What a row becomes

- Title: the explicit `titulo` column, else `proyecto-or-municipio · edificio
  · unidad N` with the junk left out (`Burj Vista 1 · unidad 2205` when the
  master project is `-`).
- Property (`propiedadDe`): `titulo`, `municipio`, `proyecto`, `edificio`,
  `direccion` (explicit, else `edificio, unidad`), `precio`, `habitaciones`,
  `banos`, `superficie` (m²), `descripcion` (+ the transaction context),
  `estado: 'borrador'`; the loop adds `propietario`. Empties are omitted.
  `proyecto` and `edificio` are added to `pb/schema.json` by the landing
  repo; the CRM sends them only once that schema is applied (PocketBase
  drops unknown fields silently, so this PR merges after that one).
- Buyer rows (`party_tipo` matches `buyer|comprador`) become leads with
  `criterios` = `Compró en <title> · ~<price> · <context>` (`criteriosDe`),
  the exact shape the matcher parses. Junk never reaches the text.

## Dedupe keys (`claveDuplicado`, `clavesDuplicado`)

Existing property titles and new ones are compared through the same keys.
`claveDuplicado` is the whole title, lowercase, split on ` · `, with the
leading segments that fail `esZonaValida` dropped (the last segment always
survives); only leading junk goes, a junk-looking segment in the middle is
part of the name. `clavesDuplicado` adds, for a title of three or more
segments (zone · building · unit), the key of the tail without the zone —
building plus unit is the physical property.

The set of existing properties is seeded with every key of every title, and
a new row is skipped when **any** of its keys is in the set. So:

- a CSV imported **before** the junk rule (`- · Burj Vista 1 · unidad 2205`)
  and re-imported **after** it (`Burj Vista 1 · unidad 2205`) shares the
  whole key;
- the same CSV re-imported once the Area column supplies the zone
  (`Burj Khalifa · Burj Vista 1 · unidad 2205`) shares the tail key
  `burj vista 1 · unidad 2205` with the old row, and vice versa.

Two-segment titles have no tail: `unidad 1413` alone would make every 1413
in the city one flat. Leads are deduped by name, owners by name, as before.
