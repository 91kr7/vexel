import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Card, QuadPanelLayout } from '../../src/ui';

// The four-panel arrangement of a screen whose subject splits into four equally
// important inventories (ui-library/specs/quad-panel-layout.md, REQ-81 to REQ-84).
afterEach(cleanup);

describe('QuadPanelLayout (ui-library/specs/quad-panel-layout.md)', () => {
  // "reading order is topStart, topEnd, bottomStart, bottomEnd — the order they keep in the DOM,
  // and therefore for the keyboard and for assistive technology, at every viewport width"
  it('places the four panels in reading order in the DOM', () => {
    render(
      <QuadPanelLayout
        topStart={<Card>Nodes</Card>}
        topEnd={<Card>Services &amp; tasks</Card>}
        bottomStart={<Card>Secrets</Card>}
        bottomEnd={<Card>Configs &amp; stacks</Card>}
      />,
    );

    const order = ['Nodes', 'Services & tasks', 'Secrets', 'Configs & stacks'].map((label) => screen.getByText(label));
    for (let index = 1; index < order.length; index += 1) {
      // Node.DOCUMENT_POSITION_FOLLOWING: the next panel comes after the previous one.
      expect(order[index - 1]!.compareDocumentPosition(order[index]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  // "The layout only places its slots: it gives them no padding, no surface and no title of their
  // own."
  it('adds no surface and no title of its own around the panels', () => {
    const { container } = render(<QuadPanelLayout topStart="a" topEnd="b" bottomStart="c" bottomEnd="d" />);

    expect(container.textContent).toBe('abcd');
    expect(screen.queryByRole('heading')).toBeNull();
    // One element placing four children, and nothing else.
    expect(container.children).toHaveLength(1);
  });
});
