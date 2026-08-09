import './controls.css';

export interface CheckboxOption {
  id: string;
  label: string;
  description?: string;
  /** Trailing note shown right-aligned, e.g. the size the option accounts for. */
  note?: string;
  disabled?: boolean;
}

export interface CheckboxGroupProps {
  options: CheckboxOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  ariaLabel?: string;
}

/**
 * Multi-select list of labelled options, each with an optional description and
 * trailing note. Unlike SegmentedControl the selection may be emptied: it is
 * the shape a scope selection needs, where "nothing" is a legitimate answer the
 * caller then refuses to act on.
 */
export function CheckboxGroup({ options, selectedIds, onChange, ariaLabel }: CheckboxGroupProps) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((candidate) => candidate !== id));
      return;
    }
    onChange(options.filter((option) => option.id === id || selectedIds.includes(option.id)).map((option) => option.id));
  }

  return (
    <div className="ui-checkbox-group" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <label key={option.id} className="ui-checkbox-group__option">
          <input
            type="checkbox"
            className="ui-checkbox-group__input"
            checked={selectedIds.includes(option.id)}
            disabled={option.disabled}
            aria-label={option.label}
            onChange={() => toggle(option.id)}
          />
          <span className="ui-checkbox-group__text">
            <span className="ui-checkbox-group__label">{option.label}</span>
            {option.description ? <span className="ui-checkbox-group__description">{option.description}</span> : null}
          </span>
          {option.note ? <span className="ui-checkbox-group__note">{option.note}</span> : null}
        </label>
      ))}
    </div>
  );
}
