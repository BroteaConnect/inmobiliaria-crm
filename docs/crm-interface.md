# CRM interface conventions

The rules every CRM screen follows, for whoever adds the next one. They are
what `src/crm/crm.css`, `src/components/kit/kit.css`, `src/styles/base.css`,
`src/components/kit/Icono.tsx` and the ui kit (`src/components/ui/`) already
do; a new screen inherits them
rather than inventing its own. Screen-specific behaviour lives in
[docs/crm-leads.md](crm-leads.md) and
[docs/crm-propiedades.md](crm-propiedades.md).

## Why this page exists

Phase E2 of the estate agency build-out ("the CRM feels finished",
`docs/estate-buildout.md` in the platform repo) was merged as
BroteaConnect/inmobiliaria-crm#42. Its gates are: Kanban, Propiedades,
Importar, Ajustes and Login pass the `quick` interface review with zero
`HIGH`; `node scripts/measure-fleet.mjs --slug inmobiliaria-crm` reports
`transition_all = 0`, `motion_hardcoded = 0`, `motion_unreduced = 0` and
`copy_dashes = 0`; no hex, no `cubic-bezier(` and no bare duration in
`src/**/*.css`; both locales render every screen; deployed equals merged.
`node scripts/estate-gates/e2.mjs` (platform repo) re-checks all of it against
`origin/main`, so a screen that breaks a rule below fails the gate on the next
run, not in review.

## Motion and colour: tokens only

Every colour, curve and duration in `src/**/*.css` is a theme token
(`docs/theme-contract.md` in the platform repo). The generated
`src/styles/theme.css` is the token source and is exempt; `src/styles/identity.css`
may *declare* tokens with literals (`--alert: #…`) but may not use a literal
in a rule; everything else is tokens only.

- **Transitions name their properties** and use the two durations and two
  curves the theme provides:

```css
.lead  { transition: border-color var(--duration-press) var(--ease-out),
                     box-shadow  var(--duration-press) var(--ease-out); }
.menu-btn span { transition: transform var(--duration-fast) var(--ease-in-out),
                             opacity   var(--duration-fast) var(--ease-in-out); }
```

  `--duration-press` with `--ease-out` is for state changes under the pointer
  (hover, toggle, card border); `--duration-fast` is for the staged
  entrances (the ui kit's sheet, `despliegue`) and the hamburger's bars. Never
  `transition: all`, never a literal `.15s`.
- **Buttons do not add their own press.** `base.css` gives every `button`,
  `[role="button"]`, `.button` and `input[type="submit"]` a token transition
  on `scale, background-color, color, border-color, box-shadow, opacity` and
  `scale: var(--press-scale)` on `:active`. `.primario` used to stack a second
  transition and a `translateY(1px)` on top of it; it no longer does.
- **Reduced motion** is handled once, in `base.css`: transitions and
  animations collapse to `0.01ms`. The ui kit's `ui.css` relies on that too;
  its entrances and exits (`ui-fade`, `ui-rise`, `ui-slide`) carry no
  reduced-motion query of their own.
- **Pointer-only effects stay pointer-only**: the property card lift
  (`.ficha:hover { transform: translateY(-2px) }`) is inside
  `@media (hover: hover) and (pointer: fine)`, so a finger tapping a card does
  not move it.
- **`--alert` is the one red**, defined for light, dark and high contrast. The
  unattended dot (`.lead-alerta`, `.kit-alert::before`) and the unattended
  card border use it. `--accent` is not red at night and is not used for
  alarms.
- **Overlays on photos use the inverted pair**: `color-mix(in srgb,
  var(--bg-invert) 65%, transparent)` on `var(--text-invert)` (`.n-fotos`,
  `.quitar-foto` at 55%). No `rgba(9, 9, 45, …)` and no `#fff`.
- **Signals**: `--signal-high|medium|low` for the priority chips,
  `--ok`/`--warn`/`--danger`/`--muted` mixed at 12 to 15% for state pills and
  banners, `--bg-invert` + `--highlight` for the active nav item.

What the gate greps (`scripts/estate-gates/e2.mjs`, G2), per CSS line with
comments stripped: `#[0-9a-fA-F]{3,8}`, `cubic-bezier(`, and any non-zero
duration in `ms` or `s` outside a `--token:` declaration (`0s`, `0ms` and the
reduced-motion `0.01ms` are allowed). G1 runs the fleet's four polish
metrics over the same file walk as `measure-fleet.mjs` (`.css`, `.tsx`,
`.jsx`, `.astro`, `.vue`, `.svelte` and `src/locales/*.json`); all four must
stay at `0`.

## Icons: one set, drawn not typed

`src/components/kit/Icono.tsx` is the icon set of the screens. Every icon is an
inline SVG with `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
`strokeWidth={2}`, round caps and joins, `aria-hidden` and `focusable=false`.
The ui kit brings its own three glyphs in `src/components/ui/icons.tsx`
(`IconClose`, `IconChevron`, `IconCheck`; same anatomy, `strokeWidth` 1.75)
for the close affordance, the select trigger and the selected option; they
are the brick's, not this set's, and a screen keeps importing from `Icono.tsx`.
Filled glyphs (`IconoWhatsApp`, `IconDots`) use `fill="currentColor"
stroke="none"`. Because they inherit `currentColor`, the same icon works on a
ghost button, a primary button and the dark active tab.

| Export | Draws | `size` prop | Used by |
|---|---|---|---|
| `IconoWhatsApp` | filled WhatsApp bubble | no (16px) | `.kit-wa`, `WhatsAppButton` |
| `IconoTelefono` | handset | no (16px) | call button in the lead panel |
| `IconoEmail` | envelope | no (16px) | email button in the lead panel |
| `IconClock` | clock | yes | `TabBar` Today (20) |
| `IconList` | three lines | yes | `TabBar` Leads (20) |
| `IconHome` | house | yes | `TabBar` Properties (20) |
| `IconDots` | filled three dots | yes | `TabBar` More (20) |
| `IconArrowLeft` | arrow | yes | Kanban previous stage (16) |
| `IconArrowRight` | arrow | yes | Kanban next stage (16) |
| `IconClose` | cross | yes | `ListCard` postpone (16), `.quitar-foto` (16). The dialog, sheet and toast close buttons use the ui kit's own `IconClose` (`src/components/ui/icons.tsx`) |
| `IconCamera` | camera | yes | `.n-fotos` badge (12), `.sinfoto` placeholder (32) |

`size` is in CSS pixels and sets both `width` and `height` (default 16), so a
tab icon and a button icon come from the same drawing. The three `Icono*`
exports predate the prop and are fixed at 16px.

Glyph characters (`◔ ☰ ⌂ ···` in the tab bar, `← → × ✕ 📷 ●` on buttons and
markers) were dropped because they are text, not icons: each font draws them
at its own weight and baseline, some fonts do not have them, and emoji ignore
`currentColor`. Where a marker is a shape rather than a picture, it is drawn
in CSS: `.lead-alerta` and `.kit-alert::before` are 8px circles in
`--alert`.

```tsx
import { IconClose } from '../components/kit/Icono';
<button type="button" className="quitar-foto" aria-label={t('prop.eliminarFoto', { n: i + 1 })}>
  <IconClose />
</button>
```

An icon-only button always carries an `aria-label` from the locale; the SVG
itself is `aria-hidden`.

## Hit areas

Anything a thumb reaches is 44px (2.75rem at the default root size); the
desktop header, which is for a pointer, is 40px.

| Target | How it gets there |
|---|---|
| `.kit-btn`, `.primario`, `.alta .acciones button`, `.importar .archivo input`, `.prioridad .nivel`, `.pager button`, `.login .enlace` | `min-height: 2.75rem` |
| `.ui-close` (dialog and sheet), `.menu-btn`, `.quitar-foto` | `width: 44px; height: 44px` |
| `.etapa-chip`, `.filtros` input, `.ui-select` (the board's property filter, in `ui.css`), `.buscador` | `min-height: 44px` |
| `.lead .mover button` | 44px wide, 36px drawn, `::after { inset: -4px 0 }` |
| `.lead-abrir` | about 34px drawn, `::after { inset: -5px 0 }` |
| `.kit-card-aplazar` | 28px drawn, `::after { inset: -8px }` |
| `.topnav .links a`, `.topnav .salir` | `min-height: 40px` (44px inside the collapsed mobile menu) |

The `::after` device keeps the drawn control light while the pointer target
is full size: the element is `position: relative` and an empty, absolutely
positioned pseudo-element extends its box. Two rules when adding one: the
extension must stop at the neighbour's edge (the arrows extend vertically
only; `.kit-card-aplazar` extends 8px, the gap to its neighbour), and the
offsets are written in px. They are geometry, the distance to a neighbour,
not a colour, curve or duration; the theme contract has no hit-area token and
G2 does not forbid lengths.

`.pager button { min-height: 2.75rem }` is overridden in `crm.css` rather than
edited in `src/components/Pager.css`, which is the list brick's copy.

## The mobile tab bar is a sibling of the header

`TabBar` (`src/components/kit/index.tsx`) is the header's navigation in the
shape a thumb reaches: `.kit-tabs` is `display: none` on desktop and
`position: fixed; bottom: 0` at or below 719.98px. In `App.tsx` it is rendered
**next to** `<nav className="topnav">`, inside a fragment, not inside it:

```tsx
<>
  <nav className="topnav">…</nav>
  <TabBar moreOpen={menuOpen} more={…} moreLabel={t('nav.mas')}
    items={[
      moduleEnabled(settings, 'modules.today') && { to: '/hoy', label: t('nav.hoy'), icon: <IconClock size={20} /> },
      moduleEnabled(settings, 'modules.leads') && { to: '/', label: t('nav.leads'), icon: <IconList size={20} />, end: true },
      moduleEnabled(settings, 'modules.properties') && { to: '/propiedades', label: t('nav.propiedades'), icon: <IconHome size={20} /> },
    ].filter(Boolean) as { to: string; label: string; icon: React.ReactNode; end?: boolean }[]}
  />
</>
```

The bug this fixed: `.topnav` is `position: sticky` with
`backdrop-filter: blur(10px)`, and a `backdrop-filter` makes an element the
containing block for its `position: fixed` descendants. Inside the header,
`bottom: 0` meant the bottom of the header, so on every phone the tab bar sat
at the top of the screen over the brand and the menu button. The
before/after screenshots in `docs/review/e2/` show it.

`items[].icon` is a `ReactNode` (an `Icono` component), not a string. The
caller filters items by module before passing them: a module that is off has
no tab. `.contenido` reserves `padding-bottom` for the bar on mobile.

## Copy

- **No em or en dashes** in either locale (`copy_dashes = 0`). Use a comma, a
  colon or a full stop: `"Showing {from} to {to} of {total}"`, not a range
  written with an en dash.
- **Dashes typed in JSX become locale keys.** The owner select's empty option
  is `t('prop.sinPropietario')`, not an em dash; an unknown room count or
  area is left out of `metaDe()` rather than shown as an en dash.
- **Both locales have every key.** `src/locales/locales.test.mjs` (run by
  `npm test`, so by CI and by gate G3) fails when `en.json` and `es.json`
  differ in key set, when a value is empty, when keys are unsorted, when a
  `{placeholder}` is lost in translation or when a plural stem lacks the
  forms the language needs. `config.json` marks both `en` and `es` as
  required.
- **App copy is Spanish data.** `es.json` ships Spanish because Spanish is one
  of the two required languages; never "translate" it. Code, comments and
  docs are English.

## One primary action per view

`kit-btn kit-btn-primary` appears once per view; anything else is
`kit-btn kit-btn-ghost` (or the channel button `.kit-wa`, which is not a
rival). Login is the example: "Continue with Google" is the primary
(`.primario`), the magic-link submit is `kit-btn kit-btn-ghost`; the
emergency form, shown only on demand, is a separate form with its own submit.

```tsx
<button className="primario" type="button" onClick={conGoogle}>{t('auth.google')}</button>
<button className="kit-btn kit-btn-ghost" type="submit">{t('auth.magic.submit')}</button>
```

The ghost button often already sits on `--surface` (Login, every panel foot),
where a hover that only sets `background: var(--surface)` is invisible.
`.kit-btn-ghost:hover` therefore also moves `border-color` to `--muted`, the
same cue the kit's `.ui-close:hover` uses.

## Interactive primitives come from the ui kit

Since the platform's `ui` brick (`brotea add ui`, 2026-09-11) the dialogs,
selects, menus, popovers, tabs, tooltips and toasts of this CRM are
`src/components/ui/` — Radix Primitives behaviour, `ui.css` in theme tokens,
one anatomy per component. `brotea.json` declares it as `ui` version `1.2.0`
with the single dependency `radix-ui` (`^1.6.7` in `package.json`) and lists
the twelve files under `src/components/ui/` as the brick's, so an edit there
is a platform change, not a CRM one. Everything is
exported from `src/components/ui/index.ts` (`Dialog`, `Sheet`, `Select`,
`Menu`, `Popover`, `Tabs`, `Tooltip`, `useToast`, `ToastProvider`,
`UiProvider`). A screen does not hand-roll one of those and does
not import a component library for it. The brick's `wire.md` (platform repo,
`feature-templates/ui/`) carries the decision — Radix, not shadcn, because
shadcn brings Tailwind and CSS the E2 gate counts as debt — and the rules;
what applies here:

- **A dialog stops the work; the side panel is the work.** Reading a record
  beside the board is `SidePanel`, which since the ui kit is the kit's `Sheet`
  under the name the screens already use. It was a native `<dialog>` with
  `showModal()`; that lives in the browser's top layer, where no portal can
  paint, and the quick review found the kit's `Select` inside the new-lead
  panel and the toasts fired with a record open rendered underneath, inert.
  One layering model for every overlay is the rule now (the brick's `wire.md`).
  "Answer this before continuing" is the kit's `Dialog`: the email compositor
  is one. It closes the record while the email is written and reopens it,
  history reloaded, when it is sent or dropped, so the agent lands on the
  proof of what happened.
- **A modal's own failure is said inside the modal.** An open sheet or dialog
  hides the rest of the page, toasts included, from assistive technology. So
  the compositor, the new-lead panel and both record panels pass `error` to
  the kit (`role="alert"` above the footer) from their action's `catch`: a
  failed send, a failed create, a failed note, a failed publish. The toast
  stays for the sighted path; the panel is the announced one. The new-lead
  panel also refuses to close while the create is in flight.
- **Toasts replace and dismiss by id.** The property search error carries
  `id: 'prop-search'` (one toast while typing against a failing API, replaced
  in place); "preparing photos" carries `id: 'prop-fotos'` and is dismissed in
  the save's `finally`.
- **`Select` is for the controls that drive a screen** (the board's property
  filter, the new-lead property). A plain form field that posts stays a native
  `<select>` (the property form's owner). `Select` carries `''` as a value
  through a private sentinel; callers keep `''` for "all" / "none".
- **Outcomes are toasts, states are inline.** "Email sent", "could not save",
  "photos being prepared" go through `useToast()` (`ok`, `error`, neutral) and
  leave by themselves. A state the screen is in — loading, empty, a failed load,
  a module switched off, the local-settings notice — stays inline with
  `role="status"` / `role="alert"`, because it is true until it is not.
- **A tooltip names an icon-only control; the control keeps its
  `aria-label`.** The photo-delete button is the example.
- `UiProvider` is mounted once in `App.tsx`, inside `LocaleProvider`, so its
  two strings (`ui.close`, `ui.notifications`) follow the language switch. The
  kit's layers sit at `z-index: 100`, above the sticky header (50) and the
  mobile tab bar (60); the toast viewport is above everything.

## Every list states loading, empty and error

A list that renders nothing before its data arrives is lying about the data.
Each list screen distinguishes at least: loading (`list.loading`,
`role="status"`), empty (`list.empty` or a screen-specific key such as
`lead.vacio`), filtered or searched to nothing (`lead.sinResultados`,
`prop.sinResultados`) and a failed load (`list.error` with the message, in
`.aviso-error`). An error is never rendered as an empty list: the empty state
is gated on "no error". Propiedades takes loading and empty from the list
brick's `ListStatus` (`src/components/Pager.tsx`); Kanban renders its own
`.tablero-estado` paragraphs so the columns keep their shape underneath. The
exact conditions are in the two screen pages.

## Form controls have visible labels

The Import file input is wrapped in a label:

```tsx
<label className="archivo">
  <span>{t('imp.archivo')}</span>
  <input type="file" accept=".csv,text/csv,.tsv" onChange={…} />
</label>
```

`imp.archivo` is "CSV file" / "Fichero CSV". A bare `<input type="file">`
has no name for a screen reader and no target beyond the browser's own
button.

## `docs/` is outside the Docker build context

`.dockerignore` lists `docs` because `docs/review/` holds the review
screenshots (about 4.5 MB for E2) and nothing in the image reads the
documentation. Adding screenshots to `docs/` does not grow the build.

## Review screenshots

`docs/review/e2/<screen>-<width>-<before|after>.png`, with `<screen>` one of
`kanban`, `propiedades`, `importar`, `ajustes`, `login` and `<width>` `390`
(mobile, 2x) or `1280` (desktop): twenty files. *Before* is the deployed
`origin/main` at `7f93fe0`; *after* is the vite preview of the E2 branch.
Names, phones and emails from real records were replaced in the DOM before
every shot. The PR body of #42 embeds them. The shots predate the last review
fixes (failed-load state, `role="img"` on the dot, the `.lead-abrir` tap
target, the ghost hover cue), which were verified by reading the code paths.

`docs/review/ui-kit/<screen>-<width>-<before|after>.png` (2026-09-11) covers
the ui kit's arrival: `board` (the property filter as `Select`), `record`,
`compose` (the compositor as `Dialog`; *before* shows it rendered behind the
open side panel, which is the bug the dialog fixes) and `select` (after only,
the open list). *Before* is the deployed `origin/main` at `ad91331`; *after*
is the vite preview of the branch, logged in as the CRM user, on the demo
lead. Fourteen files, about 1.1 MB.

## Known open item, closed by the kit

The E2 review rated LOW that the side panel entered (`kit-panel-in`) but
closed with no exit. The ui kit's `Sheet` carries a token exit (`ui-slide`
reversed on `data-state="closed"`, `--duration-exit`), which runs when the
caller keeps `open` controlled. Kanban and Propiedades mount their panels
conditionally (`{ficha && <SidePanel open …>}`), so the panel still cuts on
close: deliberate, because the surface that replaces it (the board, the
compositor) arrives in the same commit, and two motions for one action is
noise. Nothing is open here now.
