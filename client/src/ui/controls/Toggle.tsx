import './controls.css';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  ariaLabel?: string;
}

/** Boolean on/off switch. */
export function Toggle({ checked, onChange, label, ariaLabel }: ToggleProps) {
  return (
    <label className="ui-toggle">
      <input type="checkbox" checked={checked} aria-label={ariaLabel ?? label} onChange={(event) => onChange(event.target.checked)} />
      <span className="ui-toggle__track">
        <span className="ui-toggle__thumb" />
      </span>
      {label ? <span className="ui-toggle__label">{label}</span> : null}
    </label>
  );
}
