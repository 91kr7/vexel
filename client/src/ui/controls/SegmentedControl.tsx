import './controls.css';

export interface SegmentedOption {
  id: string;
  label: string;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  ariaLabel?: string;
}

/**
 * Compact row of joined segments selecting one — or, with `multiple`, several —
 * of a small fixed set of options. The selection is never emptied.
 */
export function SegmentedControl({ options, selectedIds, onChange, multiple = false, ariaLabel }: SegmentedControlProps) {
  function toggle(id: string) {
    const selected = selectedIds.includes(id);
    if (!multiple) {
      if (!selected) onChange([id]);
      return;
    }
    if (selected) {
      if (selectedIds.length === 1) return;
      onChange(selectedIds.filter((candidate) => candidate !== id));
      return;
    }
    onChange(options.filter((option) => option.id === id || selectedIds.includes(option.id)).map((option) => option.id));
  }

  return (
    <div className="ui-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = selectedIds.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            className={active ? 'ui-segmented__segment ui-segmented__segment--active' : 'ui-segmented__segment'}
            aria-pressed={active}
            onClick={() => toggle(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
