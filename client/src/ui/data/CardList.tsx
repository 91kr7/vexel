import type { ReactNode } from 'react';
import { Surface } from '../glass/Surface';
import './data-table.css';

export interface CardListRowContent {
  title: string;
  /** Rendered in monospace, muted. */
  subtitle?: string;
  /** Trailing badge group. */
  badges?: ReactNode;
  /** Trailing meta values (e.g. size, age). */
  meta?: ReactNode;
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
              <div className="ui-card-list__heading">
                <span className="ui-card-list__title">{row.title}</span>
                {row.subtitle ? <span className="ui-card-list__subtitle">{row.subtitle}</span> : null}
              </div>
              <div className="ui-card-list__trailing">
                {row.badges ? <div className="ui-card-list__badges">{row.badges}</div> : null}
                {row.meta ? <div className="ui-card-list__meta">{row.meta}</div> : null}
              </div>
            </div>
            {expanded && renderExpanded ? <div className="ui-card-list__expanded">{renderExpanded(item)}</div> : null}
          </Surface>
        );
      })}
    </div>
  );
}
