/**
 * The single strong signal of the CRM. Red is spent here and nowhere else — the
 * moment a second thing is red, neither of them means anything.
 *
 * It carries a word, not a glyph: the `⚠` it replaces read as nothing at all to
 * a screen reader and as "some kind of warning" to everyone else.
 */
export default function AlertBadge({ label, title }: { label: string; title?: string }) {
  return (
    <span className="ui-alert" title={title}>
      {label}
    </span>
  );
}
