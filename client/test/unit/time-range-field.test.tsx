import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeRangeField } from '../../src/ui';

afterEach(cleanup);

describe('TimeRangeField (REQ-30)', () => {
  // time-range-field.md — two labelled inputs side by side, holding the current bounds
  it('shows a since and an until input holding the current bounds', () => {
    render(<TimeRangeField since="10m" until="" onChange={vi.fn()} placeholder="e.g. 10m" />);

    expect(screen.getByRole('textbox', { name: 'Since' })).toHaveValue('10m');
    expect(screen.getByRole('textbox', { name: 'Until' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Until' })).toHaveAttribute('placeholder', 'e.g. 10m');
  });

  // time-range-field.md — editing either input reports both bounds
  it('reports both bounds whichever input is edited', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<TimeRangeField since="" until="2h" onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Since' }), '5');
    expect(onChange).toHaveBeenLastCalledWith({ since: '5', until: '2h' });

    rerender(<TimeRangeField since="5m" until="" onChange={onChange} sinceLabel="From" untilLabel="To" />);
    await user.type(screen.getByRole('textbox', { name: 'To' }), '1');
    expect(onChange).toHaveBeenLastCalledWith({ since: '5m', until: '1' });
  });

  // time-range-field.md — an optional helper/validation message is shown below the inputs
  it('shows the helper message when given', () => {
    const { rerender } = render(<TimeRangeField since="" until="" onChange={vi.fn()} />);
    expect(screen.queryByText('ISO instant or 30s/5m/2h/1d')).not.toBeInTheDocument();

    rerender(<TimeRangeField since="" until="" onChange={vi.fn()} message="ISO instant or 30s/5m/2h/1d" />);
    expect(screen.getByText('ISO instant or 30s/5m/2h/1d')).toBeInTheDocument();
  });
});
