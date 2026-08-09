import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useImageChangesetStream } from '../../src/data/use-image-changesets';

// Stands in for the browser's EventSource: the hook's only channel to the
// changeset analysis progress stream (REQ-49, REQ-51), so the tests drive it
// by emitting events on the instances it opened.
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

describe('useImageChangesetStream (plan-docker_management_app/REQ-49, plan-docker_management_app/REQ-51)', () => {
  // use-image-changeset-stream.md — passing undefined keeps the stream closed and the result cleared
  it('opens no stream while url is undefined', () => {
    renderHook(() => useImageChangesetStream(undefined));

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // use-image-changeset-stream.md — collects export/analysis progress until the result arrives
  it('collects progress events as they arrive', () => {
    const { result } = renderHook(() => useImageChangesetStream('/api/images/img-1/changesets/stream'));

    act(() => latest().emit('progress', { phase: 'exporting' }));
    expect(result.current.progress).toEqual({ phase: 'exporting' });

    act(() => latest().emit('progress', { phase: 'analyzing', completedLayers: 1, totalLayers: 3 }));
    expect(result.current.progress).toEqual({ phase: 'analyzing', completedLayers: 1, totalLayers: 3 });
    expect(result.current.done).toBe(false);
  });

  // use-image-changeset-stream.md — result is set from the server's result event, done becomes true on end
  it('reports the final result once the server sends it, then marks done on end', () => {
    const { result } = renderHook(() => useImageChangesetStream('/api/images/img-1/changesets/stream'));
    const payload = { imageId: 'img-1', layers: [{ layerIndex: 0, diffId: 'sha256:abc', paths: [] }] };

    act(() => latest().emit('result', payload));
    expect(result.current.result).toEqual(payload);
    expect(result.current.done).toBe(false);

    act(() => latest().emit('end'));
    expect(result.current.done).toBe(true);
    expect(latest().closed).toBe(true);
  });

  // use-image-changeset-stream.md — error is set from the server's error event
  it("reports the server's own error message and marks done on an error event", () => {
    const { result } = renderHook(() => useImageChangesetStream('/api/images/img-1/changesets/stream'));

    act(() => latest().emit('error', { message: 'export failed' }));

    expect(result.current.done).toBe(true);
    expect(result.current.error).toBe('export failed');
  });

  // use-image-changeset-stream.md — disconnecting (a new url, or unmounting) cancels the in-flight analysis server-side
  it('closes the previous stream when the url changes, cancelling that analysis', () => {
    const { rerender } = renderHook(({ url }) => useImageChangesetStream(url), {
      initialProps: { url: '/api/images/img-1/changesets/stream' as string | undefined },
    });
    const first = latest();

    rerender({ url: '/api/images/img-2/changesets/stream' });

    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  // use-image-changeset-stream.md — unmounting closes the stream, cancelling that analysis
  it('closes the stream on unmount', () => {
    const { unmount } = renderHook(() => useImageChangesetStream('/api/images/img-1/changesets/stream'));
    const source = latest();

    unmount();

    expect(source.closed).toBe(true);
  });

  // use-image-changeset-stream.md — passing undefined again clears progress/result/done/error
  it('clears progress, result and done when the url is cleared', () => {
    const { result, rerender } = renderHook(({ url }) => useImageChangesetStream(url), {
      initialProps: { url: '/api/images/img-1/changesets/stream' as string | undefined },
    });
    act(() => latest().emit('result', { imageId: 'img-1', layers: [] }));
    act(() => latest().emit('end'));
    expect(result.current.done).toBe(true);

    rerender({ url: undefined });

    expect(result.current.result).toBeUndefined();
    expect(result.current.done).toBe(false);
  });
});
