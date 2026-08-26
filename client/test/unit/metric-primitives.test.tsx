import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Meter, MetricReadingPair, MetricTile, Sparkline } from '../../src/ui';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function meterValueNow(): number {
  return Number(screen.getByRole('meter').getAttribute('aria-valuenow'));
}

/** Every coordinate pair of an SVG path's `d`, in the order it draws them. */
function pathPoints(d: string): { x: number; y: number }[] {
  return [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((pair) => ({ x: Number(pair[1]), y: Number(pair[2]) }));
}

function samePoint(one: { x: number; y: number }, other: { x: number; y: number }): boolean {
  return Math.abs(one.x - other.x) < 0.01 && Math.abs(one.y - other.y) < 0.01;
}

/** The polyline through the samples: the one shape carrying exactly one coordinate per sample. */
function sampleLine(root: ParentNode, sampleCount: number): { x: number; y: number }[] {
  for (const path of root.querySelectorAll('path')) {
    const points = pathPoints(path.getAttribute('d') ?? '');
    if (points.length === sampleCount) return points;
  }
  return [];
}

/**
 * The single point the sparkline marks, whatever shape carries it: a shape drawn entirely at one
 * coordinate. `null` when nothing is marked.
 */
function markedShape(root: ParentNode): { point: { x: number; y: number }; element: Element } | null {
  const circle = root.querySelector('circle');
  if (circle) return { point: { x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')) }, element: circle };
  for (const path of root.querySelectorAll('path')) {
    const points = pathPoints(path.getAttribute('d') ?? '');
    if (points.length > 0 && points.every((point) => samePoint(point, points[0]!))) return { point: points[0]!, element: path };
  }
  return null;
}

/** The declarations of every rule whose selector matches `matches`, comments stripped. */
function metricsRules(matches: (selector: string) => boolean): { selector: string; declarations: string }[] {
  const css = readFileSync(join(process.cwd(), 'src/ui/metrics/metrics.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((rule) => ({ selector: rule[1]!.trim(), declarations: rule[2]! }))
    .filter((rule) => matches(rule.selector));
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

  // metric-primitives.md — an activatable tile is one control, by pointer and by keyboard (REQ-18).
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

  // metric-primitives.md — a missing or non-positive maximum leaves the filled percentage at 0…
  it('fills nothing when the maximum is missing or not positive', () => {
    const { unmount } = render(<Meter label="Memory" value={128} />);
    expect(meterValueNow()).toBe(0);
    unmount();

    render(<Meter label="Memory" value={128} max={0} />);
    expect(meterValueNow()).toBe(0);
  });

  // metric-primitives.md — no measurable maximum is a treatment of its own, not an empty track
  // (plan-ui-coherence-optimisation/REQ-64).
  it('draws the track of a metric with no measurable maximum differently from an unfilled one', () => {
    const { container: bounded, unmount } = render(<Meter label="Memory" value={0} max={512} />);
    const boundedTrack = bounded.querySelector('.ui-meter__track')!.className;
    unmount();

    const { container: unbounded } = render(<Meter label="Net I/O" value={128} />);
    const unboundedTrack = unbounded.querySelector('.ui-meter__track')!.className;

    expect(unboundedTrack, 'a metric with no ceiling is drawn exactly as one whose fill is at zero').not.toBe(boundedTrack);
  });

  // metric-primitives.md — "with no measurable maximum … the meter additionally announces that
  // there is no maximum to be a percentage of"
  it('announces to assistive technology that there is no maximum, and says nothing of the sort when there is one', () => {
    const { unmount } = render(<Meter label="Net I/O" value={128} />);
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toMatch(/no.*maximum/i);
    unmount();

    render(<Meter label="Memory" value={128} max={512} />);
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBeNull();
  });

  // metric-primitives.md — the unbounded state repaints the track and never resizes it.
  it('gives the no-maximum state no box of its own', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/metrics/metrics.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const declarations = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((rule) => rule[1].trim() === '.ui-meter__track--unbounded')
      .map((rule) => rule[2])
      .join(' ');

    expect(declarations, 'the library declares no treatment for a metric with no measurable maximum').not.toBe('');
    expect(declarations, 'the no-maximum state resizes the track').not.toMatch(
      /(^|;|\s)(height|min-height|max-height|padding|margin|border(-\w+)?)\s*:/,
    );
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

  // metric-primitives.md — the line is drawn "with a tinted area beneath it" (REQ-16)
  it('draws a filled area beneath the line, closed back to the baseline', () => {
    const { container } = render(<Sparkline values={[10, 90, 50]} />);

    const line = sampleLine(container, 3);
    const mark = markedShape(container);
    const area = [...container.querySelectorAll('path')].find((path) => {
      const points = pathPoints(path.getAttribute('d') ?? '');
      return path !== mark?.element && points.length > line.length;
    });
    expect(area, '[REQ-16] nothing is drawn beneath the line').toBeDefined();

    // It carries the line's own samples and closes back down to the baseline at both ends, so what
    // it covers is the region under the line rather than a second curve.
    const points = pathPoints(area!.getAttribute('d') ?? '');
    for (const sample of line) {
      expect(points.some((point) => samePoint(point, sample)), '[REQ-16] the area does not follow the line').toBe(true);
    }
    const baseline = Math.max(...points.map((point) => point.y));
    expect(baseline, '[REQ-16] the area does not reach below the line').toBeGreaterThan(Math.max(...line.map((point) => point.y)));
    const onBaseline = points.filter((point) => point.y === baseline);
    expect(Math.min(...onBaseline.map((point) => point.x))).toBe(Math.min(...points.map((point) => point.x)));
    expect(Math.max(...onBaseline.map((point) => point.x))).toBe(Math.max(...points.map((point) => point.x)));

    // And it is filled rather than stroked: an outline beneath the line is not an area.
    const painted = area!.getAttribute('class')!.split(' ')[0]!;
    const declared = metricsRules((selector) => selector.split(',').some((one) => one.trim() === `.${painted}`))
      .map((rule) => rule.declarations)
      .join(' ');
    expect(declared, '[REQ-16] the area beneath the line is given no fill').toMatch(/fill\s*:\s*var\(--[\w-]+\)/);
  });

  // metric-primitives.md — "marks the window's last sample with a point … so the current value is
  // findable without following the line to its end" (REQ-16)
  it('marks the window\'s last sample, and moves the mark when a newer sample arrives', () => {
    const { container, rerender } = render(<Sparkline values={[10, 90, 50]} />);

    const mark = markedShape(container);
    expect(mark, '[REQ-16] nothing marks the end of the line').not.toBeNull();
    const line = sampleLine(container, 3);
    expect(samePoint(mark!.point, line[2]!), '[REQ-16] the mark is not on the window\'s last sample').toBe(true);

    rerender(<Sparkline values={[10, 90, 50, 20]} />);
    const moved = markedShape(container)!;
    const grown = sampleLine(container, 4);
    expect(samePoint(moved.point, grown[3]!), '[REQ-16] the mark stayed on the sample that is no longer the last').toBe(true);
  });

  // metric-primitives.md — "fewer than two values → … and no mark either: there is no last sample to mark"
  it('marks nothing while there is no last sample to mark', () => {
    const { container, unmount } = render(<Sparkline values={[]} />);
    expect(markedShape(container)).toBeNull();
    unmount();

    const single = render(<Sparkline values={[5]} />);
    expect(markedShape(single.container)).toBeNull();
  });

  // metric-primitives.md — the mark is drawn "in the line's own tone"
  it('draws the mark in the tone the line is drawn in', () => {
    const marks = (['neutral', 'accent', 'success', 'warning', 'danger'] as const).map((tone) => {
      const { container, unmount } = render(<Sparkline values={[1, 2, 3]} tone={tone} />);
      const rendered = markedShape(container)!.element.outerHTML;
      unmount();
      return rendered;
    });

    expect(new Set(marks).size, 'two tones draw the same mark').toBe(marks.length);
  });

  // metric-primitives.md — "it runs no animation loop, no timer, and no transition". The line and the
  // mark are repainted by a new sample and by nothing else; a transition or a keyframe declared on
  // either would put the compositor to work on every reading, on a surface that never blurs.
  it('declares no transition and no animation on any part of the line', () => {
    const declared = metricsRules((selector) => selector.includes('.ui-sparkline'));

    expect(declared.length, 'the library declares no sparkline at all').toBeGreaterThan(0);
    for (const rule of declared) {
      expect(rule.declarations, `${rule.selector} animates`).not.toMatch(/(^|;|\s)(transition|animation)(-\w+)?\s*:/);
    }
  });
});

// metric-primitives.md — the prominent value beside the label, and the track's third state
// (plan-docker_management_app-containers_card_view/REQ-7, REQ-13, REQ-16).
describe('Meter — the prominent value and the no-sample state (containers_card_view/REQ-7, REQ-16)', () => {
  // metric-primitives.md — "valueText — the reading shown beside the label, prominently… its
  // presence is what gives label the small uppercase muted treatment"
  it('shows the value beside the label and switches the label to the eyebrow treatment', () => {
    const { container } = render(<Meter label="CPU" valueText="0.4%" value={0.4} max={800} reading="of 8 cores" />);

    expect(container.querySelector('.ui-meter__value')?.textContent).toBe('0.4%');
    expect(container.querySelector('.ui-meter__label--eyebrow')?.textContent).toBe('CPU');
    expect(container.querySelector('.ui-meter__label')).toBeNull();
    expect(container.querySelector('.ui-meter__reading')?.textContent).toBe('of 8 cores');
  });

  // metric-primitives.md — "without it the label keeps the plain one it always had, and the meter
  // renders exactly as it did before this prop existed"
  it('leaves a meter asked for no value exactly as it was', () => {
    const { container } = render(<Meter label="Memory" value={128} max={512} reading="128MB / 512MB" />);

    expect(container.querySelector('.ui-meter__label')?.textContent).toBe('Memory');
    expect(container.querySelector('.ui-meter__label--eyebrow')).toBeNull();
    expect(container.querySelector('.ui-meter__value')).toBeNull();
    expect(container.querySelector('.ui-meter')?.className).toBe('ui-meter');
  });

  // metric-primitives.md — "noSample → nothing was measured: valueText is replaced by —, reading by
  // the words no sample, and the track is drawn empty and fainter, with no fill at all"
  it('states an unmeasured metric as one, in words and in an empty track', () => {
    const { container } = render(<Meter label="CPU" valueText="0.4%" value={0.4} max={800} reading="of 8 cores" noSample />);

    expect(container.querySelector('.ui-meter__value')?.textContent).toBe('—');
    expect(container.querySelector('.ui-meter__reading')?.textContent).toBe('no sample');
    expect(container.querySelector('.ui-meter__track')?.className).toContain('ui-meter__track--no-sample');
    expect(container.querySelector('.ui-meter__fill')).toBeNull();
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe('no sample');
  });

  // metric-primitives.md — a third state, distinct from an unlimited reading and from a measured zero.
  it('draws the three states of a track distinguishably', () => {
    const tracks = [
      <Meter key="measured" label="CPU" valueText="0.0%" value={0} max={800} reading="of 8 cores" />,
      <Meter key="unbounded" label="MEMORY" valueText="12MB" value={12} reading={undefined} />,
      <Meter key="unmeasured" label="CPU" value={0} noSample />,
    ].map((element) => {
      const { container, unmount } = render(element);
      const rendered = {
        track: container.querySelector('.ui-meter__track')!.className,
        value: container.querySelector('.ui-meter__value')?.textContent ?? null,
        reading: container.querySelector('.ui-meter__reading')?.textContent ?? null,
      };
      unmount();
      return rendered;
    });

    expect(new Set(tracks.map((one) => one.track)).size, 'two of the three states draw the same track').toBe(3);
    expect(tracks[0].value).toBe('0.0%');
    expect(tracks[0].reading).toBe('of 8 cores');
    expect(tracks[2].value).toBe('—');
    expect(tracks[2].reading).toBe('no sample');
  });

  // metric-primitives.md — a non-zero measurement always draws a visible fill; a measured zero draws none.
  it('keeps a non-zero measurement visible and draws nothing for a measured zero', () => {
    const { container: tiny, unmount } = render(<Meter label="CPU" valueText="0.1%" value={0.1} max={800} />);
    const fill = tiny.querySelector('.ui-meter__fill')!;
    expect(fill.className).toContain('ui-meter__fill--present');
    unmount();

    const { container: zero } = render(<Meter label="CPU" valueText="0.0%" value={0} max={800} />);
    expect(zero.querySelector('.ui-meter__fill')?.className).not.toContain('ui-meter__fill--present');

    const css = readFileSync(join(process.cwd(), 'src/ui/metrics/metrics.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const present = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((rule) => rule[1].trim() === '.ui-meter__fill--present')
      .map((rule) => rule[2])
      .join(' ');
    expect(present, 'a fill that exists is left free to round away to nothing').toMatch(/min-width:\s*\S+/);
  });
});

// metric-primitives.md — the two directions of one metric, as two readings rather than one string
// (plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-17).
describe('MetricReadingPair (tabs_composition_refactor/REQ-17)', () => {
  // metric-primitives.md — "shows the two values on one baseline, each with its own label beside it"
  it('shows both readings with their own labels, in the order it was given them', () => {
    const { container } = render(
      <MetricReadingPair readings={[{ label: 'in', value: '1.5KB' }, { label: 'out', value: '512B' }]} />,
    );

    const readings = [...container.querySelectorAll('.ui-metric-reading')];
    expect(readings).toHaveLength(2);
    expect(readings[0]!.textContent).toContain('1.5KB');
    expect(readings[0]!.textContent).toContain('in');
    expect(readings[1]!.textContent).toContain('512B');
    expect(readings[1]!.textContent).toContain('out');
  });

  // metric-primitives.md — "gives each of the two a treatment of the library's own so that they are
  // told apart by more than their position: a reader who does not know which comes first can still
  // say which is which"
  it('gives each of the two readings a treatment of its own', () => {
    const { container } = render(
      <MetricReadingPair readings={[{ label: 'read', value: '5.0GB' }, { label: 'written', value: '4.0KB' }]} />,
    );

    const readings = [...container.querySelectorAll('.ui-metric-reading')];
    expect(readings[0]!.className, 'the two readings carry the same treatment').not.toBe(readings[1]!.className);

    // "both are named design values": the distinction is two tokens, not two literals written here.
    const roles = ['.ui-metric-reading--first', '.ui-metric-reading--second'].map((role) =>
      metricsRules((selector) => selector.includes(role)).map((rule) => rule.declarations).join(' '),
    );
    for (const [index, declarations] of roles.entries()) {
      expect(declarations, `role ${index + 1} carries no treatment of its own`).toMatch(/color\s*:\s*var\(--[\w-]+\)/);
    }
    expect(roles[0], 'the two roles resolve to the same value').not.toBe(roles[1]);
  });

  // metric-primitives.md — "too narrow a box wraps the second reading onto its own line rather than
  // truncating either value"
  it('wraps rather than truncating when the box cannot carry both', () => {
    const pair = metricsRules((selector) => selector.split(',').some((one) => one.trim() === '.ui-metric-reading-pair'))
      .map((rule) => rule.declarations)
      .join(' ');

    expect(pair, 'the pair does not wrap, so a narrow box has to cut a value').toMatch(/flex-wrap\s*:\s*wrap/);

    const values = metricsRules((selector) => selector.includes('.ui-metric-reading__value'))
      .map((rule) => rule.declarations)
      .join(' ');
    expect(values, 'a reading is truncated instead of wrapping').not.toMatch(/text-overflow\s*:|overflow\s*:\s*hidden/);
  });

  // metric-primitives.md — all of the primitives are domain-agnostic and take already-formatted
  // strings: whatever the caller hands over is what is shown.
  it('shows the strings it is handed, whatever they are', () => {
    render(<MetricReadingPair readings={[{ label: 'sent', value: '—' }, { label: 'received', value: '0B' }]} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('0B')).toBeInTheDocument();
    expect(screen.getByText('sent')).toBeInTheDocument();
    expect(screen.getByText('received')).toBeInTheDocument();
  });
});
