import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { BuildCacheRecord } from '../../src/data/builders-client';

// useBuildCache reads the build-cache inventory and drives its prune
// (use-build-cache.md): the data client is mocked so the hook's own re-read and
// error-propagation decisions are the only things under test.
const fetchBuildCache = vi.fn();
const pruneBuildCache = vi.fn();

vi.mock('../../src/data/builders-client', () => ({
  fetchBuildCache: () => fetchBuildCache(),
  pruneBuildCache: () => pruneBuildCache(),
}));

const { useBuildCache } = await import('../../src/data/use-build-cache');

function record(overrides: Partial<BuildCacheRecord> = {}): BuildCacheRecord {
  return { id: 'rec-1', type: 'regular', sizeBytes: 1024, usageState: 'reclaimable', ...overrides };
}

beforeEach(() => {
  fetchBuildCache.mockReset();
  pruneBuildCache.mockReset();
});

describe('useBuildCache (builders/specs/use-build-cache.md)', () => {
  // use-build-cache.md — records is read on mount; loaded settles to true
  it('reads the build-cache inventory on mount and marks itself loaded', async () => {
    fetchBuildCache.mockResolvedValue([record()]);

    const { result } = renderHook(() => useBuildCache());

    expect(result.current.records).toEqual([]);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0]!.id).toBe('rec-1');
  });

  // use-build-cache.md — prune re-reads the inventory on success, so the reclaimed records go
  it('re-reads the inventory after a successful prune and returns the reclaimed figure', async () => {
    fetchBuildCache.mockResolvedValueOnce([record()]);
    pruneBuildCache.mockResolvedValue({ reclaimedBytes: 2048 });
    const { result } = renderHook(() => useBuildCache());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchBuildCache.mockResolvedValue([]);

    let reclaimed = 0;
    await act(async () => {
      reclaimed = (await result.current.prune()).reclaimedBytes;
    });

    expect(reclaimed).toBe(2048);
    await waitFor(() => expect(result.current.records).toHaveLength(0));
  });

  // use-build-cache.md — "a failure propagates to the caller"
  it('propagates a prune failure to the caller', async () => {
    fetchBuildCache.mockResolvedValue([record()]);
    pruneBuildCache.mockRejectedValue(new Error('failed to prune the build cache'));
    const { result } = renderHook(() => useBuildCache());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.prune()).rejects.toThrow('failed to prune the build cache');
  });

  // use-build-cache.md — error carries the last read failure; cleared once a later read succeeds
  it('surfaces a read failure and clears it once a subsequent refresh succeeds', async () => {
    fetchBuildCache.mockRejectedValueOnce(new Error('daemon unreachable'));
    const { result } = renderHook(() => useBuildCache());
    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));

    fetchBuildCache.mockResolvedValue([]);
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
  });
});
