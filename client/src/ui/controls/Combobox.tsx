import { useId, useState } from 'react';
import { FieldMessage } from './FieldMessage';
import './controls.css';

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Suggestions; may arrive (or grow) after the first render while `loading` is true. */
  options: ComboboxOption[];
  loading?: boolean;
  loadingLabel?: string;
  /** Shown in place of the suggestion list when nothing matches what has been typed. */
  emptyLabel?: string;
  placeholder?: string;
  ariaLabel?: string;
  maxVisibleOptions?: number;
  error?: string;
  autoFocus?: boolean;
}

/**
 * Text input that suggests known options while still accepting any free text:
 * the typed value is always the value, a suggestion is only a shortcut. The
 * option list may be filled asynchronously; `loading` reports that.
 */
export function Combobox({
  value,
  onChange,
  options,
  loading = false,
  loadingLabel = 'Loading…',
  emptyLabel = 'No match — the typed value is used as is.',
  placeholder,
  ariaLabel,
  maxVisibleOptions = 8,
  error,
  autoFocus = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  const needle = value.trim().toLowerCase();
  const matching = options.filter((option) => needle === '' || option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle));
  const visible = matching.slice(0, maxVisibleOptions);

  function select(optionValue: string) {
    onChange(optionValue);
    setOpen(false);
  }

  return (
    <div className="ui-combobox">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={error ? 'ui-text-field ui-text-field--error' : 'ui-text-field'}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      {open ? (
        <div className="ui-combobox__list" id={listId} role="listbox">
          {loading && visible.length === 0 ? <p className="ui-combobox__note">{loadingLabel}</p> : null}
          {!loading && visible.length === 0 ? <p className="ui-combobox__note">{emptyLabel}</p> : null}
          {visible.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="ui-combobox__option"
              // Committing on mousedown, before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                select(option.value);
              }}
            >
              <span className="ui-combobox__option-label">{option.label}</span>
              {option.hint ? <span className="ui-combobox__option-hint">{option.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <FieldMessage tone="danger">{error}</FieldMessage> : null}
    </div>
  );
}
