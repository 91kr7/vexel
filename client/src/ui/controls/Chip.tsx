import './controls.css';

export interface ChipProps {
  label: string;
  /** Label of the inline secondary action (e.g. "detach"); omitted when the chip carries no action. */
  actionLabel?: string;
  onAction?: () => void;
}

/** A short label chip with an optional inline secondary action next to it. */
export function Chip({ label, actionLabel, onAction }: ChipProps) {
  return (
    <span className="ui-chip">
      <span className="ui-chip__label">{label}</span>
      {onAction && actionLabel ? (
        <button type="button" className="ui-chip__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </span>
  );
}

export interface ChipGroupItem {
  key: string;
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ChipGroupProps {
  items: ChipGroupItem[];
  /** Label of the trailing "add" affordance (e.g. "+ Attach"); omitted when the group has no add action. */
  addLabel?: string;
  onAdd?: () => void;
  emptyLabel?: string;
}

/** A row of Chips with an optional trailing "add" affordance and an empty-state label. */
export function ChipGroup({ items, addLabel, onAdd, emptyLabel }: ChipGroupProps) {
  return (
    <span className="ui-chip-group">
      {items.length === 0 && emptyLabel ? <span className="ui-chip-group__empty">{emptyLabel}</span> : null}
      {items.map((item) => (
        <Chip key={item.key} label={item.label} actionLabel={item.actionLabel} onAction={item.onAction} />
      ))}
      {onAdd && addLabel ? (
        <button type="button" className="ui-chip-group__add" onClick={onAdd}>
          {addLabel}
        </button>
      ) : null}
    </span>
  );
}
