/**
 * A chip is a filter you can see the state of. One anatomy, used for the lead
 * board's filter row and for picking an integration's adapter.
 */
export default function Chip({
  label,
  selected = false,
  disabled = false,
  count,
  onSelect,
  title,
}: {
  /** Already translated. */
  label: string;
  selected?: boolean;
  disabled?: boolean;
  count?: number;
  onSelect?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`ui-chip${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      disabled={disabled || !onSelect}
      title={title}
      onClick={onSelect}
    >
      {label}
      {count != null && <span className="ui-chip-count">{count}</span>}
    </button>
  );
}
