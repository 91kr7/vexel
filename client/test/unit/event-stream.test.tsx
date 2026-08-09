import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { EventStream, type EventStreamEntry } from '../../src/ui';

afterEach(cleanup);

function entry(id: string, action: string, timestamp: string): EventStreamEntry {
  return { id, timestamp, type: 'container', action, summary: 'c-1' };
}

function lines(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.ui-event-stream__line')].map((line) => line.textContent ?? '');
}

describe('EventStream (ui-library/specs/event-stream.md)', () => {
  // event-stream.md — "two entries agreeing on everything but their id are two lines, each keeping its
  // own timestamp, type and action across a re-render" (batch-event-feed-keys)
  it('renders two entries of the same object in the same second as two lines, each with its own action', () => {
    const stopped = entry('1786229808123000000-stop', 'stop', '10:16:48');
    const started = entry('1786229808876000000-start', 'start', '10:16:48');

    const { container } = render(<EventStream entries={[started, stopped]} />);

    expect(lines(container)).toHaveLength(2);
    expect(lines(container)[0]).toContain('start');
    expect(lines(container)[1]).toContain('stop');
  });

  // event-stream.md — the same two entries survive a re-render that prepends a third: neither line is
  // dropped, and neither takes over the other's action
  it('keeps both lines, with their own actions, when a re-render prepends a newer entry', () => {
    const stopped = entry('1786229808123000000-stop', 'stop', '10:16:48');
    const started = entry('1786229808876000000-start', 'start', '10:16:48');
    const died = entry('1786229809100000000-die', 'die', '10:16:49');

    const { container, rerender } = render(<EventStream entries={[started, stopped]} />);
    rerender(<EventStream entries={[died, started, stopped]} />);

    const rendered = lines(container);
    expect(rendered).toHaveLength(3);
    expect(rendered[0]).toContain('die');
    expect(rendered[0]).toContain('10:16:49');
    expect(rendered[1]).toContain('start');
    expect(rendered[1]).toContain('10:16:48');
    expect(rendered[2]).toContain('stop');
    expect(rendered[2]).toContain('10:16:48');
  });

  // event-stream.md — emptyLabel is what an empty stream shows
  it('shows the empty label when there is no entry', () => {
    const { container } = render(<EventStream entries={[]} emptyLabel="No daemon events yet." />);

    expect(lines(container)).toHaveLength(0);
    expect(container.textContent).toContain('No daemon events yet.');
  });
});
