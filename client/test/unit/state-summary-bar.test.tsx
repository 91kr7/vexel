import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Button, StateSummaryBar } from '../../src/ui';

// The strip stating the condition of a whole subsystem
// (ui-library/specs/state-summary-bar.md, REQ-79).
afterEach(cleanup);

describe('StateSummaryBar (ui-library/specs/state-summary-bar.md)', () => {
  // "facts?: string[] — the qualifying readings, rendered as one muted monospace line with the
  // entries separated by `·`, in the order given"
  it('renders the state in words and the facts as one line, in the order given', () => {
    render(<StateSummaryBar tone="success" title="Swarm active" facts={['manager', 'cluster 9pk2x', '3 nodes', 'raft healthy']} />);

    expect(screen.getByText('Swarm active')).toBeInTheDocument();
    expect(screen.getByText('manager · cluster 9pk2x · 3 nodes · raft healthy')).toBeInTheDocument();
  });

  // "an empty or absent list renders no line"
  it('renders no facts line at all when there are no facts', () => {
    const { container } = render(<StateSummaryBar title="Swarm inactive" />);

    expect(container.textContent).toBe('Swarm inactive');
  });

  it('renders no facts line for an empty list either', () => {
    const { container } = render(<StateSummaryBar title="Swarm inactive" facts={[]} />);

    expect(container.textContent).toBe('Swarm inactive');
  });

  // "It states a condition even when there is nothing to detail: a caller with no facts still gets
  // the dot, the title and its actions, so a subsystem that is off is announced rather than left
  // blank."
  it('still shows the title and the actions when a subsystem is off', () => {
    render(<StateSummaryBar title="Swarm inactive" actions={<Button>Initialise swarm</Button>} />);

    expect(screen.getByText('Swarm inactive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Initialise swarm' })).toBeInTheDocument();
  });

  // "The bar is one glass surface of its own, never a card with a section header: it reads as a
  // status strip, not as a panel of content."
  it('is a strip, not a panel: it carries no heading of its own', () => {
    render(<StateSummaryBar title="Swarm active" facts={['manager']} />);

    expect(screen.queryByRole('heading')).toBeNull();
  });

  // "none of its own: every action is whatever the caller puts in actions"
  it('offers no action of its own', () => {
    render(<StateSummaryBar title="Swarm active" facts={['manager']} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
