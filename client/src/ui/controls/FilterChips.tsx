import './controls.css';

export interface FilterChipOption {
  id: string;
  label: string;
}

export interface FilterChipsProps {
  options: FilterChipOption[];
  activeId: string;
  onSelect: (id: string) => void;
}

/** Single-select row of filter chips (e.g. state: all / running / stopped / paused). */
export function FilterChips({ options, activeId, onSelect }: FilterChipsProps) {
  return (
    <div className="ui-filter-chips">
      {options.map((option) => {
        const active = option.id === activeId;
        return (
          <button
            key={option.id}
            type="button"
            className={active ? 'ui-filter-chip ui-filter-chip--active' : 'ui-filter-chip'}
            aria-pressed={active}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
