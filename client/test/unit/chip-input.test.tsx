import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChipInput } from '../../src/ui';

afterEach(cleanup);

function renderChipInput(values: string[], onChange = vi.fn()) {
  render(<ChipInput values={values} onChange={onChange} ariaLabel="Network name" addLabel="Add" />);
  return { onChange };
}

function entryField() {
  return screen.getByRole('textbox', { name: 'Network name' });
}

describe('ChipInput (ui-library/specs/chip-input.md)', () => {
  // chip-input.md — one chip per value, each with its own remove action
  it('shows one removable chip per value', () => {
    renderChipInput(['front', 'back']);

    expect(screen.getByText('front')).toBeInTheDocument();
    expect(screen.getByText('back')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove front' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove back' })).toBeInTheDocument();
  });

  // chip-input.md — Enter in the entry field appends the trimmed draft and empties the field
  it('appends the trimmed draft on Enter and clears the entry field', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChipInput(['front']);

    await user.type(entryField(), '  back  {Enter}');

    expect(onChange).toHaveBeenCalledWith(['front', 'back']);
    expect(entryField()).toHaveValue('');
  });

  // chip-input.md — the add action appends the draft too
  it('appends the draft when the add action is used', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChipInput([]);

    await user.type(entryField(), 'ops');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith(['ops']);
  });

  // chip-input.md — the add action is disabled while the draft is blank
  it('disables the add action while the draft is blank', async () => {
    const user = userEvent.setup();
    renderChipInput([]);

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    await user.type(entryField(), 'ops');

    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  // chip-input.md — an already-present value is never appended; the draft is cleared either way
  it('never appends a value already in the list, but clears the draft', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChipInput(['front']);

    await user.type(entryField(), 'front{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(entryField()).toHaveValue('');
  });

  // chip-input.md — a blank value is never appended
  it('never appends a blank value', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChipInput(['front']);

    await user.type(entryField(), '   {Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  // chip-input.md — a chip's remove action drops just that value
  it('drops only the removed value', async () => {
    const user = userEvent.setup();
    const { onChange } = renderChipInput(['front', 'back']);

    await user.click(screen.getByRole('button', { name: 'Remove front' }));

    expect(onChange).toHaveBeenCalledWith(['back']);
  });

  // chip-input.md — the chip area disappears when the list is empty
  it('shows no chip at all when the list is empty', () => {
    renderChipInput([]);

    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
  });

  // chip-input.md — the validation message is shown below the entry field
  it('shows the validation message when one is given', () => {
    render(<ChipInput values={[]} onChange={vi.fn()} ariaLabel="Network name" error="At least one network is required." />);

    expect(screen.getByText('At least one network is required.')).toBeInTheDocument();
  });
});
