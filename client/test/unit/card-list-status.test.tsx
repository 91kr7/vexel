import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CardList, type CardListRowContent } from '../../src/ui';

afterEach(cleanup);

// ui-library/specs/card-list.md — "status?: StatusTone — a leading state dot of
// that tone, for a row whose condition matters on its own (e.g. a registry
// being authenticated) outside any active-selection set" (REQ-85).
interface Item {
  name: string;
  row: CardListRowContent;
}

function renderList(items: Item[]) {
  render(<CardList items={items} itemKey={(item) => item.name} renderRow={(item) => item.row} />);
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('.ui-card-list__item') as HTMLElement;
}

function leadingOf(name: string): Element | null {
  return rowOf(name).querySelector('.ui-card-list__leading')!.firstElementChild;
}

describe('CardList leading status dot (ui-library/specs/card-list.md)', () => {
  it('gives a row with a status its own leading dot', () => {
    renderList([{ name: 'ghcr.io', row: { title: 'ghcr.io', status: 'success' } }]);

    const dot = leadingOf('ghcr.io');
    expect(dot).not.toBeNull();
    expect(dot).not.toHaveClass('ui-card-list__heading');
  });

  it('distinguishes the tones two rows carry', () => {
    renderList([
      { name: 'ghcr.io', row: { title: 'ghcr.io', status: 'success' } },
      { name: 'docker.io', row: { title: 'docker.io', status: 'neutral' } },
    ]);

    expect(leadingOf('ghcr.io')!.innerHTML).not.toEqual(leadingOf('docker.io')!.innerHTML);
  });

  // "A row with neither selection nor status has no leading dot and no marker."
  it('leaves a row with neither status nor selection free of any dot', () => {
    renderList([{ name: 'plain', row: { title: 'plain' } }]);

    expect(leadingOf('plain')).toHaveClass('ui-card-list__heading');
  });

  // "selection wins over status when both are given: a row that belongs to an active-selection set
  // shows that set's dot, so one row never carries two different state dots."
  it('shows the selection set\'s dot, and only that one, when a row carries both', () => {
    renderList([
      { name: 'both', row: { title: 'both', status: 'danger', selection: { active: true } } },
      { name: 'selection-only', row: { title: 'selection-only', status: undefined, selection: { active: true } } },
    ]);

    // One dot, and it is the selection set's — not the row's own `status` tone.
    expect(leadingOf('both')!.innerHTML).toEqual(leadingOf('selection-only')!.innerHTML);
    expect(rowOf('both').querySelectorAll('.ui-card-list__leading > *')).toHaveLength(
      rowOf('selection-only').querySelectorAll('.ui-card-list__leading > *').length,
    );
    // The selection set's own marker is what the row shows.
    expect(rowOf('both')).toHaveTextContent('active');
  });

  // "Only the header row is clickable for onSelect; content ... is outside that clickable area"
  it('renders the row content outside the area that toggles selection', async () => {
    const onSelect = vi.fn();
    const onChipAction = vi.fn();
    render(
      <CardList
        items={[{ name: 'repo', row: { title: 'repo' } }]}
        itemKey={(item) => item.name}
        renderRow={() => ({
          title: 'repo',
          status: 'neutral',
          content: <button onClick={onChipAction}>pull</button>,
        })}
        onSelect={onSelect}
      />,
    );

    screen.getByRole('button', { name: 'pull' }).click();

    expect(onChipAction).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
