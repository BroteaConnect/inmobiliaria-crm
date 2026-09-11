import type { ReactNode } from 'react';
import { Popover as Rx } from 'radix-ui';
import './ui.css';

// A small surface anchored to the control that opened it: a filter, a date, a
// short form. It is not a dialog — the page behind stays live — and it is not
// a tooltip: it has controls in it and holds focus while it is open.

export function Popover({ trigger, title, children, align = 'start', open, onOpenChange }: {
  trigger: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  /** Controlled when both are given; otherwise the popover keeps its own state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Rx.Root open={open} onOpenChange={onOpenChange}>
      <Rx.Trigger asChild>{trigger}</Rx.Trigger>
      <Rx.Portal>
        <Rx.Content className="ui-pop ui-popover" align={align} sideOffset={6} collisionPadding={8}>
          {title && <p className="ui-popover-title">{title}</p>}
          {children}
          <Rx.Arrow className="ui-arrow" />
        </Rx.Content>
      </Rx.Portal>
    </Rx.Root>
  );
}
