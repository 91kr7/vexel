import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useContainerStats } from '../../src/data/use-container-stats';
import type { ContainerStatsSample } from '../../src/data/container-stats-client';

// Stands in for the browser's EventSource: the hook's only channel to the
// server, so the tests drive the stream by emitting events on the instances it
// opened.
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
    cpuPercent: 12,
    memoryUsageBytes: 1024,
    memoryLimitBytes: 4096,
    memoryPercent: 25,
    networkRxBytes: 10,
    networkTxBytes: 20,
    blockReadBytes: 30,
    blockWriteBytes: 40,
    pids: 5,
    ...overrides,
  };
}

function emitSamples(source: FakeEventSource, cpuPercents: number[]) {
  cpuPercents.forEach((cpuPercent) => source.emit('sample', JSON.stringify(sample({ cpuPercent }))));
}

/** Lets the batching interval (and any reconnect delay) elapse. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Advances time in small steps until a new stream is opened, reporting how long it took. */
async function timeToReopen(budgetMs = 120_000): Promise<number> {
  const before = FakeEventSource.instances.length;
  for (let elapsed = 0; elapsed < budgetMs; elapsed += 100) {
    await advance(100);
    if (FakeEventSource.instances.length > before) return elapsed + 100;
  }
  return Number.POSITIVE_INFINITY;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useContainerStats (REQ-32)', () => {
  // use-container-stats.md — no stream is opened while there is no container id
  it('opens no stream when the id is undefined', () => {
    renderHook(() => useContainerStats(undefined));

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // use-container-stats.md — the stream is opened for the container's stats endpoint and reported connected
  it('opens the container stats stream and reports it connected', async () => {
    const { result } = renderHook(() => useContainerStats('container-1'));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(latest().url).toContain('/api/containers/container-1/stats/stream');
    expect(result.current.connected).toBe(false);

    await act(async () => latest().emit('open'));
    expect(result.current.connected).toBe(true);
  });

  // use-container-stats.md — samples are applied in batches on a short interval, not one state update per sample
  it('applies arriving samples in batches rather than one render per sample', async () => {
    const { result } = renderHook(() => useContainerStats('container-1'));

    act(() => emitSamples(latest(), [1, 2, 3]));
    expect(result.current.samples).toEqual([]);

    await advance(300);
    expect(result.current.samples.map((entry) => entry.cpuPercent)).toEqual([1, 2, 3]);
  });

  // use-container-stats.md — `latest` is the most recent sample, undefined until the first one arrives
  it('reports the most recent sample as the latest reading', async () => {
    const { result } = renderHook(() => useContainerStats('container-1'));
    expect(result.current.latest).toBeUndefined();

    act(() => emitSamples(latest(), [1, 2, 3]));
    await advance(300);

    expect(result.current.latest?.cpuPercent).toBe(3);
  });

  // use-container-stats.md — the history is bounded: past maxSamples the oldest samples are dropped
  it('drops the oldest samples once the history holds maxSamples', async () => {
    const { result } = renderHook(() => useContainerStats('container-1', { maxSamples: 3 }));

    act(() => emitSamples(latest(), [1, 2, 3]));
    await advance(300);
    act(() => emitSamples(latest(), [4, 5]));
    await advance(300);

    expect(result.current.samples.map((entry) => entry.cpuPercent)).toEqual([3, 4, 5]);
  });

  // use-container-stats.md — the default history holds 60 samples
  it('retains 60 samples by default', async () => {
    const { result } = renderHook(() => useContainerStats('container-1'));

    act(() => emitSamples(latest(), Array.from({ length: 65 }, (_, index) => index + 1)));
    await advance(300);

    expect(result.current.samples).toHaveLength(60);
    expect(result.current.samples[0].cpuPercent).toBe(6);
    expect(result.current.samples[59].cpuPercent).toBe(65);
  });

  // use-container-stats.md — restart() closes the current stream, empties the history and opens a new one
  it('restarts by closing the current stream, emptying the history and opening a new one', async () => {
    const { result } = renderHook(() => useContainerStats('container-1'));
    act(() => emitSamples(latest(), [1]));
    await advance(300);
    const first = latest();

    await act(async () => result.current.restart());

    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(result.current.samples).toEqual([]);
    expect(result.current.latest).toBeUndefined();
  });

  // use-container-stats.md — `ended` is set on the server's end event, and the stream is not reopened afterwards
  it('reports the stream ended and does not reopen it', async () => {
    const { result } = renderHook(() => useContainerStats('container-1'));
    act(() => emitSamples(latest(), [7]));

    await act(async () => latest().emit('end'));
    await advance(300);

    expect(result.current.ended).toBe(true);
    expect(result.current.connected).toBe(false);
    expect(result.current.samples.map((entry) => entry.cpuPercent)).toEqual([7]);

    await advance(120_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  // use-container-stats.md — a server-reported failure is surfaced verbatim
  it('surfaces a server-reported failure verbatim', async () => {
    const { result } = renderHook(() => useContainerStats('container-1'));

    await act(async () => latest().emit('error', JSON.stringify({ message: 'No such container: container-1' })));

    expect(result.current.error).toBe('No such container: container-1');
  });

  // use-container-stats.md — the failure message is cleared once a subsequent attempt connects
  it('clears the failure once a later attempt connects', async () => {
    const { result } = renderHook(() => useContainerStats('container-1'));

    await act(async () => latest().emit('error'));
    expect(result.current.error).toBeTruthy();

    await timeToReopen();
    await act(async () => latest().emit('open'));

    expect(result.current.error).toBeUndefined();
    expect(result.current.connected).toBe(true);
  });

  // use-container-stats.md — after an unexpected drop the stream is reopened, waiting longer on each consecutive failure, up to a cap
  it('reopens the stream after a drop, with a delay that grows with consecutive failures and is capped', async () => {
    renderHook(() => useContainerStats('container-1'));

    await act(async () => latest().emit('error'));
    const firstDelay = await timeToReopen();
    expect(firstDelay).toBeLessThan(120_000);

    await act(async () => latest().emit('error'));
    const secondDelay = await timeToReopen();
    expect(secondDelay).toBeGreaterThan(firstDelay);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await act(async () => latest().emit('error'));
      const delay = await timeToReopen();
      expect(delay).toBeLessThanOrEqual(60_000);
    }
  });

  // use-container-stats.md — `enabled: false` opens no stream
  it('opens no stream while it is disabled', () => {
    renderHook(() => useContainerStats('container-1', { enabled: false }));

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // use-container-stats.md — disabling closes an open stream; re-enabling opens a new one with an empty history
  it('closes the open stream when disabled and reopens it when enabled again', async () => {
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => useContainerStats('container-1', { enabled }), {
      initialProps: { enabled: true },
    });
    act(() => emitSamples(latest(), [1]));
    await advance(300);
    const first = latest();

    await act(async () => rerender({ enabled: false }));

    expect(first.closed).toBe(true);
    expect(result.current.samples).toEqual([]);
    await advance(120_000);
    expect(FakeEventSource.instances).toHaveLength(1);

    await act(async () => rerender({ enabled: true }));
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  // use-container-stats.md — changing the id empties the history and opens a stream for the new container
  it('empties the history and reopens the stream when the container changes', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useContainerStats(id), {
      initialProps: { id: 'container-1' },
    });
    act(() => emitSamples(latest(), [1]));
    await advance(300);
    const first = latest();

    await act(async () => rerender({ id: 'container-2' }));

    expect(first.closed).toBe(true);
    expect(result.current.samples).toEqual([]);
    expect(latest().url).toContain('/api/containers/container-2/stats/stream');
  });

  // use-container-stats.md — changing maxSamples empties the history
  it('empties the history when the retained window changes', async () => {
    const { result, rerender } = renderHook(({ maxSamples }: { maxSamples: number }) => useContainerStats('container-1', { maxSamples }), {
      initialProps: { maxSamples: 10 },
    });
    act(() => emitSamples(latest(), [1, 2]));
    await advance(300);
    expect(result.current.samples).toHaveLength(2);

    await act(async () => rerender({ maxSamples: 5 }));

    expect(result.current.samples).toEqual([]);
  });

  // use-container-stats.md — the stream is closed when the caller unmounts (that is what stops the daemon-side stream) and not reopened
  it('closes the stream on unmount without reopening it', async () => {
    const { unmount } = renderHook(() => useContainerStats('container-1'));
    const source = latest();

    unmount();

    expect(source.closed).toBe(true);
    await advance(120_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
