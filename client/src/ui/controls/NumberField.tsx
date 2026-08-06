import { FieldMessage } from './FieldMessage';
import './controls.css';

export interface NumberFieldProps {
  value?: number;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  ariaLabel?: string;
  error?: string;
}

/** Single-line numeric input; empty input reports `undefined`. */
export function NumberField({ value, onChange, min, max, step, placeholder, ariaLabel, error }: NumberFieldProps) {
  return (
    <div className="ui-field">
      <input
        type="number"
        className={error ? 'ui-text-field ui-text-field--error' : 'ui-text-field'}
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
      />
      {error ? <FieldMessage>{error}</FieldMessage> : null}
    </div>
  );
}
