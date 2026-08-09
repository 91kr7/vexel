import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DashboardLayout } from '../../src/ui';

afterEach(cleanup);

/** The regions, in the order they appear in the document. */
function renderedOrder(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-region]')).map((node) => node.dataset.region!);
}

describe('DashboardLayout (ui-library/specs/dashboard-layout.md, REQ-14)', () => {
  // dashboard-layout.md — "three stacked regions, in this order: the tiles row, the two-column panel
  // area, the optional full-width footer panel" / "primary and secondary side by side, primary first"
  it('stacks the tiles, then primary beside secondary, then the footer', () => {
    render(
      <DashboardLayout
        tiles={<span data-region="tiles">tiles</span>}
        primary={<span data-region="primary">primary</span>}
        secondary={<span data-region="secondary">secondary</span>}
        footer={<span data-region="footer">footer</span>}
      />,
    );

    expect(renderedOrder()).toEqual(['tiles', 'primary', 'secondary', 'footer']);
  });

  // dashboard-layout.md — "footer — omitted entirely when not given (no empty region is left behind)"
  it('leaves no footer region behind when no footer is given', () => {
    const { container } = render(
      <DashboardLayout
        tiles={<span data-region="tiles">tiles</span>}
        primary={<span data-region="primary">primary</span>}
        secondary={<span data-region="secondary">secondary</span>}
      />,
    );

    expect(renderedOrder()).toEqual(['tiles', 'primary', 'secondary']);
    // The region itself is gone, not merely empty: nothing in the tree carries a footer role.
    expect(container.querySelectorAll('[class*="footer"]')).toHaveLength(0);
  });

  // dashboard-layout.md — "Domain-agnostic: it knows nothing of what the tiles or panels contain."
  it('renders whatever each region is given, untouched', () => {
    render(
      <DashboardLayout
        tiles={<button type="button">Running</button>}
        primary={<p>activity</p>}
        secondary={<p>usage</p>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Running' })).toBeInTheDocument();
    expect(screen.getByText('activity')).toBeInTheDocument();
    expect(screen.getByText('usage')).toBeInTheDocument();
  });
});
