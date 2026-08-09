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

// userEvent.setup() installs its own navigator.clipboard stub, so the test's
// stub must be defined after setup() to take precedence over it.
function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

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

  // '"Copy" ... available whether the value is revealed or hidden, since copying does not display it'
  it('copies the exact value while it is still hidden', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(<RevealableValue value={TOKEN} ariaLabel="Worker join token" revealed={false} onRevealedChange={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith(TOKEN);
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  // '"Show" ... disabled while there is no value or loading'
  it('offers no reveal while there is no value, and shows the placeholder instead', () => {
    render(<RevealableValue ariaLabel="Worker join token" revealed={false} onRevealedChange={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Show' })).toBeDisabled();
    expect(screen.getByText('Not read yet')).toBeInTheDocument();
  });

  // '"Copy" ... **Always present**, and disabled while there is no value or loading'; "No
  // affordance is ever unmounted for lack of a value ... so the row does not reflow"
  it('keeps the copy affordance, disabled and inert, while there is no value', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(<RevealableValue ariaLabel="Worker join token" revealed={false} onRevealedChange={() => undefined} />);

    const copy = screen.getByRole('button', { name: 'Copy' });
    expect(copy).toBeDisabled();
    await user.click(copy, { pointerEventsCheck: 0 });
    expect(writeText).not.toHaveBeenCalled();
  });

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

  // "loading?: boolean — the value is being read; the reveal and copy affordances are disabled"
  it('disables the reveal while the value is being read', () => {
    render(<RevealableValue value={TOKEN} ariaLabel="Token" revealed={false} onRevealedChange={() => undefined} loading />);

    expect(screen.getByRole('button', { name: 'Show' })).toBeDisabled();
  });

  it('disables the copy while the value is being read, and copies nothing then', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(<RevealableValue value={TOKEN} ariaLabel="Token" revealed={false} onRevealedChange={() => undefined} loading />);

    const copy = screen.getByRole('button', { name: 'Copy' });
    expect(copy).toBeDisabled();
    await user.click(copy, { pointerEventsCheck: 0 });
    expect(writeText).not.toHaveBeenCalled();
  });

  // "action?: { label, onClick, disabled? } — one extra action rendered after copy (e.g. 'Rotate')"
  it('renders the one extra action the caller gave, after copy', async () => {
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
