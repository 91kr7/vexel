import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerStatsView } from '../../src/containers/ContainerStatsView';
import type { ContainerState, ContainerSummary } from '../../src/data/containers-client';
import type { ContainerStatsSample } from '../../src/data/container-stats-client';

function containerIn(state: ContainerState): ContainerSummary {
  return {
    id: 'container-1',
    shortId: 'container1',
    name: 'web-nginx',
    image: 'nginx:1.27',
    state,
    status: state === 'running' ? 'Up 3 days' : 'Exited (0) 2 hours ago',
    ports: [],
  };
}

const running = containerIn('running');

// The view's stats subscription reaches the server through EventSource, which
// jsdom does not provide; the fake lets the test play the server's part.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private listeners = new Map<string, Array<(event: unknown) => void>>();
  closed = false;

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

function latest(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1];
}

function sample(overrides: Partial<ContainerStatsSample> = {}): ContainerStatsSample {
  return {
    at: '2026-08-06T10:00:00.000Z',
    cpuPercent: 42.6,
    memoryUsageBytes: 256 * 1024 * 1024,
    memoryLimitBytes: 512 * 1024 * 1024,
    memoryPercent: 50,
    networkRxBytes: 1536,
    networkTxBytes: 512,
    blockReadBytes: 5 * 1024 * 1024 * 1024,
    blockWriteBytes: 4096,
    pids: 7,
    ...overrides,
  };
}

function emit(...samples: ContainerStatsSample[]) {
  const source = latest();
  act(() => samples.forEach((entry) => source.emit('sample', JSON.stringify(entry))));
}

/** The class attributes of the element carrying `text` and of its ancestors: where a tone can land. */
function toneMarkers(text: string): string {
  let node: HTMLElement | null = screen.getByText(text);
  const classes: string[] = [];
  while (node) {
    classes.push(node.className);
    node = node.parentElement;
  }
  return classes.join('|');
}

/** The metric tiles the view draws, in document order, keyed by the label each carries. */
function tilesByLabel(dom: HTMLElement): Map<string, HTMLElement> {
  const found = new Map<string, HTMLElement>();
  for (const tile of dom.querySelectorAll<HTMLElement>('.ui-metric-tile')) {
    found.set((tile.querySelector('.ui-metric-tile__label')?.textContent ?? '').trim(), tile);
  }
  return found;
}

/** The labels of the tiles placed in each of the view's groups, group order preserved. */
function groupedTileLabels(dom: HTMLElement): string[][] {
  return [...dom.querySelectorAll<HTMLElement>('.ui-grid')].map((grid) =>
    [...grid.querySelectorAll('.ui-metric-tile__label')].map((label) => (label.textContent ?? '').trim()),
  );
}

interface Point {
  x: number;
  y: number;
}

/** Every coordinate pair of an SVG path's `d`, in the order it draws them. */
function pathPoints(d: string): Point[] {
  return [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((pair) => ({ x: Number(pair[1]), y: Number(pair[2]) }));
}

function samePoint(one: Point, other: Point): boolean {
  return Math.abs(one.x - other.x) < 0.01 && Math.abs(one.y - other.y) < 0.01;
}

/**
 * The polyline the sparkline draws through its samples: the one shape carrying exactly one
 * coordinate per sample. Read from geometry rather than from a class name, so what is pinned is
 * where the line goes and not how it is spelled.
 */
function sampleLine(svg: Element, sampleCount: number): Point[] {
  for (const path of svg.querySelectorAll('path')) {
    const points = pathPoints(path.getAttribute('d') ?? '');
    if (points.length === sampleCount) return points;
  }
  return [];
}

/**
 * The single point the sparkline marks, whatever shape carries it: a shape drawn entirely at one
 * coordinate. `null` when nothing is marked.
 */
function markedPoint(svg: Element): Point | null {
  for (const circle of svg.querySelectorAll('circle')) {
    return { x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')) };
  }
  for (const path of svg.querySelectorAll('path')) {
    const points = pathPoints(path.getAttribute('d') ?? '');
    if (points.length > 0 && points.every((point) => samePoint(point, points[0]!))) return points[0]!;
  }
  return null;
}

/** The class attributes of `element` and of its ancestors up to `stop`: where a treatment can land. */
function treatmentOf(element: Element, stop: Element): string {
  const classes: string[] = [];
  let node: Element | null = element;
  while (node && node !== stop) {
    classes.push(node.className);
    node = node.parentElement;
  }
  return classes.join('|');
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ContainerStatsView (REQ-32)', () => {
  // container-stats-view.md — a placeholder stands in until the first sample arrives
  it('waits for the first sample before showing any reading', () => {
    render(<ContainerStatsView container={running} />);

    expect(screen.getByText(/Waiting for the first sample/i)).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-32 — CPU %, memory used/limit, network in/out and block I/O are shown
  it('shows the CPU, memory, network, block-I/O and pid readings of the container', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    emit(sample());

    await waitFor(() => expect(screen.queryByText(/Waiting for the first sample/i)).not.toBeInTheDocument(), { timeout: 2000 });

    for (const label of ['CPU', 'Memory', 'Net I/O', 'Block I/O', 'PIDs']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // CPU: rounded above 10%
    expect(dom.textContent).toMatch(/43\s?%/);
    // Memory: used amount, with the limit alongside it
    expect(dom.textContent).toMatch(/256(\.0)?\s?MB/);
    expect(dom.textContent).toMatch(/512(\.0)?\s?MB/);
    // Net I/O: the inbound and the outbound amount, each a reading of its own (REQ-17)
    expect(dom.textContent).toMatch(/1\.5\s?KB/);
    expect(dom.textContent).toMatch(/512\s?B/);
    // Block I/O: the amount read and the amount written, likewise
    expect(dom.textContent).toMatch(/5\.0\s?GB/);
    expect(dom.textContent).toMatch(/4\.0\s?KB/);
    // PIDs
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-32 — the readings keep updating while the view is open, with no user action
  it('keeps updating the readings as samples arrive', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    emit(sample({ cpuPercent: 42.6 }));
    await waitFor(() => expect(dom.textContent).toMatch(/43\s?%/), { timeout: 2000 });

    emit(sample({ cpuPercent: 88.2, pids: 9 }));

    await waitFor(() => expect(dom.textContent).toMatch(/88\s?%/), { timeout: 2000 });
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(dom.textContent).not.toMatch(/43\s?%/);
  });

  // container-stats-view.md — percentages carry one decimal below 10% and are rounded above it
  it('formats a percentage below 10% with one decimal', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    emit(sample({ cpuPercent: 4.24 }));

    await waitFor(() => expect(dom.textContent).toMatch(/4\.2\s?%/), { timeout: 2000 });
  });

  // container-stats-view.md — CPU readings are toned: neutral up to 70%, warning from 70%, danger from 90%
  it('tones the CPU reading differently below 70%, from 70% and from 90%', async () => {
    const markers: string[] = [];
    for (const [cpuPercent, reading] of [
      [20, '20%'],
      [75, '75%'],
      [95, '95%'],
    ] as const) {
      const view = render(<ContainerStatsView container={running} />);
      emit(sample({ cpuPercent }));
      await screen.findByText(reading, undefined, { timeout: 2000 });
      markers.push(toneMarkers(reading).replaceAll(reading, ''));
      view.unmount();
      cleanup();
    }

    expect(new Set(markers).size).toBe(3);
  });

  // container-stats-view.md — with no memory limit the sub-label says so and the meter is the
  // no-measurable-maximum one. Re-asserted deliberately under REQ-15 and not left inherited: this is
  // the case that proves the library rule was **narrowed** rather than abandoned. A maximum unknown
  // at this moment — a container running with no memory limit set — still asks for a `Meter` and
  // still gets the drawn state that says so; only a quantity with no maximum *in principle* stops
  // asking (metric-primitives.md, plan-ui-coherence-optimisation/REQ-64).
  it('states that there is no memory limit and gives the memory meter the no-maximum state', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    emit(sample({ memoryLimitBytes: 0, memoryPercent: 0 }));

    await waitFor(() => expect(dom.textContent).toMatch(/256(\.0)?\s?MB/), { timeout: 2000 });

    expect(dom.textContent).toMatch(/no.*limit|unlimited/i);
    const memoryMeter = screen.getAllByRole('meter').find((meter) => (meter.getAttribute('aria-label') ?? '').toLowerCase().includes('memory'));
    expect(memoryMeter).toBeDefined();
    expect(Number(memoryMeter!.getAttribute('aria-valuenow'))).toBe(0);
    expect(memoryMeter!.getAttribute('aria-valuetext')).toMatch(/no.*maximum/i);
  });

  // container-stats-view.md — every tile still carries its label, its reading, its sub-label and a
  // sparkline. What no longer holds is that all five are built alike:
  // plan-ui-coherence-optimisation/REQ-64 ("a tile without a meter is a defect and not a variant")
  // is superseded by REQ-14 and REQ-15, which make the meter a property of the metric.
  it('builds every tile with its label, its reading, its sub-label and one sparkline of its own', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    emit(sample(), sample({ at: '2026-08-06T10:00:02.000Z', cpuPercent: 44 }));

    await waitFor(() => expect(dom.querySelectorAll('.ui-metric-tile').length).toBe(5), { timeout: 2000 });

    for (const [label, tile] of tilesByLabel(dom)) {
      expect(label, 'a tile carries no label').not.toBe('');
      expect(tile.querySelector('.ui-metric-tile__value')?.textContent?.trim(), `${label} carries no reading`).toBeTruthy();
      expect(tile.querySelector('.ui-metric-tile__sub-label')?.textContent?.trim(), `${label} carries no sub-label`).toBeTruthy();
      expect(tile.querySelectorAll('svg'), `${label} carries no sparkline, or more than one`).toHaveLength(1);
    }
  });

  // REQ-15 — "Net I/O, Block I/O and PIDs carry no meter at all — no bar, and no 'no measurable
  // maximum' state of one". This supersedes plan-ui-coherence-optimisation/REQ-64, which required a
  // meter on all five and the no-measurable-maximum state on exactly these three; the library rule
  // it rests on is narrowed rather than abandoned (see the memory-limit test above, where a maximum
  // unknown at this moment still asks for a meter and still gets the state that says so).
  it('gives Net I/O, Block I/O and PIDs no meter at all, not even a track drawn empty', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    emit(sample());

    await waitFor(() => expect(dom.querySelectorAll('.ui-metric-tile').length).toBe(5), { timeout: 2000 });

    for (const label of ['Net I/O', 'Block I/O', 'PIDs']) {
      const tile = tilesByLabel(dom).get(label)!;
      expect(tile, `${label} is not drawn at all`).toBeDefined();
      expect(tile.querySelectorAll('[role="meter"]'), `[REQ-15] ${label} still carries a meter`).toHaveLength(0);
      // Not a meter in another state, and not a bar collapsed to nothing either: no part of the
      // component is drawn at all.
      expect(tile.querySelectorAll('.ui-meter, .ui-meter__track, .ui-meter__fill'), `[REQ-15] ${label} still carries a bar`).toHaveLength(0);
    }

    expect(
      [...dom.querySelectorAll('[role="meter"]')].map((meter) => meter.getAttribute('aria-label')).sort(),
      '[REQ-14/REQ-15] the meters are not exactly the two metrics that have a ceiling',
    ).toEqual(['CPU usage', 'Memory usage']);
  });

  // REQ-14 — "CPU and Memory each keep a meter, filled in proportion to the ceiling each of them has"
  it('keeps a meter on CPU and on Memory, each filled in proportion to its own ceiling', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    emit(sample({ cpuPercent: 25, memoryUsageBytes: 128 * 1024 * 1024, memoryLimitBytes: 512 * 1024 * 1024, memoryPercent: 25 }));

    await waitFor(() => expect(dom.querySelectorAll('.ui-metric-tile').length).toBe(5), { timeout: 2000 });

    for (const [label, expectedFill] of [['CPU', 25], ['Memory', 25]] as const) {
      const tile = tilesByLabel(dom).get(label)!;
      const meters = tile.querySelectorAll('[role="meter"]');
      expect(meters, `[REQ-14] ${label} carries no meter, or more than one`).toHaveLength(1);
      const meter = meters[0]!;
      expect(Number(meter.getAttribute('aria-valuenow')), `[REQ-14] ${label} is not filled against its own ceiling`).toBeCloseTo(expectedFill, 1);
      expect(meter.getAttribute('aria-valuetext'), `[REQ-14] ${label} announces no measurable maximum though it has one`).toBeNull();
    }
  });

  // REQ-13 — "Stats is arranged as two groups instead of five equal tiles on one row: CPU and Memory
  // on a row of two, then Net I/O, Block I/O and PIDs on a row of three." This supersedes
  // plan-ui-coherence-optimisation/REQ-63 (five tiles, one row, one track per tile); its own reason
  // survives, since 2 + 3 orphans no metric either. What REQ-63 asked and REQ-13 repeats — the
  // arrangement stated "as a shape, never as a count of columns or a width" — is asserted here.
  it('lays the tiles out as two even-row groups of two and three, stating no track template of its own', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    emit(sample());

    await waitFor(() => expect(dom.querySelectorAll('.ui-metric-tile').length).toBe(5), { timeout: 2000 });

    const grids = [...dom.querySelectorAll<HTMLElement>('.ui-grid')];
    expect(grids, '[REQ-13] the tiles are not laid out as two library grids').toHaveLength(2);
    for (const grid of grids) {
      expect(grid.classList.contains('ui-grid--even-row'), '[REQ-13] a group is not the named even-row arrangement').toBe(true);
      expect(grid.style.gridTemplateColumns, '[REQ-13] the view states a track template of its own').toBe('');
      expect(grid.style.gap, '[REQ-13] the view states a gap of its own').toBe('');
    }

    expect(groupedTileLabels(dom), '[REQ-13] the two groups do not hold the metrics they are named for').toEqual([
      ['CPU', 'Memory'],
      ['Net I/O', 'Block I/O', 'PIDs'],
    ]);
    // The track count is the child count by construction: each group holds exactly the tiles it is
    // named for and nothing else, so no metric is left alone on a row the others do not share.
    expect(grids[0]!.children).toHaveLength(2);
    expect(grids[1]!.children).toHaveLength(3);
  });

  // REQ-15 / container-stats-view.md — "Each of the three sparklines plots the one series its tile is
  // named for, not the two summed: inbound, read, and the count."
  it('plots each uncapped tile on its own series rather than on the two summed', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    // Three samples in which each series and the sum of its pair take different shapes: with two
    // samples every curve normalises to the same one, and a sum would pass unnoticed.
    emit(
      sample({ at: '2026-08-06T10:00:00.000Z', networkRxBytes: 0, networkTxBytes: 0, blockReadBytes: 0, blockWriteBytes: 0, pids: 1 }),
      sample({ at: '2026-08-06T10:00:02.000Z', networkRxBytes: 50, networkTxBytes: 100, blockReadBytes: 50, blockWriteBytes: 100, pids: 5 }),
      sample({ at: '2026-08-06T10:00:04.000Z', networkRxBytes: 100, networkTxBytes: 0, blockReadBytes: 100, blockWriteBytes: 0, pids: 9 }),
    );

    await waitFor(() => expect(dom.querySelectorAll('.ui-metric-tile').length).toBe(5), { timeout: 2000 });

    const expectedShapes: [string, number[]][] = [
      ['Net I/O', [0, 50, 100]],
      ['Block I/O', [0, 50, 100]],
      ['PIDs', [1, 5, 9]],
    ];
    for (const [label, series] of expectedShapes) {
      const svg = tilesByLabel(dom).get(label)!.querySelector('svg')!;
      const drawn = sampleLine(svg, series.length);
      expect(drawn, `[REQ-15] ${label} draws no line through its three samples`).toHaveLength(series.length);

      // The shape is read back off the line without knowing its scale: each sample's rise above the
      // first, as a share of the whole rise, is the same share the values themselves take. A curve
      // drawn on the two directions summed does not have that shape.
      const rise = drawn[0]!.y - drawn[drawn.length - 1]!.y;
      const drawnShares = drawn.map((point) => (drawn[0]!.y - point.y) / rise);
      const valueShares = series.map((value) => (value - series[0]!) / (series[series.length - 1]! - series[0]!));
      for (const [index, share] of valueShares.entries()) {
        expect(drawnShares[index]!, `[REQ-15] ${label} plots a curve its own reading does not name`).toBeCloseTo(share, 2);
      }
    }
  });

  // REQ-16 — "A sparkline draws a filled area beneath its line and marks its final point, so the
  // current value is findable without reading the line."
  it('marks the last sample of every sparkline it draws, and moves the mark as samples arrive', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    // Every series moves: a flat line is drawn at one coordinate throughout, and a mark on it
    // could not be told from the line itself.
    emit(
      sample({ at: '2026-08-06T10:00:00.000Z', cpuPercent: 10, pids: 2, memoryUsageBytes: 64 * 1024 * 1024, networkRxBytes: 100, blockReadBytes: 100 }),
      sample({ at: '2026-08-06T10:00:02.000Z', cpuPercent: 90, pids: 8, memoryUsageBytes: 256 * 1024 * 1024, networkRxBytes: 900, blockReadBytes: 900 }),
      sample({ at: '2026-08-06T10:00:04.000Z', cpuPercent: 50, pids: 4, memoryUsageBytes: 128 * 1024 * 1024, networkRxBytes: 400, blockReadBytes: 400 }),
    );

    await waitFor(() => expect(dom.querySelectorAll('.ui-metric-tile').length).toBe(5), { timeout: 2000 });

    for (const [label, tile] of tilesByLabel(dom)) {
      const svg = tile.querySelector('svg')!;
      const line = sampleLine(svg, 3);
      const mark = markedPoint(svg);
      expect(mark, `[REQ-16] ${label} marks no point of its line`).not.toBeNull();
      expect(samePoint(mark!, line[line.length - 1]!), `[REQ-16] ${label} marks a point that is not its last sample`).toBe(true);
    }

    const pidsSvg = () => tilesByLabel(dom).get('PIDs')!.querySelector('svg')!;
    const before = markedPoint(pidsSvg())!;
    emit(sample({ at: '2026-08-06T10:00:06.000Z', pids: 1 }));

    await waitFor(() => {
      const svg = pidsSvg();
      const line = sampleLine(svg, 4);
      const mark = markedPoint(svg)!;
      expect(line, '[REQ-16] the fourth sample was never drawn').toHaveLength(4);
      expect(samePoint(mark, line[3]!), '[REQ-16] the mark stayed behind when a newer sample arrived').toBe(true);
    }, { timeout: 2000 });
    expect(markedPoint(pidsSvg())).not.toEqual(before);
  });

  // REQ-17 — "Net I/O shows its inbound and its outbound value as two separately labelled and
  // visually distinguished values, and Block I/O its read and its write value likewise; neither is
  // one `a / b` string in which the two differ only by position."
  it('shows Net I/O and Block I/O as two labelled readings told apart by more than their position', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    emit(sample());

    await waitFor(() => expect(dom.querySelectorAll('.ui-metric-tile').length).toBe(5), { timeout: 2000 });

    const expected: [string, [string, RegExp], [string, RegExp]][] = [
      ['Net I/O', ['in', /1\.5\s?KB/], ['out', /512\s?B/]],
      ['Block I/O', ['read', /5\.0\s?GB/], ['written', /4\.0\s?KB/]],
    ];
    for (const [label, first, second] of expected) {
      const value = tilesByLabel(dom).get(label)!.querySelector('.ui-metric-tile__value')!;
      const readings = [...value.querySelectorAll('.ui-metric-reading')];
      expect(readings, `[REQ-17] ${label} does not show exactly two readings`).toHaveLength(2);

      for (const [index, [readingLabel, amount]] of [first, second].entries()) {
        const reading = readings[index]!;
        expect(reading.textContent, `[REQ-17] ${label}'s reading ${index + 1} is not labelled "${readingLabel}"`).toContain(readingLabel);
        expect(reading.textContent ?? '', `[REQ-17] ${label}'s reading ${index + 1} does not carry its own amount`).toMatch(amount);
      }

      // Told apart by their own treatment, not merely by which comes first.
      const treatments = readings.map((reading) => treatmentOf(reading.querySelector('.ui-metric-reading__value')!, value));
      expect(new Set(treatments).size, `[REQ-17] ${label}'s two readings are drawn identically`).toBe(2);

      // And not the delivered `a / b` string, in which they differed only by position.
      expect(value.textContent ?? '', `[REQ-17] ${label} still reads as one a / b string`).not.toMatch(/\d\s*(B|KB|MB|GB|TB)\s*\/\s*\d/);
    }
  });

  // container-stats-view.md — a container that is not up gets a placeholder, and no stream is opened at all
  it('opens no stream for a container that is neither running, paused nor restarting', () => {
    const { container: dom } = render(<ContainerStatsView container={containerIn('exited')} />);

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(dom.textContent).toMatch(/usage/i);
    expect(screen.queryByText(/Waiting for the first sample/i)).not.toBeInTheDocument();
  });

  // container-stats-view.md — a paused container is still measured (the daemon reports usage while it is up)
  it('opens the stream for a paused container', () => {
    render(<ContainerStatsView container={containerIn('paused')} />);

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  // container-stats-view.md — a stream failure is shown verbatim with a retry that reopens the stream
  it('shows the stream failure verbatim and reopens the stream on retry', async () => {
    const user = userEvent.setup();
    render(<ContainerStatsView container={running} />);

    act(() => latest().emit('error', JSON.stringify({ message: 'No such container: container-1' })));

    expect(await screen.findByText('No such container: container-1')).toBeInTheDocument();
    const opened = FakeEventSource.instances.length;

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(FakeEventSource.instances.length).toBe(opened + 1));
  });

  // container-stats-view.md — leaving the view closes the subscription, which is what stops the daemon-side stream
  it('closes the stats stream when the view is left', () => {
    const { unmount } = render(<ContainerStatsView container={running} />);
    const source = latest();

    unmount();

    expect(source.closed).toBe(true);
  });
});
