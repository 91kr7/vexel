import type { ReactNode } from 'react';
import { contentColumnsClassName, type ContentClass } from '../layout/content-columns';
import './data-table.css';

export interface DefinitionItem {
  label: string;
  value: ReactNode;
}

export interface DefinitionListProps {
  items: DefinitionItem[];
  /**
   * What the section holds, from which the minimum band width follows. The
   * count of columns is derived from the section's own width against that
   * minimum — the caller states no count, no template and no length.
   */
  contentClass?: ContentClass;
}

/** Label → value bands. */
export function DefinitionList({ items, contentClass = 'short-scalar' }: DefinitionListProps) {
  return (
    <div className={`ui-definition-list ${contentColumnsClassName('pair', contentClass)}`}>
      {items.map((item, index) => (
        // The band is the grid item, label and value inside it. They are never
        // placed in tracks of their own: a `display: contents` or subgrid
        // arrangement over the two spans reads column-first to assistive
        // technology and comes apart the moment one value wraps.
        <div className="ui-definition-list__row" key={index}>
          <span className="ui-definition-list__label">{item.label}</span>
          <span className="ui-definition-list__value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
