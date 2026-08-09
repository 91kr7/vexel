import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle } from '../../src/ui';

// The on/off switch (ui-library/specs/toggle.md). Its busy state is what a
// state change travelling to the daemon rests on (REQ-111): a switch waiting on
// an answer must keep showing what is still true, refuse further input and say
// the work is in flight.

afterEach(cleanup);

describe('Toggle (ui-library/specs/toggle.md)', () => {
  // toggle.md — "<Toggle checked onChange label? ...>"; the label is the accessible name when no
  // ariaLabel is given
  it('is operable, named by its label, and reports the value asked for', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Enable once installed" />);

    const control = screen.getByRole('checkbox', { name: 'Enable once installed' });
    expect(control).not.toBeChecked();

    await userEvent.click(control);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  // toggle.md — "ariaLabel" takes precedence over the label as the accessible name
  it('is named by ariaLabel when one is given', () => {
    render(<Toggle checked ariaLabel="Disable vieux/sshfs:latest" label="on" onChange={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Disable vieux/sshfs:latest' })).toBeChecked();
  });

  // toggle.md — "disabled?: boolean — the switch cannot be operated"; "Busy and disabled both block
  // onChange ... disabled does not [announce work in flight]"
  it('refuses input when disabled, without announcing any work in flight', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} ariaLabel="Enable it" disabled />);

    const control = screen.getByRole('checkbox', { name: 'Enable it' });
    await userEvent.click(control);

    expect(onChange).not.toHaveBeenCalled();
    expect(control).toBeDisabled();
    expect(control).not.toHaveAttribute('aria-busy', 'true');
  });

  // toggle.md — "A busy switch never shows the value it was asked to change to: only a confirmed
  // change moves it, so a refused or failed one never leaves a lie on screen." It also "refuses
  // further input, marks itself busy to assistive technology and shows a pending indicator".
  it('keeps showing the value that is still true while busy, refuses input and says so', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Toggle checked onChange={onChange} ariaLabel="Disable vieux/sshfs:latest" busy />);

    const control = screen.getByRole('checkbox', { name: 'Disable vieux/sshfs:latest' });
    // The change asked for was "off"; until it comes back, the switch still says "on".
    expect(control).toBeChecked();
    expect(control).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toBeInTheDocument();

    await userEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();

    // Only the confirmed change moves it.
    rerender(<Toggle checked={false} onChange={onChange} ariaLabel="Enable vieux/sshfs:latest" />);
    expect(screen.getByRole('checkbox', { name: 'Enable vieux/sshfs:latest' })).not.toBeChecked();
  });

  // toggle.md — "The switch is operated by its track or its label, and from the keyboard once
  // focused: the checkbox carrying the state is visually behind the track, so it is reachable and
  // announced but is not itself the hit area."
  it('is operated by its track', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} ariaLabel="Enable it" />);

    await userEvent.click(document.querySelector('.ui-toggle__track') as HTMLElement);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is operated by its label', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Enable once installed" />);

    await userEvent.click(screen.getByText('Enable once installed'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  // toggle.md — "and from the keyboard once focused": the checkbox is reachable and announced even
  // though it is not the hit area.
  it('is operated from the keyboard once focused, and is announced by its accessible name', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} ariaLabel="Enable vieux/sshfs:latest" />);

    await userEvent.tab();
    expect(screen.getByRole('checkbox', { name: 'Enable vieux/sshfs:latest' })).toHaveFocus();

    await userEvent.keyboard(' ');

    expect(onChange).toHaveBeenCalledWith(true);
  });

  // toggle.md — the track is the hit area, so a locked switch must refuse it there too, not only on
  // the checkbox behind it.
  it('refuses a click on the track while busy or disabled', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Toggle checked onChange={onChange} ariaLabel="Disable it" busy />);
    await userEvent.click(document.querySelector('.ui-toggle__track') as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();

    rerender(<Toggle checked onChange={onChange} ariaLabel="Disable it" disabled />);
    await userEvent.click(document.querySelector('.ui-toggle__track') as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();
  });

  // toggle.md — default `false` for both flags: a plain switch is operable and announces nothing
  it('is neither disabled nor busy by default', async () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} ariaLabel="Plain" />);

    const control = screen.getByRole('checkbox', { name: 'Plain' });
    expect(control).toBeEnabled();
    expect(control).not.toHaveAttribute('aria-busy', 'true');

    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
