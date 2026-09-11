import type { ReactNode } from 'react';
import { Tooltip as Rx } from 'radix-ui';
import './ui.css';

// The name of an icon-only control, on hover and on focus. It is not where
// information lives — a tooltip is never the only place a thing is said — and
// the control still needs its aria-label, because a tooltip is not one.
//
// Each tooltip carries its own provider so a screen can use one without
// mounting anything; the app-level provider in UiProvider shares the delay.

export function Tooltip({ label, children, side = 'top' }: {
  label: ReactNode;
  /** One focusable element. It receives the aria-describedby. */
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <Rx.Provider delayDuration={400} skipDelayDuration={300}>
      <Rx.Root>
        <Rx.Trigger asChild>{children}</Rx.Trigger>
        <Rx.Portal>
          <Rx.Content className="ui-tooltip" side={side} sideOffset={6} collisionPadding={8}>
            {label}
            <Rx.Arrow className="ui-tooltip-arrow" />
          </Rx.Content>
        </Rx.Portal>
      </Rx.Root>
    </Rx.Provider>
  );
}
