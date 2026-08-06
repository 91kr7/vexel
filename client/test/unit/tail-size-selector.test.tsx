import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TailSizeSelector } from '../../src/ui';

afterEach(cleanup);

describe('TailSizeSelector (REQ-30)', () => {
  // tail-size-selector.md — the default sizes are listed as "last <n> lines", plus an "All" choice
  it('offers the default sizes and an "All" choice', () => {
    render(<TailSizeSelector value={500} onChange={vi.fn()} />);

    const control = screen.getByRole('combobox', { name: 'Tail size' });
    expect(Array.from(control.querySelectorAll('option')).map((option) => option.textContent)).toEqual([
      'last 100 lines',
      'last 500 lines',
      'last 1000 lines',
      'last 5000 lines',
      'All',
    ]);
  });

  // tail-size-selector.md — the offered sizes can be replaced by the caller; "All" is always offered in addition
  it('lists the caller\'s sizes, still adding "All"', () => {
    render(<TailSizeSelector value="all" onChange={vi.fn()} options={[10, 20]} />);

    expect(Array.from(screen.getByRole('combobox').querySelectorAll('option')).map((option) => option.textContent)).toEqual([
      'last 10 lines',
      'last 20 lines',
      'All',
    ]);
  });

  // tail-size-selector.md — picking a size reports the number, picking "All" reports 'all'
  it('reports the picked size as a number, and "All" as all', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<TailSizeSelector value="all" onChange={onChange} />);

    await user.selectOptions(screen.getByRole('combobox'), 'last 1000 lines');
    expect(onChange).toHaveBeenCalledWith(1000);

    rerender(<TailSizeSelector value={1000} onChange={onChange} />);
    await user.selectOptions(screen.getByRole('combobox'), 'All');
    expect(onChange).toHaveBeenLastCalledWith('all');
  });
});
