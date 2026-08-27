import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  // badge.md — "a badge is a statement, never a control": it renders a label and offers no
  // activation of its own, the clickable presentation having been removed with its last consumer
  // (plan-ui-coherence-optimisation/REQ-82)
  it('renders a plain label and never a click target', () => {
    render(<Badge>in use</Badge>);

    expect(screen.getByText('in use')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // badge.md — "tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'"; "variant: 'solid' |
  // 'quiet'" — the pair of treatments that lets a container's state sit beside its classification
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
