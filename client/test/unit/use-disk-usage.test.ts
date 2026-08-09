import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';
import type { DiskUsageBreakdown, PruneRunResult } from '../../src/data/system-client';

// useDiskUsage holds the reclaimable-space breakdown and drives the prunes over
// it (use-disk-usage.md): the data client, the daemon event stream and the
// active-context broadcast are mocked, so the hook's own re-read, coalescing
// and error decisions are the only things under test.
const fetchDiskUsage = vi.fn();
const pruneScope = vi.fn();
let daemonListener: ((event: DaemonEvent) => void) | undefined;
let contextListener: (() => void) | undefined;

vi.mock('../../src/data/system-client', () => ({
  fetchDiskUsage: () => fetchDiskUsage(),
  pruneScope: (scope: string[]) => pruneScope(scope),
}));
vi.mock('../../src/data/event-stream', () => ({
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => {
    daemonListener = listener;
    return () => {
      daemonListener = undefined;
    };
  },
}));
vi.mock('../../src/data/active-context', () => ({
  subscribeToActiveContextChange: (listener: () => void) => {
    contextListener = listener;
    return () => {
      contextListener = undefined;
    };
  },
}));

const { useDiskUsage } = await import('../../src/data/use-disk-usage');

/** Long enough for any coalescing window the hook uses to have elapsed. */
const AFTER_ANY_COALESCING_MS = 5_000;

function breakdown(totalReclaimableBytes = 1_024): DiskUsageBreakdown {
  return {
    categories: [
      { id: 'stopped-containers', sizeBytes: totalReclaimableBytes, itemCount: 1, items: ['fixture'] },
      { id: 'dangling-images', sizeBytes: 0, itemCount: 0, items: [] },
      { id: 'unused-volumes', sizeBytes: 0, itemCount: 0, items: [] },
      { id: 'unused-networks', sizeBytes: 0, itemCount: 0, items: [] },
      { id: 'build-cache', sizeBytes: 0, itemCount: 0, items: [] },
    ],
    totalReclaimableBytes,
  };
}

function runResult(reclaimedBytes = 512): PruneRunResult {
  return {
    categories: [{ categoryId: 'stopped-containers', removed: ['c1'], removedCount: 1, reclaimedBytes }],
    reclaimedBytes,
  };
}

function daemonEvent(type: string): DaemonEvent {
  return { id: '1', timestamp: '2026-08-09T00:00:00Z', type, action: 'destroy' };
}

beforeEach(() => {
  fetchDiskUsage.mockReset();
  pruneScope.mockReset();
  daemonListener = undefined;
  contextListener = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDiskUsage (system/specs/use-disk-usage.md)', () => {
  // use-disk-usage.md — "breakdown — the last successfully read DiskUsageBreakdown; undefined until
  // the first read succeeds" / "loaded — true once a read has settled"
  it('reads the breakdown on mount and marks itself loaded', async () => {
    fetchDiskUsage.mockResolvedValue(breakdown());

    const { result } = renderHook(() => useDiskUsage());

    expect(result.current.breakdown).toBeUndefined();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchDiskUsage).toHaveBeenCalledTimes(1);
    expect(result.current.breakdown?.totalReclaimableBytes).toBe(1_024);
    expect(result.current.error).toBeUndefined();
  });

  // use-disk-usage.md — "error — the failure message of the last read"; "loaded — true once a read
  // has settled, successfully or not"
  it('settles with the failure message when the read fails', async () => {
    fetchDiskUsage.mockRejectedValue(new Error('daemon unreachable'));

    const { result } = renderHook(() => useDiskUsage());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe('daemon unreachable');
    expect(result.current.breakdown).toBeUndefined();
  });

  // use-disk-usage.md — "cleared by the next successful one, which also replaces the breakdown"
  it('clears the error and replaces the breakdown on the next successful read', async () => {
    fetchDiskUsage.mockRejectedValueOnce(new Error('daemon unreachable'));
    const { result } = renderHook(() => useDiskUsage());
    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));

    fetchDiskUsage.mockResolvedValue(breakdown(2_048));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.breakdown?.totalReclaimableBytes).toBe(2_048));
    expect(result.current.error).toBeUndefined();
  });

  // use-disk-usage.md — "prune(scope) — prunes the named categories, then re-reads the breakdown"
  it('prunes the named categories and re-reads the breakdown afterwards', async () => {
    fetchDiskUsage.mockResolvedValue(breakdown());
    pruneScope.mockResolvedValue(runResult());
    const { result } = renderHook(() => useDiskUsage());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchDiskUsage.mockClear();

    let resolved: PruneRunResult | undefined;
    await act(async () => {
      resolved = await result.current.prune(['stopped-containers', 'unused-volumes']);
    });

    expect(pruneScope).toHaveBeenCalledWith(['stopped-containers', 'unused-volumes']);
    expect(resolved?.reclaimedBytes).toBe(512);
    await waitFor(() => expect(fetchDiskUsage).toHaveBeenCalledTimes(1));
  });

  // use-disk-usage.md — "rejects if the request itself fails (a per-category failure is reported
  // inside the result, not as a rejection)"
  it('rejects when the prune request itself fails', async () => {
    fetchDiskUsage.mockResolvedValue(breakdown());
    pruneScope.mockRejectedValue(new Error('scope must be a non-empty array of known prune categories'));
    const { result } = renderHook(() => useDiskUsage());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.prune(['stopped-containers'])).rejects.toThrow(
      'scope must be a non-empty array of known prune categories',
    );
  });

  // use-disk-usage.md — a per-category failure is part of the result, not a rejection
  it('resolves with the run when one of its categories failed', async () => {
    fetchDiskUsage.mockResolvedValue(breakdown());
    pruneScope.mockResolvedValue({
      categories: [{ categoryId: 'build-cache', removed: [], removedCount: 0, reclaimedBytes: 0, error: 'buildx is not installed' }],
      reclaimedBytes: 0,
    } satisfies PruneRunResult);
    const { result } = renderHook(() => useDiskUsage());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let resolved: PruneRunResult | undefined;
    await act(async () => {
      resolved = await result.current.prune(['build-cache']);
    });

    expect(resolved?.categories[0]?.error).toBe('buildx is not installed');
  });

  // use-disk-usage.md — "It is also re-read on every container, image, volume or network daemon
  // event"
  it.each(['container', 'image', 'volume', 'network'])('re-reads on a %s daemon event', async (type) => {
    vi.useFakeTimers();
    fetchDiskUsage.mockResolvedValue(breakdown());
    const { result } = renderHook(() => useDiskUsage());
    // Flushes the initial read inside act(), so the state it settles is applied under the fake clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loaded).toBe(true);
    fetchDiskUsage.mockClear();

    act(() => daemonListener?.(daemonEvent(type)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AFTER_ANY_COALESCING_MS);
    });

    expect(fetchDiskUsage).toHaveBeenCalledTimes(1);
  });

  // use-disk-usage.md — only the object types whose appearance or removal changes what is
  // reclaimable are relevant
  it('ignores a daemon event of an unrelated type', async () => {
    vi.useFakeTimers();
    fetchDiskUsage.mockResolvedValue(breakdown());
    const { result } = renderHook(() => useDiskUsage());
    // Flushes the initial read inside act(), so the state it settles is applied under the fake clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loaded).toBe(true);
    fetchDiskUsage.mockClear();

    act(() => daemonListener?.(daemonEvent('daemon')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AFTER_ANY_COALESCING_MS);
    });

    expect(fetchDiskUsage).not.toHaveBeenCalled();
  });

  // use-disk-usage.md — "A burst of such events — a prune emits one per removed object — leads to a
  // single re-read, not one per event."
  it('coalesces a burst of daemon events into a single re-read', async () => {
    vi.useFakeTimers();
    fetchDiskUsage.mockResolvedValue(breakdown());
    const { result } = renderHook(() => useDiskUsage());
    // Flushes the initial read inside act(), so the state it settles is applied under the fake clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loaded).toBe(true);
    fetchDiskUsage.mockClear();

    act(() => {
      for (let index = 0; index < 30; index += 1) daemonListener?.(daemonEvent('container'));
      for (let index = 0; index < 30; index += 1) daemonListener?.(daemonEvent('volume'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AFTER_ANY_COALESCING_MS);
    });

    expect(fetchDiskUsage).toHaveBeenCalledTimes(1);
  });

  // use-disk-usage.md — "It does not poll: the daemon's disk-usage reading is expensive on a large
  // host, and a screen left open must not keep the daemon busy computing it."
  it('never re-reads on its own while nothing happens', async () => {
    vi.useFakeTimers();
    fetchDiskUsage.mockResolvedValue(breakdown());
    const { result } = renderHook(() => useDiskUsage());
    // Flushes the initial read inside act(), so the state it settles is applied under the fake clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loaded).toBe(true);
    expect(fetchDiskUsage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(fetchDiskUsage).toHaveBeenCalledTimes(1);
  });

  // use-disk-usage.md — "A context switch drops what is held and re-reads at once: the breakdown
  // belongs to a daemon, not to the screen (REQ-93)."
  it('re-reads when the active context changes', async () => {
    fetchDiskUsage.mockResolvedValue(breakdown());
    const { result } = renderHook(() => useDiskUsage());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchDiskUsage.mockClear();
    fetchDiskUsage.mockResolvedValue(breakdown(4_096));

    act(() => contextListener?.());

    await waitFor(() => expect(result.current.breakdown?.totalReclaimableBytes).toBe(4_096));
  });

  // use-disk-usage.md — "A read that settles after the hook is unmounted updates nothing."
  it('applies nothing from a read that settles after the hook is unmounted', async () => {
    let settle: (value: DiskUsageBreakdown) => void = () => undefined;
    fetchDiskUsage.mockReturnValue(new Promise<DiskUsageBreakdown>((resolve) => (settle = resolve)));
    const { result, unmount } = renderHook(() => useDiskUsage());

    unmount();
    await act(async () => {
      settle(breakdown());
    });

    expect(result.current.breakdown).toBeUndefined();
    expect(result.current.loaded).toBe(false);
  });
});
