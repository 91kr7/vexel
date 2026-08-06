import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Meter, MetricTile, Sparkline } from '../../src/ui';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function meterValueNow(): number {
  return Number(screen.getByRole('meter').getAttribute('aria-valuenow'));
}

describe('MetricTile (REQ-32)', () => {
  // metric-primitives.md — the tile carries a label, the reading, an optional sub-label and a slot
  it('shows the label, the value, the sub-label and the slot content', () => {
    render(
      <MetricTile label="CPU" value="42%" subLabel="of 4 cores">
        <span data-testid="slot">meter goes here</span>
      </MetricTile>,
    );

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('of 4 cores')).toBeInTheDocument();
    expect(screen.getByTestId('slot')).toBeInTheDocument();
  });

  // metric-primitives.md — the sub-label and the slot are optional
  it('renders without a sub-label and without slot content', () => {
    render(<MetricTile label="PIDs" value="7" />);

    expect(screen.getByText('PIDs')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  // metric-primitives.md — the tone colors the value; the tones are distinguishable from one another
  it('renders each tone distinguishably', () => {
    const rendered = (['neutral', 'accent', 'success', 'warning', 'danger'] as const).map((tone) => {
      const { container, unmount } = render(<MetricTile label="CPU" value="42%" tone={tone} />);
      const html = container.innerHTML;
      unmount();
      return html;
    });

    expect(new Set(rendered).size).toBe(rendered.length);
  });
});

describe('Meter (REQ-32)', () => {
  // metric-primitives.md — the bar is filled for value / max and exposed as a meter to assistive technology
  it('exposes the filled percentage as a meter', () => {
    render(<Meter label="Memory" value={128} max={512} reading="128MB / 512MB" ariaLabel="Memory used" />);

    expect(meterValueNow()).toBe(25);
    expect(screen.getByRole('meter', { name: 'Memory used' })).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('128MB / 512MB')).toBeInTheDocument();
  });

  // metric-primitives.md — the accessible name falls back to the label when no ariaLabel is given
  it('names the meter after its label when no accessible name is given', () => {
    render(<Meter label="Memory" value={128} max={512} />);

    expect(screen.getByRole('meter', { name: 'Memory' })).toBeInTheDocument();
  });

  // metric-primitives.md — the fill is clamped to the 0…1 range
  it('clamps the fill to the 0…1 range', () => {
    const { unmount } = render(<Meter label="CPU" value={900} max={100} />);
    expect(meterValueNow()).toBe(100);
    unmount();

    render(<Meter label="CPU" value={-20} max={100} />);
    expect(meterValueNow()).toBe(0);
  });

  // metric-primitives.md — a value that is not finite is treated as 0
  it('treats a value that is not finite as zero', () => {
    render(<Meter label="CPU" value={Number.NaN} max={100} />);

    expect(meterValueNow()).toBe(0);
  });

  // metric-primitives.md — the bar stays empty when no limit is known
  it('stays empty when the maximum is missing or not positive', () => {
    const { unmount } = render(<Meter label="Memory" value={128} />);
    expect(meterValueNow()).toBe(0);
    unmount();

    render(<Meter label="Memory" value={128} max={0} />);
    expect(meterValueNow()).toBe(0);
  });

  // metric-primitives.md — with neither label nor reading, only the bar is rendered
  it('renders only the bar when it carries neither a label nor a reading', () => {
    const { container } = render(<Meter value={50} max={100} ariaLabel="CPU" />);

    expect(container.textContent).toBe('');
    expect(screen.getByRole('meter')).toBeInTheDocument();
  });
});

describe('Sparkline (REQ-32)', () => {
  // metric-primitives.md — fewer than two values shows the empty label instead of a line
  it('shows the empty label while there are fewer than two samples', () => {
    const { unmount } = render(<Sparkline values={[]} />);
    expect(screen.getByText('No samples yet')).toBeInTheDocument();
    unmount();

    const single = render(<Sparkline values={[5]} />);
    expect(screen.getByText('No samples yet')).toBeInTheDocument();
    expect(single.container.querySelector('path')).toBeNull();
    single.unmount();

    render(<Sparkline values={[]} emptyLabel="Nothing measured yet" />);
    expect(screen.getByText('Nothing measured yet')).toBeInTheDocument();
  });

  // metric-primitives.md — two samples or more draw the line
  it('draws the line once there are at least two samples', () => {
    const { container } = render(<Sparkline values={[1, 4, 2, 8]} ariaLabel="CPU history" />);

    expect(container.querySelector('path')).not.toBeNull();
    expect(screen.queryByText('No samples yet')).not.toBeInTheDocument();
  });

  // metric-primitives.md — values above max are clamped, so an out-of-range sample draws like the maximum
  it('clamps the samples to the 0…max range', () => {
    const clamped = render(<Sparkline values={[0, 500, -200]} max={100} />);
    const clampedPaths = [...clamped.container.querySelectorAll('path')].map((path) => path.getAttribute('d'));
    clamped.unmount();

    const inRange = render(<Sparkline values={[0, 100, 0]} max={100} />);
    const inRangePaths = [...inRange.container.querySelectorAll('path')].map((path) => path.getAttribute('d'));

    expect(clampedPaths).toEqual(inRangePaths);
  });

  // metric-primitives.md — without an explicit max the scale is the largest value in the window
  it('scales to the largest value in the window when no max is given', () => {
    const half = render(<Sparkline values={[0, 25, 50]} />);
    const halfPaths = [...half.container.querySelectorAll('path')].map((path) => path.getAttribute('d'));
    half.unmount();

    const full = render(<Sparkline values={[0, 50, 100]} />);
    const fullPaths = [...full.container.querySelectorAll('path')].map((path) => path.getAttribute('d'));

    expect(halfPaths).toEqual(fullPaths);
  });

  // metric-primitives.md — a live metric costs one repaint per sample: no animation loop, no timer, no transition
  it('runs no animation loop and no timer', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const setTimeout = vi.spyOn(globalThis, 'setTimeout');
    const requestAnimationFrame = vi.spyOn(globalThis, 'requestAnimationFrame');

    const { container, rerender } = render(<Sparkline values={[1, 2, 3]} />);
    rerender(<Sparkline values={[1, 2, 3, 4]} />);

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(setInterval).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toMatch(/transition|animation/i);
  });
});
