import type { ReactNode } from 'react';
import { Dialog as Rx } from 'radix-ui';
import { useI18n } from '../../lib/LocaleContext';
import { IconClose } from './icons';
import './ui.css';

// A centred modal: "stop and answer this". For looking at a record while the
// list stays on screen, the side panel is the right shape, not this.
//
// Radix gives the focus trap, Escape, the inert page behind and the top layer;
// this file gives it the app's anatomy — one title, an optional line under
// it, a body that scrolls and a footer that does not — and the app's tokens.

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'default' }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** One line under the title. Announced with the dialog when present. */
  description?: ReactNode;
  children: ReactNode;
  /** Actions. One primary, as everywhere. */
  footer?: ReactNode;
  size?: 'default' | 'wide';
}) {
  const { t } = useI18n();
  return (
    <Rx.Root open={open} onOpenChange={onOpenChange}>
      <Rx.Portal>
        <Rx.Overlay className="ui-overlay" />
        <Rx.Content
          className={size === 'wide' ? 'ui-dialog ui-dialog--wide' : 'ui-dialog'}
          // Without a description Radix would still point aria-describedby at
          // nothing; saying so explicitly is the documented way to drop it.
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <header className="ui-dialog-head">
            <div className="ui-dialog-titles">
              <Rx.Title className="ui-dialog-title">{title}</Rx.Title>
              {description && <Rx.Description className="ui-dialog-sub">{description}</Rx.Description>}
            </div>
            <Rx.Close className="ui-close" aria-label={t('ui.close')}><IconClose /></Rx.Close>
          </header>
          <div className="ui-dialog-body">{children}</div>
          {footer && <footer className="ui-dialog-foot">{footer}</footer>}
        </Rx.Content>
      </Rx.Portal>
    </Rx.Root>
  );
}
