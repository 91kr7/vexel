import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Badge, type BadgeTone, type BadgeVariant } from '../../src/ui';

afterEach(cleanup);

const TONES: BadgeTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];
const VARIANTS: BadgeVariant[] = ['solid', 'quiet'];

/** The classes the badge carries for one tone/variant pair, as a set. */
function classesOf(tone: BadgeTone, variant: BadgeVariant): Set<string> {
  const { container, unmount } = render(
    <Badge tone={tone} variant={variant}>
      label
    </Badge>,
  );
  const classes = new Set((container.firstElementChild as HTMLElement).className.split(' ').filter(Boolean));
  unmount();
  return classes;
}

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

  // badge.md — "tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'"; "variant: 'solid' |
  // 'quiet'" — the pair of treatments that lets a swarm node's role sit beside its availability
  // (REQ-81, REQ-82)
  it('renders its label in every tone and both variants', () => {
    for (const tone of TONES) {
      for (const variant of VARIANTS) {
        const { unmount } = render(
          <Badge tone={tone} variant={variant}>
            {`${tone}-${variant}`}
          </Badge>,
        );
        expect(screen.getByText(`${tone}-${variant}`)).toBeInTheDocument();
        unmount();
      }
    }
  });

  // badge.md — "tone and variant are independent: every tone is available in both variants". The
  // quiet treatment of a tone is therefore that tone's treatment plus the quiet one, never a
  // separate fixed pair.
  it('composes tone and variant independently', () => {
    const quietMarkers = [...classesOf('neutral', 'quiet')].filter((entry) => !classesOf('neutral', 'solid').has(entry));
    expect(quietMarkers.length).toBeGreaterThan(0);

    for (const tone of TONES) {
      const solid = classesOf(tone, 'solid');
      const quiet = classesOf(tone, 'quiet');
      for (const marker of solid) expect(quiet.has(marker)).toBe(true);
      for (const marker of quietMarkers) expect(quiet.has(marker)).toBe(true);
    }
  });

  // badge.md — "info carries the accent role — an attribute that classifies rather than warns (e.g.
  // a role such as 'manager' or a mode such as 'replicated')"
  it('tells the info tone apart from the neutral default', () => {
    expect([...classesOf('info', 'solid')].sort()).not.toEqual([...classesOf('neutral', 'solid')].sort());
  });
});
