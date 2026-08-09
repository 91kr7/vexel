import type { ReactNode } from 'react';
import { Surface } from '../glass/Surface';
import { Badge } from '../controls/Badge';
import type { StatusTone } from '../controls/StatusPill';
import { StatusDotCell } from './TableCells';
import './data-table.css';

export interface CardListRowSelection {
  /** Whether this row is the one currently in use among the set. */
  active: boolean;
  /** Invoked when the operator asks for this row to become the active one; omitted on the active row itself. */
  onUse?: () => void;
  /** Label of the marker carried by the active row. */
  activeLabel?: string;
  /** Label of the action offered by the other rows. */
  useLabel?: string;
}

export interface CardListRowContent {
  title: string;
  /**
   * Leading state dot for a row whose condition matters on its own (e.g. a
   * registry being authenticated), outside any active-selection set.
   */
  status?: StatusTone;
  /** Rendered in monospace, muted; several lines stack one per string. */
  subtitle?: string | string[];
  /** Trailing badge group. */
  badges?: ReactNode;
  /** Trailing meta values (e.g. size, age). */
  meta?: ReactNode;
  /** Extra interactive content below the row, outside the selectable header (e.g. chips with their own actions). */
  content?: ReactNode;
  /**
   * Marks the row as belonging to a set where exactly one is active: a leading
   * dot, an "active" marker on that one and a "use" action on every other.
   */
  selection?: CardListRowSelection;
}

export interface CardListProps<T> {
  items: T[];
  itemKey: (item: T) => string;
  renderRow: (item: T) => CardListRowContent;
  selectedKey?: string;
  onSelect?: (item: T) => void;
  /** Content rendered inside the same card, directly below the row whose key matches. */
  expandedKey?: string;
  renderExpanded?: (item: T) => ReactNode;
  emptyState?: ReactNode;
}

/**
 * Full-width card rows — the shape shared by images, builders, contexts,
 * registries and plugins: a title, a monospace subtitle, a trailing badge
 * group and meta values, selectable, with an optional expanded content slot
 * rendered inside the same card directly below its header row.
 */
export function CardList<T>({ items, itemKey, renderRow, selectedKey, onSelect, expandedKey, renderExpanded, emptyState }: CardListProps<T>) {
  if (items.length === 0) return <div className="ui-card-list__empty">{emptyState}</div>;
  return (
    <div className="ui-card-list">
      {items.map((item) => {
        const key = itemKey(item);
        const row = renderRow(item);
        const selected = key === selectedKey;
        const expanded = key === expandedKey;
        return (
          <Surface key={key} elevation="flat" padding="none">
            <div
              className={selected ? 'ui-card-list__item ui-card-list__item--selected' : 'ui-card-list__item'}
              onClick={onSelect ? () => onSelect(item) : undefined}
              aria-selected={onSelect ? selected : undefined}
            >
              <div className="ui-card-list__leading">
                {row.selection ? <StatusDotCell tone={row.selection.active ? 'success' : 'neutral'} /> : row.status ? <StatusDotCell tone={row.status} /> : null}
                <div className="ui-card-list__heading">
                  <span className="ui-card-list__title">{row.title}</span>
                  {subtitleLines(row.subtitle).map((line, index) => (
                    <span key={index} className="ui-card-list__subtitle">
                      {line}
                    </span>
                  ))}
                </div>
              </div>
              <div className="ui-card-list__trailing">
                {row.selection || row.badges ? (
                  <div className="ui-card-list__badges">
                    {row.selection ? selectionControl(row.selection) : null}
                    {row.badges}
                  </div>
                ) : null}
                {row.meta ? <div className="ui-card-list__meta">{row.meta}</div> : null}
              </div>
            </div>
            {row.content ? <div className="ui-card-list__content">{row.content}</div> : null}
            {expanded && renderExpanded ? <div className="ui-card-list__expanded">{renderExpanded(item)}</div> : null}
          </Surface>
        );
      })}
    </div>
  );
}

function selectionControl(selection: CardListRowSelection): ReactNode {
  if (selection.active) return <Badge tone="success">{selection.activeLabel ?? 'active'}</Badge>;
  return <Badge onClick={selection.onUse}>{selection.useLabel ?? 'use'}</Badge>;
}

function subtitleLines(subtitle: string | string[] | undefined): string[] {
  if (!subtitle) return [];
  return Array.isArray(subtitle) ? subtitle : [subtitle];
}
