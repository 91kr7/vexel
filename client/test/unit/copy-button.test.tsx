import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyButton } from '../../src/ui';

afterEach(cleanup);

// userEvent.setup() installs its own navigator.clipboard stub, so the test's
// stub must be defined after setup() to take precedence over it.
function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('CopyButton (ui-library/specs/copy-button.md)', () => {
  // ui-library/specs/copy-button.md — REQ-26
  it('copies the exact value to the clipboard, under the default "Copy" label', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(<CopyButton value="exact-payload-text" />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('exact-payload-text');
  });

  // ui-library/specs/copy-button.md — replaces the label with "Copied" for 1.5 seconds, then reverts
  it('replaces the label with "Copied" then reverts to the original label after 1.5 seconds', async () => {
    const user = userEvent.setup();
    stubClipboard();
    render(<CopyButton value="x" label="Copy raw" />);

    await user.click(screen.getByRole('button', { name: 'Copy raw' }));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy raw' })).toBeInTheDocument(), { timeout: 3000 });
  }, 5000);
});
