import { Select as Rx } from 'radix-ui';
import { IconCheck, IconChevron } from './icons';
import './ui.css';

// A select that looks like the app on every platform and can be typed into,
// scrolled and read by a screen reader. The native <select> is still right for
// a plain form field that posts; this is for the controls that drive a screen.
//
// Radix refuses an item whose value is the empty string, because it reserves
// it for "nothing selected". Screens in this fleet use '' for "all" or "none"
// all the time, so the wrapper carries '' through a private sentinel: callers
// keep their values, and the rule stays Radix's problem. The sentinel never
// leaves this file: `onValueChange` unwraps it, and a `name` is posted through
// our own hidden input rather than Radix's, which would carry the wrapped value.
const EMPTY = ' ui-empty';
const wrap = (v: string) => (v === '' ? EMPTY : v);
const unwrap = (v: string) => (v === EMPTY ? '' : v);

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function Select({ value, onValueChange, options, placeholder, ariaLabel, name, disabled, className }: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Required unless a visible <label> points at the trigger through `id`. */
  ariaLabel?: string;
  /** Posts the (unwrapped) value with a <form>, through a hidden input. */
  name?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Rx.Root value={wrap(value)} onValueChange={(v) => onValueChange(unwrap(v))} disabled={disabled}>
      {name && <input type="hidden" name={name} value={value} />}
      <Rx.Trigger className={className ? `ui-select ${className}` : 'ui-select'} aria-label={ariaLabel}>
        <Rx.Value placeholder={placeholder} />
        <Rx.Icon className="ui-select-icon"><IconChevron /></Rx.Icon>
      </Rx.Trigger>
      <Rx.Portal>
        <Rx.Content className="ui-pop ui-select-content" position="popper" sideOffset={4}>
          <Rx.Viewport className="ui-select-viewport">
            {options.map((o) => (
              <Rx.Item key={o.value} value={wrap(o.value)} disabled={o.disabled} className="ui-option">
                <Rx.ItemText>{o.label}</Rx.ItemText>
                <Rx.ItemIndicator className="ui-option-check"><IconCheck /></Rx.ItemIndicator>
              </Rx.Item>
            ))}
          </Rx.Viewport>
        </Rx.Content>
      </Rx.Portal>
    </Rx.Root>
  );
}
