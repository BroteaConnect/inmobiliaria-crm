import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '../../lib/LocaleContext';

// The ninth component: where a detail opens.
//
// A record in this CRM — a property, a lead — is looked at WHILE the list stays
// on screen. That is the whole argument for a side panel over a page: the agent
// is working a list, and losing it to navigate means finding their place again
// on the way back. It is also why this is not a centred modal: a modal says
// "stop everything", and reading a lead is not an interruption of the work, it
// IS the work.
//
// Built on <dialog> and `showModal()`, which is not decoration. It gives, for
// free and correctly: a focus trap, Escape to close, the rest of the page made
// inert to assistive technology, and the top layer so no z-index can ever land
// above it. Hand-rolling a drawer means hand-rolling those four, and the fourth
// one is the one everybody forgets.

export function SidePanel({ open, onClose, title, subtitle, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Actions. They sit in a bar that does not scroll away with the content. */
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="kit-panel"
      // Escape and the backdrop both come back through here, so there is one
      // way out and the caller's state cannot drift from the dialog's.
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <header className="kit-panel-head">
        <div className="kit-panel-titles">
          <h2>{title}</h2>
          {subtitle && <p className="kit-panel-sub">{subtitle}</p>}
        </div>
        <button type="button" className="kit-panel-close" onClick={onClose} aria-label={t('panel.cerrar')}>
          ×
        </button>
      </header>
      <div className="kit-panel-body">{children}</div>
      {footer && <footer className="kit-panel-foot">{footer}</footer>}
    </dialog>
  );
}
