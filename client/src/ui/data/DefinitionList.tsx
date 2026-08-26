import type { ReactNode } from 'react';
import { contentColumnsClassName, type ContentClass } from '../layout/content-columns';
import './data-table.css';

export interface DefinitionItem {
  label: string;
  value: ReactNode;
}

/**
 * A named arrangement of the band's own two parts — the caller asks for the
 * shape, never for a template, a count or a length. `run`: the value follows its
 * label immediately, which is how a property band reads. `key-columns`: label
 * and value take a share each of every band, so the values all begin at one edge
 * and the labels read down as a column of their own.
 */
export type DefinitionArrangement = 'run' | 'key-columns';

export interface DefinitionListProps {
  items: DefinitionItem[];
  /**
   * What the section holds, from which the minimum band width follows. The
   * count of columns is derived from the section's own width against that
   * minimum — the caller states no count, no template and no length.
   */
  contentClass?: ContentClass;
  /** Defaults to `run`, the property band's own reading. */
  arrangement?: DefinitionArrangement;
}

/** Label → value bands. */
export function DefinitionList({ items, contentClass = 'short-scalar', arrangement = 'run' }: DefinitionListProps) {
  const classes = ['ui-definition-list', arrangement === 'key-columns' ? 'ui-definition-list--key-columns' : '', contentColumnsClassName('pair', contentClass)]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      {items.map((item, index) => (
        // The band is the grid item and holds both spans, in either
        // arrangement: never `display: contents` or subgrid over the two, which
        // reads column-first to assistive technology and comes apart when a
        // value wraps. `key-columns` shares out the band's own box, not the
        // list's, and states no track template of any kind.
        <div className="ui-definition-list__row" key={index}>
          <span className="ui-definition-list__label">{item.label}</span>
          <span className="ui-definition-list__value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
