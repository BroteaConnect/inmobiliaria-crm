import type { ReactNode } from 'react';
import { Tooltip as Rx } from 'radix-ui';
import { ToastProvider } from './Toast';

// One provider at the root, inside <LocaleProvider>: toasts get a viewport and
// tooltips share a delay. Everything else in the kit works without it.
export function UiProvider({ children }: { children: ReactNode }) {
  return (
    <Rx.Provider delayDuration={400} skipDelayDuration={300}>
      <ToastProvider>{children}</ToastProvider>
    </Rx.Provider>
  );
}
