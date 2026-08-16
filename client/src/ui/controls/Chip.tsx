import { Button } from './Button';
import './controls.css';

export interface ChipProps {
  label: string;
  /** Secondary reading shown after the label, muted (e.g. the size a tag weighs). */
  meta?: string;
  /** Label of the inline secondary action (e.g. "detach"); omitted when the chip carries no action. */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Makes the whole chip the click target — for a chip that is itself a
   * starting point (e.g. a suggestion put into an input), rather than a label
   * carrying a secondary action.
   */
  onSelect?: () => void;
}

/** A short label chip with an optional muted meta reading, an optional inline secondary action, and optionally clickable as a whole. */
export function Chip({ label, meta, actionLabel, onAction, onSelect }: ChipProps) {
  const content = (
    <>
      <span className="ui-chip__label">{label}</span>
      {meta ? <span className="ui-chip__meta">{meta}</span> : null}
    </>
  );

  if (onSelect) {
    return (
      <button type="button" className="ui-chip ui-chip--clickable" onClick={onSelect}>
        {content}
      </button>
    );
  }

  return (
    <span className="ui-chip">
      {content}
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
  onSelect?: () => void;
}

export interface ChipGroupProps {
  items: ChipGroupItem[];
  /** Label of the trailing "add" affordance (e.g. "+ Attach"); omitted when the group has no add action. */
  addLabel?: string;
  onAdd?: () => void;
  emptyLabel?: string;
}

/**
 * A row of Chips with an optional trailing "add" affordance and an empty-state
 * label. The add affordance is the library's own button — the dashed outline it
 * used to carry read as a placeholder waiting to be filled rather than as
 * something to press.
 */
export function ChipGroup({ items, addLabel, onAdd, emptyLabel }: ChipGroupProps) {
  return (
    <span className="ui-chip-group">
      {items.length === 0 && emptyLabel ? <span className="ui-chip-group__empty">{emptyLabel}</span> : null}
      {items.map((item) => (
        <Chip
          key={item.key}
          label={item.label}
          meta={item.meta}
          actionLabel={item.actionLabel}
          onAction={item.onAction}
          onSelect={item.onSelect}
        />
      ))}
      {onAdd && addLabel ? (
        <Button size="sm" onClick={onAdd}>
          {addLabel}
        </Button>
      ) : null}
    </span>
  );
}
