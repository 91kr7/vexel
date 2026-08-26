import type { ReactNode } from 'react';
import { contentColumnsClassName, type ContentClass } from '../layout/content-columns';
import './data-table.css';

export interface DefinitionItem {
  label: string;
  value: ReactNode;
}

/**
 * How label and value sit inside the band. `run` — the value follows its label
 * immediately, which is how a property band reads. `tracks` — the two occupy a
 * track each, so the values of every band of the list begin at one edge and the
 * labels read down as a column of their own.
 */
export type DefinitionAlignment = 'run' | 'tracks';

export interface DefinitionListProps {
  items: DefinitionItem[];
  /**
   * What the section holds, from which the minimum band width follows. The
   * count of columns is derived from the section's own width against that
   * minimum — the caller states no count, no template and no length.
   */
  contentClass?: ContentClass;
  /** Defaults to `run`, the property band's own reading. */
  alignment?: DefinitionAlignment;
}

/** Label → value bands. */
export function DefinitionList({ items, contentClass = 'short-scalar', alignment = 'run' }: DefinitionListProps) {
  const classes = ['ui-definition-list', alignment === 'tracks' ? 'ui-definition-list--tracks' : '', contentColumnsClassName('pair', contentClass)]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      {items.map((item, index) => (
        // The band is the grid item and holds both spans, in either alignment:
        // never `display: contents` or subgrid over the two, which reads
        // column-first to assistive technology and comes apart when a value
        // wraps. `tracks` splits the band's own box, not the list's.
        <div className="ui-definition-list__row" key={index}>
          <span className="ui-definition-list__label">{item.label}</span>
          <span className="ui-definition-list__value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
