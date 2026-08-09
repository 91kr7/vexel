import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardList, type CardListRowContent } from '../../src/ui';

afterEach(cleanup);

// ui-library/specs/card-list.md — the active-selection row variant: "for a set
// where exactly one row is in use: every such row gains a leading dot, green on
// the active row and muted on the others; the active row shows the activeLabel
// marker (default 'active') and the others an action labelled useLabel
// (default 'use') that calls onUse".
interface Item {
  name: string;
  active: boolean;
}

function renderList(items: Item[], onUse: (name: string) => void, labels: { activeLabel?: string; useLabel?: string } = {}) {
  const renderRow = (item: Item): CardListRowContent => ({
    title: item.name,
    selection: { active: item.active, onUse: () => onUse(item.name), ...labels },
  });
  render(<CardList items={items} itemKey={(item) => item.name} renderRow={renderRow} />);
}

function rowOf(name: string): HTMLElement {
  const title = screen.getByText(name);
  return title.closest('.ui-card-list__item') as HTMLElement;
}

describe('CardList selection variant (ui-library/specs/card-list.md)', () => {
  it('marks the active row and offers the others a "use" action', () => {
    renderList([{ name: 'alpha', active: true }, { name: 'beta', active: false }], vi.fn());

    expect(rowOf('alpha')).toHaveTextContent('active');
    expect(rowOf('beta')).toHaveTextContent('use');
  });

  // "The 'use' action of the selection variant never appears on the active row, and the 'active'
  // marker never appears on any other: the two are exclusive."
  it('never shows the "use" action on the active row nor the "active" marker on any other', () => {
    renderList([{ name: 'alpha', active: true }, { name: 'beta', active: false }], vi.fn());

    expect(rowOf('alpha')).not.toHaveTextContent('use');
    expect(rowOf('beta')).not.toHaveTextContent('active');
  });

  it('calls onUse for the row whose "use" action is activated', async () => {
    const onUse = vi.fn();
    renderList([{ name: 'alpha', active: true }, { name: 'beta', active: false }], onUse);

    await userEvent.click(screen.getByText('use'));

    expect(onUse).toHaveBeenCalledWith('beta');
  });

  // "every such row gains a leading dot, green on the active row and muted on the others"
  it('gives every row a leading dot, distinguishing the active one', () => {
    renderList([{ name: 'alpha', active: true }, { name: 'beta', active: false }], vi.fn());

    const activeDot = rowOf('alpha').querySelector('.ui-card-list__leading')!.firstElementChild;
    const otherDot = rowOf('beta').querySelector('.ui-card-list__leading')!.firstElementChild;
    expect(activeDot).not.toBeNull();
    expect(otherDot).not.toBeNull();
    expect(activeDot!.innerHTML).not.toEqual(otherDot!.innerHTML);
  });

  // "activeLabel?, useLabel?" — the defaults are overridable
  it('uses the callers own marker and action labels when given', () => {
    renderList([{ name: 'alpha', active: true }, { name: 'beta', active: false }], vi.fn(), {
      activeLabel: 'in use',
      useLabel: 'switch',
    });

    expect(rowOf('alpha')).toHaveTextContent('in use');
    expect(rowOf('beta')).toHaveTextContent('switch');
  });

  // "A row with no selection renders exactly as before — no leading dot, no marker."
  it('leaves a row without the selection variant free of any dot or marker', () => {
    render(
      <CardList
        items={[{ name: 'plain', active: false }]}
        itemKey={(item) => item.name}
        renderRow={(item) => ({ title: item.name })}
      />,
    );

    const row = rowOf('plain');
    expect(row).not.toHaveTextContent('use');
    expect(row.querySelector('.ui-card-list__leading')!.firstElementChild).toHaveClass('ui-card-list__heading');
  });
});
