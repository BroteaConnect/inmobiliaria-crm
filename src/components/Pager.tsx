import { useI18n } from '../lib/LocaleContext';
import type { Page } from '../lib/list.mjs';
import './Pager.css';

// The controls, so no screen writes "Página 2 de 4" by hand — and so the two
// required languages are one dictionary entry away instead of one refactor.
//
// It renders nothing when there is only one page: a pager under a list of three
// rows is furniture.

export function Pager({ page, onPage, className }: {
  page: Page<unknown>;
  onPage(n: number): void;
  className?: string;
}) {
  const { t } = useI18n();
  if (page.pages <= 1) return null;
  return (
    <nav className={className ? `pager ${className}` : 'pager'} aria-label={t('list.pager')}>
      <button type="button" onClick={() => onPage(page.page - 1)} disabled={!page.hasPrev}>
        {t('list.prev')}
      </button>
      {/* `role=status` so a screen reader is told the page changed: the button
          keeps the focus, and without this nothing announces the move. */}
      <span role="status" aria-live="polite">
        {t('list.page', { page: page.page, pages: page.pages })}
      </span>
      <button type="button" onClick={() => onPage(page.page + 1)} disabled={!page.hasNext}>
        {t('list.next')}
      </button>
      <small>{t('list.showing', { from: page.from, to: page.to, total: page.total })}</small>
    </nav>
  );
}

/** The three states a list is in before it is a list. */
export function ListStatus({ loading, error, empty, searching }: {
  loading?: boolean;
  error?: Error | null;
  empty?: boolean;
  /** Empty because a search matched nothing, which needs different words from
   *  a collection that has nothing in it yet. */
  searching?: boolean;
}) {
  const { t } = useI18n();
  if (loading) return <p className="list-status">{t('list.loading')}</p>;
  if (error) return <p className="list-status error" role="alert">{t('list.error', { error: error.message })}</p>;
  if (empty) return <p className="list-status">{t(searching ? 'list.noResults' : 'list.empty')}</p>;
  return null;
}
