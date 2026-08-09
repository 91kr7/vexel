import './controls.css';

export interface ChipProps {
  label: string;
  /** Secondary reading shown after the label, muted (e.g. the size a tag weighs). */
  meta?: string;
  /** Label of the inline secondary action (e.g. "detach"); omitted when the chip carries no action. */
  actionLabel?: string;
  onAction?: () => void;
}

/** A short label chip with an optional muted meta reading and an optional inline secondary action. */
export function Chip({ label, meta, actionLabel, onAction }: ChipProps) {
  return (
    <span className="ui-chip">
      <span className="ui-chip__label">{label}</span>
      {meta ? <span className="ui-chip__meta">{meta}</span> : null}
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
  meta?: string;
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
        <Chip key={item.key} label={item.label} meta={item.meta} actionLabel={item.actionLabel} onAction={item.onAction} />
      ))}
      {onAdd && addLabel ? (
        <button type="button" className="ui-chip-group__add" onClick={onAdd}>
          {addLabel}
        </button>
      ) : null}
    </span>
  );
}
