import type { ReactNode } from 'react';
import { Tabs as Rx } from 'radix-ui';
import './ui.css';

// Views of ONE thing, side by side: a lead's history and its visits, a
// property's data and its photos. Navigation between different things is the
// app's nav, not tabs. Arrow keys move between them; the active one is the
// only one that carries the primary colour.

export function Tabs({ items, value, onValueChange, defaultValue, label }: {
  items: { value: string; label: ReactNode; content: ReactNode; disabled?: boolean }[];
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  /** What the set of tabs is, for a screen reader. */
  label: string;
}) {
  return (
    <Rx.Root value={value} onValueChange={onValueChange} defaultValue={defaultValue ?? items[0]?.value}>
      <Rx.List className="ui-tabs-list" aria-label={label}>
        {items.map((it) => (
          <Rx.Trigger key={it.value} value={it.value} className="ui-tab" disabled={it.disabled}>{it.label}</Rx.Trigger>
        ))}
      </Rx.List>
      {items.map((it) => (
        <Rx.Content key={it.value} value={it.value} className="ui-tab-panel">{it.content}</Rx.Content>
      ))}
    </Rx.Root>
  );
}
