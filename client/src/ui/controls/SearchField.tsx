import { forwardRef, useImperativeHandle, useRef } from 'react';
import { TextField } from './TextField';
import './controls.css';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * What a caller may do to the field from outside, and all it may do: put the
 * cursor in it. An empty state whose way out is "type a term" needs a control
 * that reaches the field, and the alternative — handing the caller the input
 * itself — would put a DOM element in feature code for the sake of one call.
 */
export interface SearchFieldHandle {
  focus(): void;
}

/** Full-width search/filter text field for a list toolbar. */
export const SearchField = forwardRef<SearchFieldHandle, SearchFieldProps>(function SearchField(
  { value, onChange, placeholder = 'Search…', ariaLabel = 'Search' },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  return (
    <div className="ui-search-field">
      <TextField ref={inputRef} value={value} onChange={onChange} placeholder={placeholder} ariaLabel={ariaLabel} />
    </div>
  );
});
