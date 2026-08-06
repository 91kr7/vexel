import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useContainerLogs } from '../../src/data/use-container-logs';
import type { ContainerLogLine } from '../../src/data/container-logs-client';

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

function emitLines(source: FakeEventSource, texts: string[], startSeq = 1) {
  texts.forEach((text, index) => {
    const line: ContainerLogLine = { seq: startSeq + index, stream: 'stdout', text };
    source.emit('line', JSON.stringify(line));
  });
}

/** Lets the batching interval (and any reconnect delay) elapse. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
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

describe('useContainerLogs (REQ-30, REQ-31)', () => {
  // use-container-logs.md — no stream is opened while there is no container id
  it('opens no stream when the id is undefined', () => {
    renderHook(() => useContainerLogs(undefined));

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // use-container-logs.md — the stream is opened for the container's log endpoint and reported connected
  it('opens the container log stream and reports it connected', async () => {
    const { result } = renderHook(() => useContainerLogs('container-1'));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(latest().url).toContain('/api/containers/container-1/logs/stream');
    expect(result.current.connected).toBe(false);

    await act(async () => latest().emit('open'));
    expect(result.current.connected).toBe(true);
  });

  // use-container-logs.md — lines are applied in batches on a short interval, not one state update per line
  it('applies arriving lines in batches rather than one render per line', async () => {
    const { result } = renderHook(() => useContainerLogs('container-1'));

    act(() => emitLines(latest(), ['one', 'two', 'three']));
    expect(result.current.lines).toEqual([]);

    await advance(100);
    expect(result.current.lines.map((line) => line.text)).toEqual(['one', 'two', 'three']);
  });

  // use-container-logs.md — the buffer is bounded: past maxLines the oldest lines are dropped
  it('drops the oldest lines once the buffer holds maxLines', async () => {
    const { result } = renderHook(() => useContainerLogs('container-1', { maxLines: 3 }));

    act(() => emitLines(latest(), ['1', '2', '3']));
    await advance(100);
    act(() => emitLines(latest(), ['4', '5'], 4));
    await advance(100);

    expect(result.current.lines.map((line) => line.text)).toEqual(['3', '4', '5']);
  });

  // use-container-logs.md — snapshot() includes the lines received but not yet reflected in `lines`
  it('snapshots the buffer including the lines not yet flushed', async () => {
    const { result } = renderHook(() => useContainerLogs('container-1'));

    act(() => emitLines(latest(), ['flushed']));
    await advance(100);
    act(() => emitLines(latest(), ['pending'], 2));

    expect(result.current.lines.map((line) => line.text)).toEqual(['flushed']);
    expect(result.current.snapshot().map((line) => line.text)).toEqual(['flushed', 'pending']);
  });

  // use-container-logs.md — clear() empties the buffer without closing the stream
  it('clears the buffer without closing the stream', async () => {
    const { result } = renderHook(() => useContainerLogs('container-1'));
    act(() => emitLines(latest(), ['before clear']));
    await advance(100);

    const source = latest();
    act(() => result.current.clear());

    expect(result.current.lines).toEqual([]);
    expect(source.closed).toBe(false);
    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => emitLines(source, ['after clear'], 2));
    await advance(100);
    expect(result.current.lines.map((line) => line.text)).toEqual(['after clear']);
  });

  // use-container-logs.md — restart() closes the current stream and opens a new one, emptying the buffer first
  it('restarts by closing the current stream, emptying the buffer and opening a new one', async () => {
    const { result } = renderHook(() => useContainerLogs('container-1'));
    act(() => emitLines(latest(), ['old line']));
    await advance(100);
    const first = latest();

    await act(async () => result.current.restart());

    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(result.current.lines).toEqual([]);
  });

  // use-container-logs.md — `ended` is set on the server's end event, and the stream is not reopened afterwards
  it('reports the stream ended and does not reopen it', async () => {
    const { result } = renderHook(() => useContainerLogs('container-1', { follow: false }));
    act(() => emitLines(latest(), ['last line']));

    await act(async () => latest().emit('end'));

    expect(result.current.ended).toBe(true);
    expect(result.current.connected).toBe(false);
    expect(result.current.lines.map((line) => line.text)).toEqual(['last line']);

    await advance(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  // use-container-logs.md — after an unexpected drop the stream is reopened, with a delay growing with consecutive failures
  it('reopens the stream after a drop, waiting longer on each consecutive failure', async () => {
    renderHook(() => useContainerLogs('container-1'));

    await act(async () => latest().emit('error'));
    await advance(900);
    expect(FakeEventSource.instances).toHaveLength(1);
    await advance(200);
    expect(FakeEventSource.instances).toHaveLength(2);

    await act(async () => latest().emit('error'));
    await advance(1100);
    expect(FakeEventSource.instances).toHaveLength(2);
    await advance(1000);
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  // use-container-logs.md — a server-reported failure is surfaced and the stream is not reopened
  it('surfaces a server-reported failure verbatim and stops', async () => {
    const { result } = renderHook(() => useContainerLogs('container-1'));

    await act(async () => latest().emit('error', JSON.stringify({ message: 'No such container: container-1' })));

    expect(result.current.error).toBe('No such container: container-1');
    await advance(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  // use-container-logs.md — the failure message is cleared once a subsequent attempt connects
  it('clears the failure once a later attempt connects', async () => {
    const { result } = renderHook(() => useContainerLogs('container-1'));

    await act(async () => latest().emit('error'));
    expect(result.current.error).toBeTruthy();

    await advance(1100);
    await act(async () => latest().emit('open'));

    expect(result.current.error).toBeUndefined();
    expect(result.current.connected).toBe(true);
  });

  // use-container-logs.md — changing the id empties the buffer and opens a stream for the new container
  it('empties the buffer and reopens the stream when the container changes', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useContainerLogs(id), {
      initialProps: { id: 'container-1' },
    });
    act(() => emitLines(latest(), ['from the first container']));
    await advance(100);
    const first = latest();

    await act(async () => rerender({ id: 'container-2' }));

    expect(first.closed).toBe(true);
    expect(result.current.lines).toEqual([]);
    expect(latest().url).toContain('/api/containers/container-2/logs/stream');
  });

  // use-container-logs.md — changing an option opens a stream for the new parameters
  it('reopens the stream with the new parameters when an option changes', async () => {
    const { rerender } = renderHook(({ timestamps }: { timestamps: boolean }) => useContainerLogs('container-1', { timestamps }), {
      initialProps: { timestamps: false },
    });
    expect(latest().url).not.toContain('timestamps=true');

    await act(async () => rerender({ timestamps: true }));

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(latest().url).toContain('timestamps=true');
  });

  // use-container-logs.md — the stream is closed when the caller unmounts, and not reopened
  it('closes the stream on unmount without reopening it', async () => {
    const { unmount } = renderHook(() => useContainerLogs('container-1'));
    const source = latest();

    unmount();

    expect(source.closed).toBe(true);
    await advance(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
