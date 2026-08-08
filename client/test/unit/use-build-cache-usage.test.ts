import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { BuildCacheUsage } from '../../src/data/builders-client';

// useBuildCacheUsage reads the images and layers one build-cache record relates
// to (use-build-cache-usage.md): the data client is mocked so the hook's own
// re-read, clearing and error-propagation decisions are the only things under
// test.
const fetchBuildCacheUsage = vi.fn();

vi.mock('../../src/data/builders-client', () => ({
  fetchBuildCacheUsage: (recordId: string) => fetchBuildCacheUsage(recordId),
}));

const { useBuildCacheUsage } = await import('../../src/data/use-build-cache-usage');

function usage(recordId: string): BuildCacheUsage {
  return {
    record: { id: recordId, type: 'regular', sizeBytes: 4096, usageState: 'reclaimable', description: 'mount / from exec /bin/sh -c true' },
    references: [{ imageId: 'sha256:a', imageShortId: 'sha256:a', tags: ['fixture:1'], layerIndex: 1, instruction: 'RUN', command: 'RUN /bin/sh -c true # buildkit' }],
  };
}

beforeEach(() => {
  fetchBuildCacheUsage.mockReset();
});

describe('useBuildCacheUsage (builders/specs/use-build-cache-usage.md)', () => {
  // use-build-cache-usage.md — "recordId undefined -> no request is made and the result stays
  // empty; this is how an unselected record costs nothing"
  it('makes no request and stays empty while no record is selected', () => {
    const { result } = renderHook(() => useBuildCacheUsage(undefined));

    expect(fetchBuildCacheUsage).not.toHaveBeenCalled();
    expect(result.current.usage).toBeUndefined();
    expect(result.current.loaded).toBe(false);
  });

  // use-build-cache-usage.md — "recordId given -> reads it once"
  it('reads the relation once for the selected record and marks itself loaded', async () => {
    fetchBuildCacheUsage.mockResolvedValue(usage('rec-1'));

    const { result } = renderHook(() => useBuildCacheUsage('rec-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchBuildCacheUsage).toHaveBeenCalledTimes(1);
    expect(fetchBuildCacheUsage).toHaveBeenCalledWith('rec-1');
    expect(result.current.usage?.record.id).toBe('rec-1');
  });

  // use-build-cache-usage.md — "and again on every recordId change and on refresh()"
  it('re-reads on refresh', async () => {
    fetchBuildCacheUsage.mockResolvedValue(usage('rec-1'));
    const { result } = renderHook(() => useBuildCacheUsage('rec-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.refresh());

    await waitFor(() => expect(fetchBuildCacheUsage).toHaveBeenCalledTimes(2));
  });

  // use-build-cache-usage.md — "Changing recordId clears the previous record's result before the
  // new read, so no reference is ever shown under the wrong record."
  it("clears the previous record's result before reading the new one", async () => {
    fetchBuildCacheUsage.mockResolvedValue(usage('rec-1'));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useBuildCacheUsage(id), { initialProps: { id: 'rec-1' } });
    await waitFor(() => expect(result.current.usage?.record.id).toBe('rec-1'));

    let resolveSecond: (value: BuildCacheUsage) => void = () => undefined;
    fetchBuildCacheUsage.mockReturnValue(new Promise<BuildCacheUsage>((resolve) => (resolveSecond = resolve)));
    rerender({ id: 'rec-2' });

    expect(result.current.usage).toBeUndefined();
    expect(result.current.loaded).toBe(false);

    await act(async () => {
      resolveSecond(usage('rec-2'));
    });
    await waitFor(() => expect(result.current.usage?.record.id).toBe('rec-2'));
  });

  // use-build-cache-usage.md — "A read that settles after the hook is unmounted or after recordId
  // changed is discarded."
  it("discards a read that settles after the recordId changed, keeping the new record's answer", async () => {
    let resolveFirst: (value: BuildCacheUsage) => void = () => undefined;
    fetchBuildCacheUsage.mockReturnValueOnce(new Promise<BuildCacheUsage>((resolve) => (resolveFirst = resolve)));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useBuildCacheUsage(id), { initialProps: { id: 'rec-1' } });

    fetchBuildCacheUsage.mockResolvedValue(usage('rec-2'));
    rerender({ id: 'rec-2' });
    await waitFor(() => expect(result.current.usage?.record.id).toBe('rec-2'));

    // The first record's read only settles now: it belongs to a record that is no longer selected.
    await act(async () => {
      resolveFirst(usage('rec-1'));
    });

    expect(result.current.usage?.record.id).toBe('rec-2');
  });

  // use-build-cache-usage.md — a superseded read is discarded whole: "loaded -> true once a read has
  // settled" is the *current* read's business, so a stale answer must not report the new record as
  // loaded while its own read is still in flight.
  it('lets no superseded read mark the new record as loaded', async () => {
    let resolveFirst: (value: BuildCacheUsage) => void = () => undefined;
    fetchBuildCacheUsage.mockReturnValueOnce(new Promise<BuildCacheUsage>((resolve) => (resolveFirst = resolve)));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useBuildCacheUsage(id), { initialProps: { id: 'rec-1' } });

    // The second record's read never settles during this test.
    fetchBuildCacheUsage.mockReturnValue(new Promise<BuildCacheUsage>(() => undefined));
    rerender({ id: 'rec-2' });

    await act(async () => {
      resolveFirst(usage('rec-1'));
    });

    expect(result.current.loaded).toBe(false);
    expect(result.current.usage).toBeUndefined();
  });

  // use-build-cache-usage.md — "loaded -> true once a read has settled, whether it succeeded or
  // failed": a failing read still reaches a settled state.
  it('reaches a settled state on a failing read', async () => {
    fetchBuildCacheUsage.mockRejectedValue(new Error('daemon unreachable'));

    const { result } = renderHook(() => useBuildCacheUsage('rec-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe('daemon unreachable');
  });

  // use-build-cache-usage.md — "error -> the server's own message (including the 404 of an id no
  // longer in the inventory); cleared by a later successful read"
  it("surfaces the server's own message on failure and clears it once a later read succeeds", async () => {
    fetchBuildCacheUsage.mockRejectedValueOnce(new Error('no build-cache record carries that id'));
    const { result } = renderHook(() => useBuildCacheUsage('rec-1'));

    await waitFor(() => expect(result.current.error).toBe('no build-cache record carries that id'));
    expect(result.current.loaded).toBe(true);

    fetchBuildCacheUsage.mockResolvedValue(usage('rec-1'));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
  });

  // use-build-cache-usage.md — "A record with no association is not an error: it arrives inside
  // usage carrying its own reason."
  it('carries a record with no association inside usage, not as an error', async () => {
    fetchBuildCacheUsage.mockResolvedValue({
      record: { id: 'rec-1', type: 'source.local', sizeBytes: 128, usageState: 'reclaimable' },
      references: [],
      unavailableReason: 'NonLayerCacheRecord',
      unavailableDetail: 'This record holds build input of type source.local, not an image layer.',
    } satisfies BuildCacheUsage);

    const { result } = renderHook(() => useBuildCacheUsage('rec-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBeUndefined();
    expect(result.current.usage?.unavailableReason).toBe('NonLayerCacheRecord');
  });
});
