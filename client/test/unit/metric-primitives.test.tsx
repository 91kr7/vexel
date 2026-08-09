import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  // metric-primitives.md — "surface (default false) — draws the reading on its own glass panel, for
  // a tile standing alone rather than inside a panel that already provides one" (REQ-14)
  it('draws the reading on its own glass panel only when asked to', () => {
    const { container: bare } = render(<MetricTile label="Running" value="4" />);
    expect(bare.querySelector('.ui-surface')).toBeNull();
    cleanup();

    const { container: panelled } = render(<MetricTile surface label="Running" value="4" />);
    expect(panelled.querySelector('.ui-surface')).not.toBeNull();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  // metric-primitives.md — "onActivate?() — makes the whole tile a single activatable control: a
  // pointer click and a keyboard activation (it is reachable by Tab, and Enter/Space activate it)
  // both call it once" / "ariaLabel — the activatable tile's accessible name" (REQ-18)
  it('makes an activatable tile one control, reachable by Tab and activated once per activation', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<MetricTile label="Running" value="4" onActivate={onActivate} ariaLabel="Running containers — open the Containers screen" />);

    const tile = screen.getByRole('button', { name: 'Running containers — open the Containers screen' });
    await user.tab();
    expect(tile).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onActivate).toHaveBeenCalledTimes(2);

    await user.click(tile);
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  // metric-primitives.md — "Without it the tile is inert text and takes no focus." / "ariaLabel …
  // ignored when onActivate is absent"
  it('leaves a tile without onActivate inert, unfocusable and unnamed', async () => {
    const user = userEvent.setup();
    render(<MetricTile label="Running" value="4" ariaLabel="never used" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('never used')).not.toBeInTheDocument();

    await user.tab();
    expect(document.body).toHaveFocus();
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
