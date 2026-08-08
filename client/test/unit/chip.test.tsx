import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip, ChipGroup, type ChipGroupItem } from '../../src/ui';

afterEach(cleanup);

describe('Chip (ui-library/specs/chip.md)', () => {
  // chip.md — actionLabel and onAction must both be given for the action to show
  it('renders a plain, action-less chip when the action is not given', () => {
    render(<Chip label="app-1" />);

    expect(screen.getByText('app-1')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a plain chip when only actionLabel is given, without onAction', () => {
    render(<Chip label="app-1" actionLabel="detach" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // chip.md — a chip's inline action calls that chip's onAction
  it('calls onAction when the inline action is used', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Chip label="app-1" actionLabel="detach" onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: 'detach' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('ChipGroup (ui-library/specs/chip.md)', () => {
  function items(): ChipGroupItem[] {
    return [
      { key: 'app-1', label: 'app-1', actionLabel: 'detach', onAction: vi.fn() },
      { key: 'app-2', label: 'app-2', actionLabel: 'detach', onAction: vi.fn() },
    ];
  }

  // chip.md — one chip per item, its own inline action next to its label when given
  it('shows one chip per item, each with its own inline action', () => {
    render(<ChipGroup items={items()} />);

    expect(screen.getByText('app-1')).toBeInTheDocument();
    expect(screen.getByText('app-2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'detach' })).toHaveLength(2);
  });

  // chip.md — a chip's inline action calls that specific chip's onAction, not another's
  it('calls only the clicked chip\'s own onAction', async () => {
    const user = userEvent.setup();
    const [first, second] = items();

    render(<ChipGroup items={[first!, second!]} />);
    await user.click(screen.getAllByRole('button', { name: 'detach' })[0]!);

    expect(first!.onAction).toHaveBeenCalledTimes(1);
    expect(second!.onAction).not.toHaveBeenCalled();
  });

  // chip.md — addLabel and onAdd must both be given for the trailing add affordance to show
  it('shows no add affordance when addLabel/onAdd are not both given', () => {
    render(<ChipGroup items={[]} addLabel="+ Attach" />);

    expect(screen.queryByRole('button', { name: '+ Attach' })).not.toBeInTheDocument();
  });

  // chip.md — the trailing add affordance calls onAdd
  it('shows the trailing add affordance and calls onAdd when used', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ChipGroup items={[]} addLabel="+ Attach" onAdd={onAdd} emptyLabel="No attached containers" />);

    await user.click(screen.getByRole('button', { name: '+ Attach' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  // chip.md — emptyLabel is shown in place of any chip when items is empty
  it('shows the empty-state label in place of any chip when there are no items', () => {
    render(<ChipGroup items={[]} emptyLabel="No attached containers" />);

    expect(screen.getByText('No attached containers')).toBeInTheDocument();
  });

  it('shows no empty-state label once at least one item is present', () => {
    render(<ChipGroup items={items()} emptyLabel="No attached containers" />);

    expect(screen.queryByText('No attached containers')).not.toBeInTheDocument();
  });
});
