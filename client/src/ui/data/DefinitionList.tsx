import type { ReactNode } from 'react';
import { CopyButton } from '../controls/CopyButton';
import { contentColumnsClassName, type ContentClass } from '../layout/content-columns';
import './data-table.css';

export interface DefinitionItem {
  label: string;
  value: ReactNode;
  /** When set, renders a copy affordance next to the value using this exact text. */
  copyValue?: string;
}

export interface DefinitionListProps {
  items: DefinitionItem[];
  /**
   * What the section holds, from which the minimum band width follows. The
   * count of columns is derived from the section's own width against that
   * minimum — the caller states no count, no template and no length.
   */
  contentClass?: ContentClass;
  /**
   * @deprecated A caller-stated count, kept only until the surfaces that pass
   * one are moved onto the derived arrangement. Do not add a new call site.
   */
  columns?: 1 | 2;
}

/** Label → value bands, each with an optional copy affordance. */
export function DefinitionList({ items, contentClass = 'short-scalar', columns = 1 }: DefinitionListProps) {
  const arrangement = `ui-definition-list ${contentColumnsClassName('pair', contentClass)}`;
  return (
    <div className={columns === 2 ? 'ui-definition-list ui-definition-list--columns-2' : arrangement}>
      {items.map((item, index) => (
        // The band is the grid item, label and value inside it. They are never
        // placed in tracks of their own: a `display: contents` or subgrid
        // arrangement over the two spans reads column-first to assistive
        // technology and comes apart the moment one value wraps.
        <div className="ui-definition-list__row" key={index}>
          <span className="ui-definition-list__label">{item.label}</span>
          <span className="ui-definition-list__value">
            {item.value}
            {item.copyValue ? <CopyButton value={item.copyValue} /> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
