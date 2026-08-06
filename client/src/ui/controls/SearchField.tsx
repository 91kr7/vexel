import { TextField } from './TextField';
import './controls.css';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

/** Full-width search/filter text field for a list toolbar. */
export function SearchField({ value, onChange, placeholder = 'Search…', ariaLabel = 'Search' }: SearchFieldProps) {
  return (
    <div className="ui-search-field">
      <TextField value={value} onChange={onChange} placeholder={placeholder} ariaLabel={ariaLabel} />
    </div>
  );
}
