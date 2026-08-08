import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { ImageBuildCacheTrace } from '../../src/data/image-layers-client';

// useImageBuildCacheTrace reads one image's layer-to-build-cache association
// (use-image-build-cache-trace.md): the data client is mocked so the hook's own
// re-read, clearing and error-propagation decisions are the only things under
// test.
const fetchImageBuildCacheTrace = vi.fn();

vi.mock('../../src/data/image-layers-client', () => ({
  fetchImageBuildCacheTrace: (id: string) => fetchImageBuildCacheTrace(id),
}));

const { useImageBuildCacheTrace } = await import('../../src/data/use-image-build-cache-trace');

function trace(imageId: string): ImageBuildCacheTrace {
  return {
    imageId,
    layers: [{ layerIndex: 0, diffId: 'sha256:diff', instruction: 'RUN', command: 'RUN /bin/sh -c true # buildkit' }],
  };
}

beforeEach(() => {
  fetchImageBuildCacheTrace.mockReset();
});

describe('useImageBuildCacheTrace (images/specs/use-image-build-cache-trace.md)', () => {
  // use-image-build-cache-trace.md — "id undefined -> no request is made and the result stays
  // empty; this is how a closed explorer costs nothing"
  it('makes no request and stays empty while no image is given', async () => {
    const { result } = renderHook(() => useImageBuildCacheTrace(undefined));

    expect(fetchImageBuildCacheTrace).not.toHaveBeenCalled();
    expect(result.current.trace).toBeUndefined();
    expect(result.current.loaded).toBe(false);
  });

  // use-image-build-cache-trace.md — "id given -> reads it once"
  it('reads the association once for the given image and marks itself loaded', async () => {
    fetchImageBuildCacheTrace.mockResolvedValue(trace('sha256:a'));

    const { result } = renderHook(() => useImageBuildCacheTrace('sha256:a'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchImageBuildCacheTrace).toHaveBeenCalledTimes(1);
    expect(fetchImageBuildCacheTrace).toHaveBeenCalledWith('sha256:a');
    expect(result.current.trace?.imageId).toBe('sha256:a');
    expect(result.current.error).toBeUndefined();
  });

  // use-image-build-cache-trace.md — "and again on every id change and on refresh()"
  it('re-reads on refresh', async () => {
    fetchImageBuildCacheTrace.mockResolvedValue(trace('sha256:a'));
    const { result } = renderHook(() => useImageBuildCacheTrace('sha256:a'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.refresh());

    await waitFor(() => expect(fetchImageBuildCacheTrace).toHaveBeenCalledTimes(2));
  });

  // use-image-build-cache-trace.md — "Changing id clears the previous image's trace before the new
  // read, so no layer is ever shown against another image's cache records."
  it("clears the previous image's trace before reading the new one", async () => {
    fetchImageBuildCacheTrace.mockResolvedValue(trace('sha256:a'));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useImageBuildCacheTrace(id), { initialProps: { id: 'sha256:a' } });
    await waitFor(() => expect(result.current.trace?.imageId).toBe('sha256:a'));

    let resolveSecond: (value: ImageBuildCacheTrace) => void = () => undefined;
    fetchImageBuildCacheTrace.mockReturnValue(new Promise<ImageBuildCacheTrace>((resolve) => (resolveSecond = resolve)));
    rerender({ id: 'sha256:b' });

    expect(result.current.trace).toBeUndefined();
    expect(result.current.loaded).toBe(false);

    await act(async () => {
      resolveSecond(trace('sha256:b'));
    });
    await waitFor(() => expect(result.current.trace?.imageId).toBe('sha256:b'));
  });

  // use-image-build-cache-trace.md — "A read that settles after the hook is unmounted or after id
  // changed is discarded."
  it("discards a read that settles after the id changed, keeping the new image's answer", async () => {
    let resolveFirst: (value: ImageBuildCacheTrace) => void = () => undefined;
    fetchImageBuildCacheTrace.mockReturnValueOnce(new Promise<ImageBuildCacheTrace>((resolve) => (resolveFirst = resolve)));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useImageBuildCacheTrace(id), { initialProps: { id: 'sha256:a' } });

    fetchImageBuildCacheTrace.mockResolvedValue(trace('sha256:b'));
    rerender({ id: 'sha256:b' });
    await waitFor(() => expect(result.current.trace?.imageId).toBe('sha256:b'));

    // The first image's read only settles now: it belongs to an id that is no longer displayed.
    await act(async () => {
      resolveFirst(trace('sha256:a'));
    });

    expect(result.current.trace?.imageId).toBe('sha256:b');
  });

  // use-image-build-cache-trace.md — a superseded read is discarded whole: "loaded -> true once a
  // read has settled" is the *current* read's business, so a stale answer must not report the new
  // image as loaded while its own read is still in flight.
  it('lets no superseded read mark the new image as loaded', async () => {
    let resolveFirst: (value: ImageBuildCacheTrace) => void = () => undefined;
    fetchImageBuildCacheTrace.mockReturnValueOnce(new Promise<ImageBuildCacheTrace>((resolve) => (resolveFirst = resolve)));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useImageBuildCacheTrace(id), { initialProps: { id: 'sha256:a' } });

    // The second image's read never settles during this test.
    fetchImageBuildCacheTrace.mockReturnValue(new Promise<ImageBuildCacheTrace>(() => undefined));
    rerender({ id: 'sha256:b' });

    await act(async () => {
      resolveFirst(trace('sha256:a'));
    });

    expect(result.current.loaded).toBe(false);
    expect(result.current.trace).toBeUndefined();
  });

  // use-image-build-cache-trace.md — "loaded -> true once a read has settled, whether it succeeded
  // or failed": a failing read still reaches a settled state.
  it('reaches a settled state on a failing read', async () => {
    fetchImageBuildCacheTrace.mockRejectedValue(new Error('daemon unreachable'));

    const { result } = renderHook(() => useImageBuildCacheTrace('sha256:a'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe('daemon unreachable');
  });

  // use-image-build-cache-trace.md — "error -> the server's own message; cleared by a later
  // successful read", and "loaded -> true once a read has settled, whether it succeeded or failed"
  it("surfaces the server's own message on failure and clears it once a later read succeeds", async () => {
    fetchImageBuildCacheTrace.mockRejectedValueOnce(new Error('buildx du: failed to connect to the builder'));
    const { result } = renderHook(() => useImageBuildCacheTrace('sha256:a'));

    await waitFor(() => expect(result.current.error).toBe('buildx du: failed to connect to the builder'));
    expect(result.current.loaded).toBe(true);

    fetchImageBuildCacheTrace.mockResolvedValue(trace('sha256:a'));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
  });

  // use-image-build-cache-trace.md — "A layer whose association does not exist is not an error: it
  // arrives inside trace carrying its own reason."
  it('carries a layer with no association inside the trace, not as an error', async () => {
    fetchImageBuildCacheTrace.mockResolvedValue({
      imageId: 'sha256:a',
      layers: [
        {
          layerIndex: 0,
          instruction: 'RUN',
          unavailableReason: 'NoMatchingCacheRecord',
          unavailableDetail: 'No local build-cache record matches this step.',
        },
      ],
    } satisfies ImageBuildCacheTrace);

    const { result } = renderHook(() => useImageBuildCacheTrace('sha256:a'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBeUndefined();
    expect(result.current.trace?.layers[0]!.unavailableReason).toBe('NoMatchingCacheRecord');
  });
});
