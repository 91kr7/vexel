import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useImageFilesystemExtraction } from '../../src/data/use-image-filesystem-extraction';

// Stands in for the browser's EventSource: the filesystem extraction progress
// stream's only channel (REQ-52, REQ-55, REQ-113), so the tests drive it by
// emitting events on the instance the hook opened.
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

describe('useImageFilesystemExtraction (plan-docker_management_app/REQ-52, plan-docker_management_app/REQ-55, plan-docker_management_app/REQ-113)', () => {
  // use-image-filesystem-extraction.md — passing undefined keeps the stream closed and the result cleared
  it('opens no stream while url is undefined', () => {
    renderHook(() => useImageFilesystemExtraction(undefined));

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // use-image-filesystem-extraction.md — reports the creating/copying/indexing phases
  it('collects the creating, copying and indexing phases as they arrive', () => {
    const { result } = renderHook(() => useImageFilesystemExtraction('/api/images/img-1/filesystem/stream'));

    act(() => latest().emit('progress', { phase: 'creating' }));
    expect(result.current.progress).toEqual({ phase: 'creating' });

    act(() => latest().emit('progress', { phase: 'copying' }));
    expect(result.current.progress).toEqual({ phase: 'copying' });

    act(() => latest().emit('progress', { phase: 'indexing' }));
    expect(result.current.progress).toEqual({ phase: 'indexing' });
    expect(result.current.done).toBe(false);
  });

  // use-image-filesystem-extraction.md — result arrives just before done becomes true on end
  it('reports the final result once the server sends it, then marks done on end', () => {
    const { result } = renderHook(() => useImageFilesystemExtraction('/api/images/img-1/filesystem/stream'));
    const payload = { imageId: 'img-1', entryCount: 42, fromCache: false };

    act(() => latest().emit('result', payload));
    expect(result.current.result).toEqual(payload);
    expect(result.current.done).toBe(false);

    act(() => latest().emit('end'));
    expect(result.current.done).toBe(true);
    expect(latest().closed).toBe(true);
  });

  // use-image-filesystem-extraction.md — error is set from the server's error event
  it("reports the server's own error message and marks done on an error event", () => {
    const { result } = renderHook(() => useImageFilesystemExtraction('/api/images/img-1/filesystem/stream'));

    act(() => latest().emit('error', { message: 'no command specified' }));

    expect(result.current.done).toBe(true);
    expect(result.current.error).toBe('no command specified');
  });

  // use-image-filesystem-extraction.md — disconnecting (a new url, or unmounting) cancels the in-flight extraction server-side
  it('closes the previous stream when the url changes, cancelling that extraction', () => {
    const { rerender } = renderHook(({ url }) => useImageFilesystemExtraction(url), {
      initialProps: { url: '/api/images/img-1/filesystem/stream' as string | undefined },
    });
    const first = latest();

    rerender({ url: '/api/images/img-1/filesystem/stream?force=true' });

    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  // use-image-filesystem-extraction.md — unmounting closes the stream, cancelling the extraction server-side
  it('closes the stream on unmount', () => {
    const { unmount } = renderHook(() => useImageFilesystemExtraction('/api/images/img-1/filesystem/stream'));
    const source = latest();

    unmount();

    expect(source.closed).toBe(true);
  });

  // use-image-filesystem-extraction.md — passing undefined again clears progress/result/done/error
  it('clears progress, result and done when the url is cleared', () => {
    const { result, rerender } = renderHook(({ url }) => useImageFilesystemExtraction(url), {
      initialProps: { url: '/api/images/img-1/filesystem/stream' as string | undefined },
    });
    act(() => latest().emit('result', { imageId: 'img-1', entryCount: 1, fromCache: false }));
    act(() => latest().emit('end'));
    expect(result.current.done).toBe(true);

    rerender({ url: undefined });

    expect(result.current.result).toBeUndefined();
    expect(result.current.done).toBe(false);
  });
});
