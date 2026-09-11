import type { ReactNode } from 'react';
import { Dialog as Rx } from 'radix-ui';
import { useI18n } from '../../lib/LocaleContext';
import { IconClose } from './icons';
import './ui.css';

// Where a record opens: a sheet on the trailing edge, full height, over a
// dimmed list that stays exactly where it was. Reading a lead or a property
// is not an interruption of the work, it IS the work — which is why this is
// not the centred Dialog, and why the list is still visible behind it.
//
// It is the kit's Dialog in another shape, on purpose. A native <dialog> with
// showModal() gave the same focus trap and Escape for free, but it lives in
// the browser's top layer, where nothing else can paint: a Select opened
// inside it, or a toast fired while it was open, landed underneath, inert.
// One layering model for every overlay is the whole reason this exists.

export function Sheet({ open, onOpenChange, title, description, children, footer, error, side = 'end' }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** One line under the title. Announced with the sheet when present. */
  description?: ReactNode;
  children: ReactNode;
  /** Actions, in a bar that does not scroll away with the content. */
  footer?: ReactNode;
  /**
   * What went wrong with the sheet's own action, said inside the sheet: a
   * modal hides the rest of the page from assistive technology, toasts
   * included, so a failure here is announced where the focus is.
   */
  error?: ReactNode;
  side?: 'end' | 'start';
}) {
  const { t } = useI18n();
  return (
    <Rx.Root open={open} onOpenChange={onOpenChange}>
      <Rx.Portal>
        <Rx.Overlay className="ui-overlay" />
        <Rx.Content
          className={side === 'start' ? 'ui-sheet ui-sheet--start' : 'ui-sheet'}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className="ui-sheet-head">
            <div className="ui-sheet-titles">
              <Rx.Title className="ui-sheet-title">{title}</Rx.Title>
              {description && <Rx.Description className="ui-sheet-sub">{description}</Rx.Description>}
            </div>
            <Rx.Close className="ui-close" aria-label={t('ui.close')}><IconClose /></Rx.Close>
          </header>
          <div className="ui-sheet-body">{children}</div>
          {error && <p role="alert" className="ui-alert">{error}</p>}
          {footer && <footer className="ui-sheet-foot">{footer}</footer>}
        </Rx.Content>
      </Rx.Portal>
    </Rx.Root>
  );
}
