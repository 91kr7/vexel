import './controls.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
}

/** Single-choice dropdown. */
export function Select({ value, onChange, options, ariaLabel }: SelectProps) {
  return (
    <select className="ui-select" value={value} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
