import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RevealableValue } from '../../src/ui';

// A sensitive value the application *received* — a swarm join token
// (ui-library/specs/revealable-value.md, REQ-80). The contract this file is
// mostly about: "The value is never rendered while revealed is false — not in
// the DOM, not as a title/tooltip, not as a value attribute: hiding is not a
// visual effect over rendered text."
const TOKEN = 'SWMTKN-1-49nj1cmql0jkz5s954yi3oex3nedyz0fb0xx14ie39trti4wxv-8vxv8rssmk743ojnwacrr2e7c';

afterEach(cleanup);

// The component's stated purpose used to end "copyable while hidden"; that clause was **withdrawn
// on 2026-08-14** by plan-docker_management_app-remove_copy_controls, and the coverage of it goes
// with it. Everything else this file checks — the masked default, the reveal, the disabled states,
// the action slot — is untouched by that withdrawal and is what the component still contracts.

/** Everything the browser holds for this component: its text and every attribute of every node. */
function renderedMarkup(): string {
  return document.body.innerHTML;
}

describe('RevealableValue (ui-library/specs/revealable-value.md)', () => {
  it('does not render the value anywhere while it is hidden', () => {
    render(<RevealableValue value={TOKEN} ariaLabel="Worker join token" revealed={false} onRevealedChange={() => undefined} />);

    expect(document.body.textContent).not.toContain(TOKEN);
    expect(renderedMarkup()).not.toContain(TOKEN);
  });

  // "The mask has a fixed length: its width says nothing about the length of the value behind it."
  it('masks a short and a long value with the very same run of glyphs', () => {
    const { unmount } = render(<RevealableValue value="ab" ariaLabel="Token" revealed={false} onRevealedChange={() => undefined} />);
    const shortMask = document.body.textContent ?? '';
    unmount();

    render(<RevealableValue value={TOKEN} ariaLabel="Token" revealed={false} onRevealedChange={() => undefined} />);
    const longMask = document.body.textContent ?? '';

    expect(longMask).toBe(shortMask);
  });

  // "while revealed: the value verbatim"
  it('shows the value verbatim once it is revealed', () => {
    render(<RevealableValue value={TOKEN} ariaLabel="Worker join token" revealed onRevealedChange={() => undefined} />);

    expect(screen.getByText(TOKEN)).toBeInTheDocument();
  });

  // '"Show" / "Hide" -> onRevealedChange(!revealed)'; the reveal state is the caller's
  it('asks the caller to reveal, and to hide again, rather than deciding for itself', async () => {
    const user = userEvent.setup();
    const onRevealedChange = vi.fn();
    const { rerender } = render(
      <RevealableValue value={TOKEN} ariaLabel="Worker join token" revealed={false} onRevealedChange={onRevealedChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(onRevealedChange).toHaveBeenCalledWith(true);
    // The caller did not change the prop, so the value is still not rendered.
    expect(document.body.textContent).not.toContain(TOKEN);

    rerender(<RevealableValue value={TOKEN} ariaLabel="Worker join token" revealed onRevealedChange={onRevealedChange} />);
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(onRevealedChange).toHaveBeenCalledWith(false);
  });

  // '"Show" ... disabled while there is no value or loading'
  it('offers no reveal while there is no value, and shows the placeholder instead', () => {
    render(<RevealableValue ariaLabel="Worker join token" revealed={false} onRevealedChange={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Show' })).toBeDisabled();
    expect(screen.getByText('Not read yet')).toBeInTheDocument();
  });

  // "No affordance is ever unmounted for lack of a value ... so the row does not reflow"
  it('mounts the same affordances whether or not the value is there yet, so the row does not reflow', () => {
    const { unmount } = render(<RevealableValue ariaLabel="Token" revealed={false} onRevealedChange={() => undefined} />);
    const withoutValue = screen.getAllByRole('button').map((button) => button.textContent);
    unmount();

    render(<RevealableValue value={TOKEN} ariaLabel="Token" revealed={false} onRevealedChange={() => undefined} />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(withoutValue);
  });

  // "placeholder?: string — the line shown when there is no value yet"
  it('shows the placeholder the caller gave', () => {
    render(<RevealableValue ariaLabel="Token" revealed={false} onRevealedChange={() => undefined} placeholder="Ask the cluster for it" />);

    expect(screen.getByText('Ask the cluster for it')).toBeInTheDocument();
  });

  // "loading?: boolean — the value is being read; the reveal affordance is disabled"
  it('disables the reveal while the value is being read', () => {
    render(<RevealableValue value={TOKEN} ariaLabel="Token" revealed={false} onRevealedChange={() => undefined} loading />);

    expect(screen.getByRole('button', { name: 'Show' })).toBeDisabled();
  });

  // "action?: { label, onClick, disabled? } — one extra action rendered after the reveal control
  // (e.g. 'Rotate')"
  it('renders the one extra action the caller gave, after the reveal control', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <RevealableValue
        value={TOKEN}
        ariaLabel="Token"
        revealed={false}
        onRevealedChange={() => undefined}
        action={{ label: 'Rotate', onClick }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Rotate' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // "ariaLabel: string — required: the surface carries no visible label of its own"
  it('carries the accessible name the caller gave, since it shows none', () => {
    render(<RevealableValue value={TOKEN} ariaLabel="Manager join token" revealed={false} onRevealedChange={() => undefined} />);

    expect(screen.getByLabelText('Manager join token')).toBeInTheDocument();
  });
});
