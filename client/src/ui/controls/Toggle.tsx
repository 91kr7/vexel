import { Spinner } from '../feedback/Spinner';
import './controls.css';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /**
   * The switch is waiting on the change it just requested: it keeps showing
   * the value that is still true, refuses further input and says the work is
   * in flight, so a slow round trip is never mistaken for a lost click.
   */
  busy?: boolean;
}

/** Boolean on/off switch, with a busy state for a change that has to travel. */
export function Toggle({ checked, onChange, label, ariaLabel, disabled = false, busy = false }: ToggleProps) {
  const locked = disabled || busy;
  const classes = ['ui-toggle', busy ? 'ui-toggle--busy' : '', disabled && !busy ? 'ui-toggle--disabled' : ''].filter(Boolean).join(' ');
  return (
    <label className={classes}>
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel ?? label}
        aria-busy={busy || undefined}
        disabled={locked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="ui-toggle__track">
        <span className="ui-toggle__thumb" />
      </span>
      {label ? <span className="ui-toggle__label">{label}</span> : null}
      {busy ? <Spinner label={`${ariaLabel ?? label ?? 'Switch'} is changing`} /> : null}
    </label>
  );
}
