import type { ReactNode } from 'react';
import { Sheet } from '../ui';

// The ninth component: where a detail opens.
//
// A record in this CRM — a property, a lead — is looked at WHILE the list stays
// on screen. That is the whole argument for a side panel over a page: the agent
// is working a list, and losing it to navigate means finding their place again
// on the way back. It is also why this is not a centred modal: a modal says
// "stop everything", and reading a lead is not an interruption of the work, it
// IS the work.
//
// It is the ui kit's Sheet, under the name the screens already use. Until
// 2026-09-11 it was a native <dialog> opened with showModal(), which gave the
// focus trap and Escape for free — and lived in the browser's top layer, where
// nothing else can paint: the kit's Select opened inside it and the toasts
// fired while it was open landed underneath, inert. One layering model for
// every overlay is worth more than the free showModal().

export function SidePanel({ open, onClose, title, subtitle, children, footer, error }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Actions. They sit in a bar that does not scroll away with the content. */
  footer?: ReactNode;
  /** The failure of one of those actions, said inside the panel (role="alert"):
   *  an open panel hides the toasts from assistive technology. */
  error?: ReactNode;
}) {
  return (
    // Escape and the overlay both come back through `onOpenChange`, so there is
    // one way out and the caller's state cannot drift from the sheet's.
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={title} description={subtitle} footer={footer} error={error}>
      {children}
    </Sheet>
  );
}
