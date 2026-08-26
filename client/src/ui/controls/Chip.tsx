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
  /** Makes the whole chip the click target, for a chip that is itself a starting point. */
  onSelect?: () => void;
  /** `accent` marks the salient chip among its neighbours. */
  tone?: ChipTone;
  /** Takes a line of its own and fills it, as a field rather than a pill. */
  block?: boolean;
  /** Which end of the label gives way; absent, the label is never truncated. */
  truncate?: 'start' | 'end';
}

/** A short label chip: optional muted prefix and meta reading, optional inline action, optionally clickable. */
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

/** A row of Chips with an optional trailing "add" affordance (the library's own button) and an empty label. */
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
