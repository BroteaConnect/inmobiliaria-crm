import { useId } from 'react';

/**
 * On or off, with the reason why it is disabled stated instead of implied. A
 * toggle that cannot move and does not say so reads as a bug.
 */
export default function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
}: {
  /** Already translated. */
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Already translated: shown under the label, e.g. why it is unavailable. */
  hint?: string;
  disabled?: boolean;
}) {
  const hintId = useId();
  return (
    <label className={`ui-toggle${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ui-toggle-track" aria-hidden="true"><span className="ui-toggle-knob" /></span>
      <span className="ui-toggle-text">
        <span className="ui-toggle-label">{label}</span>
        {hint && <span className="ui-toggle-hint" id={hintId}>{hint}</span>}
      </span>
    </label>
  );
}
