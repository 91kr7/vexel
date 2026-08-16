import type { ReactNode } from 'react';
import { IconButton } from './IconButton';
import { Button } from './Button';
import { Row } from '../layout/Row';
import './controls.css';

export interface RepeatableRowListProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  renderRow: (item: T, index: number, update: (patch: Partial<T>) => void) => ReactNode;
  createItem: () => T;
  addLabel?: string;
  removeLabel?: (item: T) => string;
}

/** Repeatable list of custom-rendered rows with add/remove (e.g. ports, mounts). */
export function RepeatableRowList<T>({ items, onChange, renderRow, createItem, addLabel = 'Add row', removeLabel }: RepeatableRowListProps<T>) {
  function update(index: number, patch: Partial<T>) {
    onChange(items.map((item, current) => (current === index ? { ...item, ...patch } : item)));
  }
  function remove(index: number) {
    onChange(items.filter((_, current) => current !== index));
  }
  function add() {
    onChange([...items, createItem()]);
  }

  return (
    <div className="ui-repeatable-row-list">
      {items.map((item, index) => (
        <Row key={index} gap="var(--space-2)" align="center">
          {renderRow(item, index, (patch) => update(index, patch))}
          <IconButton label={removeLabel ? removeLabel(item) : `Remove row ${index + 1}`} onClick={() => remove(index)}>
            ✕
          </IconButton>
        </Row>
      ))}
      {/* A control, not bare text — the same rule as the key/value editor's own
          add affordance: "Add port mapping" is a button and is drawn as one. */}
      <Button size="sm" onClick={add}>
        {addLabel}
      </Button>
    </div>
  );
}
