import type { ReactNode } from 'react';

/**
 * One card anatomy for every list in the CRM: a title, an optional row of
 * signals next to it, some quiet meta, and the actions at the bottom. Today's
 * queue and the mobile lead list are the same object seen twice, so they are
 * the same component.
 */
export default function ListCard({
  title,
  signals,
  meta,
  note,
  actions,
  tone = 'default',
  children,
}: {
  /** Already translated, or a name — never a key. */
  title: ReactNode;
  /** Badges and dots that qualify the title: AlertBadge, PriorityDot… */
  signals?: ReactNode;
  /** The quiet second line: stage, property, how long since the last contact. */
  meta?: ReactNode;
  /** A quote from the lead, or the reason this card is in the queue. */
  note?: ReactNode;
  actions?: ReactNode;
  /** `alert` draws the left rule in --alert; nothing else may. */
  tone?: 'default' | 'alert';
  children?: ReactNode;
}) {
  return (
    <article className={`ui-card${tone === 'alert' ? ' is-alert' : ''}`}>
      <header className="ui-card-head">
        <span className="ui-card-title">{title}</span>
        {signals && <span className="ui-card-signals">{signals}</span>}
      </header>
      {meta && <p className="ui-card-meta">{meta}</p>}
      {note && <p className="ui-card-note">{note}</p>}
      {children}
      {actions && <div className="ui-card-actions">{actions}</div>}
    </article>
  );
}
