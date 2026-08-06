import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepeatableRowList } from '../../src/ui';

afterEach(cleanup);

interface Row {
  label: string;
}

function Harness({ items, onChange }: { items: Row[]; onChange: (items: Row[]) => void }) {
  return (
    <RepeatableRowList
      items={items}
      onChange={onChange}
      createItem={() => ({ label: 'new' })}
      renderRow={(row, index, update) => (
        <input aria-label={`Label ${index + 1}`} value={row.label} onChange={(event) => update({ label: event.target.value })} />
      )}
    />
  );
}

// Controlled harness: rows are re-rendered from the caller's state, like a
// real caller would, so a test that performs more than one edit in sequence
// (e.g. clear then type) sees each edit applied on top of the last.
function StatefulHarness({ initialItems, onNext }: { initialItems: Row[]; onNext: (items: Row[]) => void }) {
  const [items, setItems] = useState(initialItems);
  return (
    <Harness
      items={items}
      onChange={(next) => {
        setItems(next);
        onNext(next);
      }}
    />
  );
}

describe('RepeatableRowList (ui-library/specs/repeatable-row-list.md)', () => {
  // ui-library/specs/repeatable-row-list.md — "add" appends createItem()'s value
  it('appends createItem()\'s value when the add action is used', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness items={[{ label: 'a' }]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Add row' }));

    expect(onChange).toHaveBeenCalledWith([{ label: 'a' }, { label: 'new' }]);
  });

  // ui-library/specs/repeatable-row-list.md — each row has a remove action; default label "Remove row N"
  it('removes only the targeted row, keeping the others', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness items={[{ label: 'a' }, { label: 'b' }]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Remove row 1' }));

    expect(onChange).toHaveBeenCalledWith([{ label: 'b' }]);
  });

  // ui-library/specs/repeatable-row-list.md — update(patch) merges the patch into that row's item, reporting the full next array
  it('merges a row\'s update patch into that row only', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatefulHarness initialItems={[{ label: 'a' }, { label: 'b' }]} onNext={onChange} />);

    await user.clear(screen.getByRole('textbox', { name: 'Label 2' }));
    await user.type(screen.getByRole('textbox', { name: 'Label 2' }), 'z');

    expect(onChange).toHaveBeenLastCalledWith([{ label: 'a' }, { label: 'z' }]);
  });
});
