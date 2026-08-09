import './controls.css';

export interface SecretFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

/**
 * Single-line input for a secret the operator types once: every character is
 * masked, and there is deliberately no reveal control — nothing typed here can
 * be read back on screen. Browser autofill and password managers are kept out
 * too, so the value never leaves the keystroke it was typed with.
 */
export function SecretField({ value, onChange, placeholder, ariaLabel, onSubmit, autoFocus = false }: SecretFieldProps) {
  return (
    <input
      type="password"
      className="ui-text-field"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit?.();
      }}
    />
  );
}
