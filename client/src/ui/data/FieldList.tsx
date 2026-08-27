import type { ReactNode } from 'react';
import { contentColumnsClassName, type ContentClass } from '../layout/content-columns';
import './field-list.css';

export interface FieldListField {
  /** Stated for every field of an entry, or for none of them. */
  caption?: string;
  value: ReactNode;
}

export interface FieldListEntry {
  fields: FieldListField[];
}

/**
 * How an entry shares its width among its own fields — a named shape, never a
 * length or a count. `even`: an equal share each. `content`: in proportion to
 * what each field holds. Neither ever gives a field more than half the entry.
 */
export type FieldListArrangement = 'even' | 'content';

export interface FieldListProps {
  items: FieldListEntry[];
  /** What the entries hold; the count per line follows from it, never from the caller. */
  contentClass?: ContentClass;
  /** Defaults to `even`. */
  arrangement?: FieldListArrangement;
}

/**
 * Entries read as the fields of a form: one entry per row where its content
 * class asks for one, its parts side by side, each in a field of its own.
 */
export function FieldList({ items, contentClass = 'short-scalar', arrangement = 'even' }: FieldListProps) {
  const classes = ['ui-field-list', `ui-field-list--${arrangement}`, contentColumnsClassName('value', contentClass)].join(' ');
  return (
    <div className={classes}>
      {items.map((entry, index) => (
        // The entry is the grid item and holds every field of it: fields placed in
        // tracks of the *list* read column-first to assistive technology.
        <div className="ui-field-list__entry" key={index}>
          {entry.fields.map((field, position) => (
            <div className="ui-field-list__field" key={position}>
              {field.caption ? <span className="ui-field-list__caption">{field.caption}</span> : null}
              <span className="ui-field-list__value">{field.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
