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

  constructor(public url: string) {
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
    // Net I/O: received / sent
    expect(dom.textContent).toMatch(/1\.5\s?KB/);
    expect(dom.textContent).toMatch(/512\s?B/);
    // Block I/O: read / written
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

  // container-stats-view.md — with no memory limit the sub-label says so and the meter is left unfilled
  it('states that there is no memory limit and leaves the memory meter empty', async () => {
    const { container: dom } = render(<ContainerStatsView container={running} />);
    emit(sample({ memoryLimitBytes: 0, memoryPercent: 0 }));

    await waitFor(() => expect(dom.textContent).toMatch(/256(\.0)?\s?MB/), { timeout: 2000 });

    expect(dom.textContent).toMatch(/no.*limit|unlimited/i);
    const memoryMeter = screen.getAllByRole('meter').find((meter) => (meter.getAttribute('aria-label') ?? '').toLowerCase().includes('memory'));
    expect(memoryMeter).toBeDefined();
    expect(Number(memoryMeter!.getAttribute('aria-valuenow'))).toBe(0);
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
