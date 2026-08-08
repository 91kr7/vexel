import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useImageDiffStream } from '../../src/data/use-image-diff-stream';

// Stands in for the browser's EventSource: the diff comparison stream's only
// channel (REQ-63, REQ-64), so the tests drive it by emitting events on the
// instance the hook opened.
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

  emit(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: data !== undefined ? JSON.stringify(data) : undefined });
  }
}

function latest(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1]!;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useImageDiffStream (plan-docker_management_app/REQ-63, plan-docker_management_app/REQ-64)', () => {
  // use-image-diff-stream.md — passing undefined keeps the stream closed and the result cleared
  it('opens no stream while url is undefined', () => {
    renderHook(() => useImageDiffStream(undefined));

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // use-image-diff-stream.md — an extraction phase, tagged with which side it belongs to, is collected as progress
  it("collects an extraction-phase progress event tagged with the side it belongs to", () => {
    const { result } = renderHook(() => useImageDiffStream('/api/images/diff/stream?a=img-a&b=img-b'));

    act(() => latest().emit('progress', { phase: 'extracting', side: 'a', extraction: { phase: 'creating' } }));

    expect(result.current.progress).toEqual({ phase: 'extracting', side: 'a', extraction: { phase: 'creating' } });
    expect(result.current.done).toBe(false);
  });

  // use-image-diff-stream.md — a comparing-phase progress event is collected the same way
  it('collects a comparing-phase progress event', () => {
    const { result } = renderHook(() => useImageDiffStream('/api/images/diff/stream?a=img-a&b=img-b'));

    act(() => latest().emit('progress', { phase: 'comparing', comparedPaths: 200, totalPaths: 900 }));

    expect(result.current.progress).toEqual({ phase: 'comparing', comparedPaths: 200, totalPaths: 900 });
  });

  // use-image-diff-stream.md — result is set from the server's result event, arriving just before done becomes true on end
  it('reports the final diff result once the server sends it, then marks done on end', () => {
    const { result } = renderHook(() => useImageDiffStream('/api/images/diff/stream?a=img-a&b=img-b'));
    const payload = { imageIdA: 'img-a', imageIdB: 'img-b', entries: [], addedCount: 0, removedCount: 0, changedCount: 0 };

    act(() => latest().emit('result', payload));
    expect(result.current.result).toEqual(payload);
    expect(result.current.done).toBe(false);

    act(() => latest().emit('end'));
    expect(result.current.done).toBe(true);
    expect(latest().closed).toBe(true);
  });

  // use-image-diff-stream.md — error is set from the server's error event
  it("reports the server's own error message and marks done on an error event", () => {
    const { result } = renderHook(() => useImageDiffStream('/api/images/diff/stream?a=img-a&b=img-b'));

    act(() => latest().emit('error', { message: 'comparison failed' }));

    expect(result.current.done).toBe(true);
    expect(result.current.error).toBe('comparison failed');
  });

  // use-image-diff-stream.md — disconnecting (a new url, or the consuming component unmounting) cancels the in-flight comparison server-side
  it('closes the previous stream when the url changes, cancelling that comparison', () => {
    const { rerender } = renderHook(({ url }) => useImageDiffStream(url), {
      initialProps: { url: '/api/images/diff/stream?a=img-a&b=img-b' as string | undefined },
    });
    const first = latest();

    rerender({ url: '/api/images/diff/stream?a=img-a&b=img-c' });

    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  // use-image-diff-stream.md — unmounting closes the stream, cancelling the comparison
  it('closes the stream on unmount', () => {
    const { unmount } = renderHook(() => useImageDiffStream('/api/images/diff/stream?a=img-a&b=img-b'));
    const source = latest();

    unmount();

    expect(source.closed).toBe(true);
  });

  // use-image-diff-stream.md — passing undefined again clears progress/result/done/error
  it('clears progress, result and done when the url is cleared', () => {
    const { result, rerender } = renderHook(({ url }) => useImageDiffStream(url), {
      initialProps: { url: '/api/images/diff/stream?a=img-a&b=img-b' as string | undefined },
    });
    act(() => latest().emit('result', { imageIdA: 'img-a', imageIdB: 'img-b', entries: [], addedCount: 0, removedCount: 0, changedCount: 0 }));
    act(() => latest().emit('end'));
    expect(result.current.done).toBe(true);

    rerender({ url: undefined });

    expect(result.current.result).toBeUndefined();
    expect(result.current.done).toBe(false);
  });
});
