/**
 * One priority dot. Three states plus "not set", coloured by an intensity ramp
 * of the brand violet (`--signal-*`) so it can never be mistaken for the single
 * red alert.
 *
 * The level type is declared here rather than imported from `src/crm/priority`
 * on purpose: this kit knows nothing about leads, PocketBase or the 1-5 score
 * behind them. `PriorityLevel` is structurally identical, so the mapping module
 * still feeds this component directly.
 */
export type SignalLevel = 'high' | 'medium' | 'low' | 'none';

export default function PriorityDot({
  level,
  label,
  selected = false,
  onSelect,
}: {
  level: SignalLevel;
  /** Already translated: this component never calls t(). */
  label: string;
  selected?: boolean;
  /** Omit to render a read-only dot instead of a control. */
  onSelect?: () => void;
}) {
  const className = `ui-dot ui-dot-${level}${selected ? ' is-selected' : ''}`;
  if (!onSelect) return <span className={className} role="img" aria-label={label} title={label} />;
  return (
    <button
      type="button"
      className={className}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
    />
  );
}
