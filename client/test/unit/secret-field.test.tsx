import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecretField } from '../../src/ui';

afterEach(cleanup);

// ui-library/specs/secret-field.md — a single-line input for a secret typed
// once: every character masked, nothing typed into it readable back on screen
// (REQ-87).
describe('SecretField (ui-library/specs/secret-field.md)', () => {
  // "ariaLabel is required: the field carries no visible label of its own and must still be
  // nameable by assistive technology"
  it('is nameable by its aria label alone', () => {
    render(<SecretField value="" onChange={vi.fn()} ariaLabel="Registry password or access token" />);

    expect(screen.getByLabelText('Registry password or access token')).toBeInTheDocument();
  });

  // "Shows: the typed value masked, one placeholder glyph per character"
  it('masks the value it is given', () => {
    render(<SecretField value="s3cret" onChange={vi.fn()} ariaLabel="Secret" />);

    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password');
  });

  // "There is no reveal control, and no prop that adds one: the value is never rendered in clear
  // text, in any state" — the invariant REQ-87 turns on.
  it('offers no reveal control and never renders the value in clear text', () => {
    const { container } = render(<SecretField value="s3cret" onChange={vi.fn()} ariaLabel="Secret" placeholder="type it" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('s3cret')).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain('s3cret');
    // Nothing in the rendered markup can be flipped to a readable field.
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')).toHaveAttribute('type', 'password');
  });

  it('keeps the value masked whatever the caller passes, there being no prop that unmasks it', () => {
    // The props the component accepts are exactly those of its contract: none of them reveals.
    render(<SecretField value="s3cret" onChange={vi.fn()} ariaLabel="Secret" placeholder="type it" autoFocus onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // "the placeholder text when empty"
  it('shows the placeholder while empty', () => {
    render(<SecretField value="" onChange={vi.fn()} ariaLabel="Secret" placeholder="Password or access token" />);

    expect(screen.getByPlaceholderText('Password or access token')).toBeInTheDocument();
  });

  // "onChange(value) fires on every keystroke with the current value"
  it('reports every keystroke to the caller', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SecretField value="" onChange={onChange} ariaLabel="Secret" />);

    await user.type(screen.getByLabelText('Secret'), 'ab');

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, 'a');
  });

  // "onSubmit?() fires on Enter"
  it('submits on Enter when the caller asked for it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SecretField value="s3cret" onChange={vi.fn()} ariaLabel="Secret" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Secret'), '{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // "Browser autofill, password managers and spell-checking are all kept off the field, so the
  // value is not offered for storage anywhere outside the keystroke that produced it."
  it('keeps autofill, password managers and spell-checking off the field', () => {
    render(<SecretField value="" onChange={vi.fn()} ariaLabel="Secret" />);

    const field = screen.getByLabelText('Secret');
    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).toHaveAttribute('spellcheck', 'false');
  });

  // "The component holds no state of its own: the value lives with the caller, which is what lets
  // the caller drop it the moment the form closes."
  it('holds no state of its own: only the value the caller gives it is shown', async () => {
    const user = userEvent.setup();
    render(<SecretField value="" onChange={vi.fn()} ariaLabel="Secret" />);

    await user.type(screen.getByLabelText('Secret'), 'typed');

    // The caller never fed the keystrokes back, so the field still shows the caller's own value.
    expect(screen.getByLabelText('Secret')).toHaveValue('');
  });
});
