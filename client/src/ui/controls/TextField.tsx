import { forwardRef } from 'react';
import './controls.css';

export interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

/** Generic single-line text input (search boxes, inline rename, …). */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { value, onChange, placeholder, ariaLabel, onSubmit, autoFocus = false },
  ref,
) {
  return (
    <input
      ref={ref}
      type="text"
      className="ui-text-field"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit?.();
      }}
    />
  );
});
