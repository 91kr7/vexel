import './controls.css';

export type PathInputValidationState = 'idle' | 'valid' | 'invalid';

export interface PathInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  validationState?: PathInputValidationState;
  refusalMessage?: string;
  browseHint?: string;
  disabled?: boolean;
}

/** Text field for an operator-typed host path, with validation feedback (REQ-115, REQ-116). */
export function PathInput({
  value,
  onChange,
  label,
  placeholder,
  validationState = 'idle',
  refusalMessage,
  browseHint,
  disabled = false,
}: PathInputProps) {
  const helperText = validationState === 'invalid' ? refusalMessage : browseHint;
  const helperClasses = validationState === 'invalid' ? 'ui-path-input__helper ui-path-input__helper--danger' : 'ui-path-input__helper';
  return (
    <div className="ui-path-input">
      {label ? <label className="ui-path-input__label">{label}</label> : null}
      <input
        type="text"
        className={`ui-path-input__field ui-path-input__field--${validationState}`}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {helperText ? <p className={helperClasses}>{helperText}</p> : null}
    </div>
  );
}
