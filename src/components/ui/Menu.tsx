import type { ReactNode } from 'react';
import { DropdownMenu as Rx } from 'radix-ui';
import './ui.css';

// The overflow menu: the actions a row does not have room for. A row still
// shows ONE action; the menu is where the rest wait, not a way to show three.
//
// `items` is data, not JSX, so every menu in the app has the same anatomy and
// the dangerous item is marked the same way everywhere.

export type MenuItem =
  | { label: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }
  | { separator: true }
  | { heading: ReactNode };

export function Menu({ trigger, items, align = 'end' }: {
  /** The button that opens it. It receives the aria state; give it an aria-label if it is an icon. */
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <Rx.Root>
      <Rx.Trigger asChild>{trigger}</Rx.Trigger>
      <Rx.Portal>
        <Rx.Content className="ui-pop ui-menu" align={align} sideOffset={4} collisionPadding={8}>
          {items.map((it, i) => {
            if ('separator' in it) return <Rx.Separator key={i} className="ui-menu-sep" />;
            if ('heading' in it) return <Rx.Label key={i} className="ui-menu-label">{it.heading}</Rx.Label>;
            return (
              <Rx.Item
                key={i}
                className={it.danger ? 'ui-menu-item is-danger' : 'ui-menu-item'}
                disabled={it.disabled}
                onSelect={it.onSelect}
              >
                {it.label}
              </Rx.Item>
            );
          })}
        </Rx.Content>
      </Rx.Portal>
    </Rx.Root>
  );
}
