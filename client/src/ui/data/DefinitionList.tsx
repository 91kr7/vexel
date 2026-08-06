import type { ReactNode } from 'react';
import { CopyButton } from '../controls/CopyButton';
import './data-table.css';

export interface DefinitionItem {
  label: string;
  value: ReactNode;
  /** When set, renders a copy affordance next to the value using this exact text. */
  copyValue?: string;
}

export interface DefinitionListProps {
  items: DefinitionItem[];
  columns?: 1 | 2;
}

/** Label → value rows, each with an optional copy affordance. */
export function DefinitionList({ items, columns = 1 }: DefinitionListProps) {
  return (
    <div className={columns === 2 ? 'ui-definition-list ui-definition-list--columns-2' : 'ui-definition-list'}>
      {items.map((item, index) => (
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
