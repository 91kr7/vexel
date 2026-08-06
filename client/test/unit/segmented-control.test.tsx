import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from '../../src/ui';

afterEach(cleanup);

const options = [
  { id: 'stdout', label: 'stdout' },
  { id: 'stderr', label: 'stderr' },
  { id: 'both', label: 'both' },
];

describe('SegmentedControl (REQ-30)', () => {
  // segmented-control.md — clicking a segment in single-choice mode replaces the selection
  it('replaces the selection when a segment is clicked in single-choice mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl options={options} selectedIds={['stdout']} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'stderr' }));

    expect(onChange).toHaveBeenCalledWith(['stderr']);
  });

  // segmented-control.md — an unselected segment is added, in `options` order, in multiple mode
  it('adds an unselected segment in options order in multiple mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl options={options} selectedIds={['both']} onChange={onChange} multiple />);

    await user.click(screen.getByRole('button', { name: 'stdout' }));

    expect(onChange).toHaveBeenCalledWith(['stdout', 'both']);
  });

  // segmented-control.md — a selected segment is removed in multiple mode
  it('removes a selected segment in multiple mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl options={options} selectedIds={['stdout', 'stderr']} onChange={onChange} multiple />);

    await user.click(screen.getByRole('button', { name: 'stderr' }));

    expect(onChange).toHaveBeenCalledWith(['stdout']);
  });

  // segmented-control.md — the selection is never emptied: the last selected segment cannot be turned off
  it('leaves the selection untouched when the only selected segment is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<SegmentedControl options={options} selectedIds={['stdout']} onChange={onChange} multiple />);

    await user.click(screen.getByRole('button', { name: 'stdout' }));
    expect(onChange).not.toHaveBeenCalled();

    rerender(<SegmentedControl options={options} selectedIds={['stdout']} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'stdout' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  // segmented-control.md — selected segments are reported as pressed
  it('reports the selected segments as pressed', () => {
    render(<SegmentedControl options={options} selectedIds={['stdout', 'both']} onChange={vi.fn()} multiple ariaLabel="Streams" />);

    expect(screen.getByRole('button', { name: 'stdout' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'stderr' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Streams' })).toBeInTheDocument();
  });
});
