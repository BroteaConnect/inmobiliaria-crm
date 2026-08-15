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
