import type { ReactNode } from 'react';

// The consolidated kit from the design's turn 10 — "un solo sistema, 8
// componentes". This file holds the three the settings screen needs; the rest
// (nav, priority, alert, list card, KPI, WhatsApp CTA) arrive with the screens
// that use them, because a component nobody renders is a component nobody
// notices is wrong.
//
// The two rules that are not negotiable, because they are what the design is
// FOR:
//
//   ONE PRIMARY PER VIEW. `<Button>` defaults to ghost. If a screen needs a
//   second primary, the screen is asking two questions and should be two
//   screens.
//   ONE RADIUS. 12px, everywhere, from `--radius`. Not a rounded card here and
//   a pill there.
//
// Colours come from the theme tokens the composer generates, never as literals:
// `--primary` IS Brotea's Electric Violet, and a hex typed here is a colour the
// theme can no longer change.

export function Button({ variant = 'ghost', children, ...rest }: {
  variant?: 'primary' | 'ghost';
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`kit-btn kit-btn-${variant}`} {...rest}>{children}</button>;
}

/**
 * A switch for something that is on or off, with its own label.
 *
 * A checkbox rather than a div with a click handler: it is focusable, it
 * announces its state, and the space bar works — none of which a styled div
 * gives you, and all of which somebody notices the day they cannot use a mouse.
 */
export function Toggle({ checked, onChange, label, hint, disabled }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`kit-toggle${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="kit-toggle-track" aria-hidden="true"><span className="kit-toggle-knob" /></span>
      <span className="kit-toggle-text">
        <span className="kit-toggle-label">{label}</span>
        {hint && <span className="kit-toggle-hint">{hint}</span>}
      </span>
    </label>
  );
}

/** A small state marker. `tone="on"` is the only one that carries the accent. */
export function Chip({ tone = 'off', children }: { tone?: 'on' | 'off'; children: ReactNode }) {
  return <span className={`kit-chip kit-chip-${tone}`}>{children}</span>;
}

/**
 * The only red signal the system allows.
 *
 * The design is strict about this and it is the reason the screen reads at a
 * glance: at most one per card, and a card showing an alert shows no priority —
 * two competing severities on one row is two things shouting and nothing heard.
 */
export function Alert({ children }: { children: ReactNode }) {
  return <span className="kit-alert">● {children}</span>;
}

/**
 * One anatomy for every list in the CRM: signal, name, one line of context, one
 * action. Leads, replies, rules and agenda entries are all this.
 *
 * `action` is deliberately singular. A row with three buttons is a row that
 * postpones the decision instead of asking for it.
 */
export function ListCard({ signal, name, context, action, extra }: {
  signal?: ReactNode;
  name: string;
  context: string;
  action: ReactNode;
  /** A second, lower-weight affordance — the channel button, never a rival. */
  extra?: ReactNode;
}) {
  return (
    <article className="kit-card">
      <div className="kit-card-text">
        {signal && <div className="kit-card-signal">{signal}</div>}
        <h3 className="kit-card-name">{name}</h3>
        <p className="kit-card-context">{context}</p>
      </div>
      <div className="kit-card-actions">
        {extra}
        {action}
      </div>
    </article>
  );
}

/**
 * A number that is the message. One variant, no colour, no sparkline: the
 * design's rule is that the figure carries it and anything else is decoration
 * competing with the figure.
 */
export function Kpi({ label, value, of }: { label: string; value: ReactNode; of?: ReactNode }) {
  return (
    <div className="kit-kpi">
      <span className="kit-kpi-value">{value}{of && <span className="kit-kpi-of"> / {of}</span>}</span>
      <span className="kit-kpi-label">{label}</span>
    </div>
  );
}

/**
 * The channel button. It may sit next to the primary because it is not a rival:
 * it says WHERE the conversation happens, not what the screen wants you to do.
 *
 * Node Green ground with a Glow mark, as the design specifies — and as the
 * theme can now say: `ground-alt` and `highlight` were added to the vocabulary
 * for this pair rather than typing the two hexes here, which would have been
 * two colours no theme could ever change.
 */
export function WhatsAppButton({ phone, label, message }: {
  phone: string;
  label: string;
  message?: string;
}) {
  const digits = phone.replace(/[^\d]/g, '');
  const href = `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
  return (
    <a className="kit-wa" href={href} target="_blank" rel="noreferrer" aria-label={label}>
      <span aria-hidden="true">💬</span> {label}
    </a>
  );
}

/**
 * The eighth component: ONE navigation, in two shapes.
 *
 * The design is explicit that the desktop tabs and the mobile tab bar are the
 * same component — "activo = Eggplant + Glow (tokens de marca, no
 * blanco+sombra)". Two navigations is how a phone ends up one release behind a
 * laptop: somebody adds a screen to the header and nobody adds it to the bar.
 *
 * `items` are already filtered by the caller: a module that is off has no tab.
 */
export function TabBar({ items, more, moreLabel, moreOpen }: {
  items: { to: string; label: string; icon: string; end?: boolean }[];
  more: () => void;
  moreLabel: string;
  moreOpen: boolean;
}) {
  return (
    <nav className="kit-tabs" aria-label={moreLabel}>
      {items.map((it) => (
        <a
          key={it.to}
          href={it.to}
          className={`kit-tab${isCurrent(it) ? ' is-active' : ''}`}
          aria-current={isCurrent(it) ? 'page' : undefined}
        >
          <span className="kit-tab-icon" aria-hidden="true">{it.icon}</span>
          {it.label}
        </a>
      ))}
      <button
        type="button"
        className={`kit-tab${moreOpen ? ' is-active' : ''}`}
        onClick={more}
        aria-expanded={moreOpen}
      >
        <span className="kit-tab-icon" aria-hidden="true">···</span>
        {moreLabel}
      </button>
    </nav>
  );
}

/** Plain location comparison: the bar renders outside the router's context on
 *  first paint, and a NavLink there throws rather than degrading. */
function isCurrent(it: { to: string; end?: boolean }) {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return it.end ? path === it.to : path === it.to || path.startsWith(`${it.to}/`);
}
