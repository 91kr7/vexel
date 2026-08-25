import { Button } from './Button';
import '../truncation.css';
import './controls.css';

export type ChipTone = 'neutral' | 'accent';

export interface ChipProps {
  label: string;
  /** Muted qualifier shown *before* the label, naming what the label is (e.g. `image`). */
  prefix?: string;
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
  /** `accent` marks the salient chip among its neighbours; what makes it salient is the caller's. */
  tone?: ChipTone;
  /**
   * Takes a line of its own and fills it, as a field rather than a pill — for a
   * value long enough that nothing may share its line without being pushed out
   * of place.
   */
  block?: boolean;
  /**
   * Which end of the label gives way when it does not fit. `'start'` keeps the
   * tail, for a value whose tail identifies it (an image's `name:tag` against
   * its registry host); `'end'` is the ordinary ellipsis. Absent, the label is
   * never truncated and the chip takes the width its value needs.
   */
  truncate?: 'start' | 'end';
}

/** A short label chip with an optional muted prefix and meta reading, an optional inline secondary action, and optionally clickable as a whole. */
export function Chip({ label, prefix, meta, actionLabel, onAction, onSelect, tone = 'neutral', block = false, truncate }: ChipProps) {
  const classes = [
    'ui-chip',
    tone === 'accent' ? 'ui-chip--accent' : '',
    block ? 'ui-chip--block' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const labelClass = [
    'ui-chip__label',
    truncate ? 'ui-truncating-line' : '',
    truncate === 'start' ? 'ui-truncating-line--start' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {prefix ? <span className="ui-chip__prefix">{prefix}</span> : null}
      <span className={labelClass} title={truncate ? label : undefined}>
        {label}
      </span>
      {meta ? <span className="ui-chip__meta">{meta}</span> : null}
    </>
  );

  if (onSelect) {
    return (
      <button type="button" className={`${classes} ui-chip--clickable`} onClick={onSelect}>
        {content}
      </button>
    );
  }

  return (
    <span className={classes}>
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
  prefix?: string;
  meta?: string;
  tone?: ChipTone;
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
          prefix={item.prefix}
          tone={item.tone}
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
