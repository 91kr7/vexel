import './data-table.css';

export interface PrivilegeItem {
  /** What is being asked for, e.g. "network", "mount". */
  name: string;
  /** One line saying what granting it allows; omitted when the source states none. */
  description?: string;
  /** The exact value(s) the privilege is asked for; an empty list reads as "—". */
  values: string[];
}

export interface PrivilegeListProps {
  items: PrivilegeItem[];
  /** Shown instead of the rows when nothing is being asked for. */
  emptyLabel?: string;
}

/**
 * The permissions an operation asks for, laid out one per row so each can be
 * read before it is granted. Presentation only: it neither grants nor refuses,
 * it is the review surface the granting decision is taken on.
 */
export function PrivilegeList({ items, emptyLabel = 'Nothing is being asked for.' }: PrivilegeListProps) {
  if (items.length === 0) return <p className="ui-privilege-list__empty">{emptyLabel}</p>;
  return (
    <ul className="ui-privilege-list">
      {items.map((item, index) => (
        <li className="ui-privilege-list__row" key={`${item.name}-${index}`}>
          <span className="ui-privilege-list__name">{item.name}</span>
          <span className="ui-privilege-list__value">{valueLabel(item.values)}</span>
          {item.description ? <span className="ui-privilege-list__description">{item.description}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** A privilege asked for with no value at all — or with nothing but blanks — still has to read as something. */
function valueLabel(values: string[]): string {
  const label = values.filter((value) => value !== '').join(', ');
  return label === '' ? '—' : label;
}
