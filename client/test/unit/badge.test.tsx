import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Badge } from '../../src/ui';

afterEach(cleanup);

describe('Badge (ui-library/specs/badge.md)', () => {
  // badge.md — without onClick the badge is a plain label, not a click target
  it('renders a plain label when no onClick is given', () => {
    render(<Badge>in use</Badge>);

    expect(screen.getByText('in use')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // badge.md — onClick renders the badge as a click target and is called when used
  it('renders a click target and calls onClick when used', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Badge onClick={onClick}>use</Badge>);

    await user.click(screen.getByRole('button', { name: 'use' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // badge.md — "a clickable badge stops the click event from propagating, so it never also
  // triggers a containing row's own selection"
  it('does not let its click reach a containing row', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onBadgeClick = vi.fn();
    render(
      // A raw wrapper is legitimate here: the test needs a containing click target of its own,
      // and this is test code, outside the UI-library boundary rule.
      <div onClick={onRowClick}>
        <Badge onClick={onBadgeClick}>use</Badge>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'use' }));

    expect(onBadgeClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
