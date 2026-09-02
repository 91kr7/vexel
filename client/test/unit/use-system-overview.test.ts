import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/live-channel';
import type { SystemOverview } from '../../src/data/system-client';

// useSystemOverview holds the host overview behind the dashboard's tiles and
// disk-usage breakdown (dashboard/specs/use-system-overview.md): the data
// client, the daemon event stream and the active-context broadcast are mocked,
// so what is under test is only the hook's own clock, re-read and error
// decisions. The event stream is kept mocked to state the absence: nothing here
// subscribes to it
// (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1).
const fetchSystemOverview = vi.fn();
let daemonListener: ((event: DaemonEvent) => void) | undefined;
let contextListener: (() => void) | undefined;

vi.mock('../../src/data/system-client', () => ({
  fetchSystemOverview: () => fetchSystemOverview(),
}));
vi.mock('../../src/data/live-channel', () => ({
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

const { useSystemOverview } = await import('../../src/data/use-system-overview');

/**
 * The period use-system-overview.md declares, in the unscaled form a unit run
 * uses: the timing scale is left at 1 here, so `cadence(3000)` is 3 000 ms.
 */
const DECLARED_PERIOD_MS = 3_000;

function overviewWith(imageCount = 3): SystemOverview {
  return {
    containers: { total: 2, running: 1, paused: 0, stopped: 1 },
    images: { count: imageCount, sizeBytes: 1_024 },
    volumes: { count: 1, sizeBytes: 512 },
    stacks: { compose: 1, total: 1 },
    buildCache: { sizeBytes: 0 },
    diskUsage: {
      categories: [
        { id: 'images', sizeBytes: 1_024, itemCount: imageCount },
        { id: 'containers', sizeBytes: 0, itemCount: 2 },
        { id: 'volumes', sizeBytes: 512, itemCount: 1 },
        { id: 'build-cache', sizeBytes: 0, itemCount: 0 },
      ],
      totalBytes: 1_536,
    },
  };
}

function daemonEvent(type: string, action = 'create'): DaemonEvent {
  return { id: `${type}-${action}`, timestamp: '2026-08-09T00:00:00Z', type, action };
}

/** Mounts the hook and lets its first read settle under whichever clock is installed. */
async function mountSettled() {
  const rendered = renderHook(() => useSystemOverview());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return rendered;
}

beforeEach(() => {
  fetchSystemOverview.mockReset();
  fetchSystemOverview.mockResolvedValue(overviewWith());
  daemonListener = undefined;
  contextListener = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSystemOverview (dashboard/specs/use-system-overview.md)', () => {
  // use-system-overview.md — "overview — the last successfully read SystemOverview; undefined until
  // the first read succeeds" / "loaded — true once a read has settled"
  it('reads the overview on mount and marks itself loaded', async () => {
    const { result } = renderHook(() => useSystemOverview());

    expect(result.current.overview).toBeUndefined();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchSystemOverview).toHaveBeenCalledTimes(1);
    expect(result.current.overview?.images.count).toBe(3);
    expect(result.current.error).toBeUndefined();
  });

  // use-system-overview.md — "error — the failure message of the last read"; "loaded — true once a
  // read has settled, successfully or not"
  it('settles with the failure message when the read fails', async () => {
    fetchSystemOverview.mockRejectedValue(new Error('daemon unreachable'));

    const { result } = renderHook(() => useSystemOverview());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe('daemon unreachable');
    expect(result.current.overview).toBeUndefined();
  });

  // use-system-overview.md — "cleared by the next successful one, which also replaces the overview"
  it('clears the error and replaces the overview on the next successful read', async () => {
    fetchSystemOverview.mockRejectedValueOnce(new Error('daemon unreachable'));
    const { result } = renderHook(() => useSystemOverview());
    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));

    fetchSystemOverview.mockResolvedValue(overviewWith(9));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.overview?.images.count).toBe(9));
    expect(result.current.error).toBeUndefined();
  });

  // use-system-overview.md — "The clock: one interval of 3 000 ms, declared through the client's
  // timing scale as cadence(3000)" (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-16,
  // REQ-18). The figure is the one the contract states, and the tick before it must not read.
  it('re-reads on its own at the declared period, and not before it', async () => {
    vi.useFakeTimers();
    const { result } = await mountSettled();
    expect(result.current.loaded).toBe(true);
    expect(fetchSystemOverview).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECLARED_PERIOD_MS - 1);
    });
    expect(fetchSystemOverview).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchSystemOverview).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECLARED_PERIOD_MS * 3);
    });
    expect(fetchSystemOverview).toHaveBeenCalledTimes(5);
  });

  // use-system-overview.md — "The clock runs only while the hook is mounted, exactly as a list
  // screen's does: leaving the dashboard stops it"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-17)
  it('stops ticking once the hook is unmounted', async () => {
    vi.useFakeTimers();
    const { result, unmount } = await mountSettled();
    expect(result.current.loaded).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECLARED_PERIOD_MS);
    });
    expect(fetchSystemOverview).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECLARED_PERIOD_MS * 10);
    });

    expect(fetchSystemOverview).toHaveBeenCalledTimes(2);
  });

  // use-system-overview.md — "A daemon event triggers nothing"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-13): the
  // reads counted here are the clock's own, and no event adds one to them.
  it('subscribes to no daemon event, and adds no read for one delivered', async () => {
    vi.useFakeTimers();
    const { result } = await mountSettled();
    expect(result.current.loaded).toBe(true);

    expect(daemonListener).toBeUndefined();

    fetchSystemOverview.mockClear();
    act(() => {
      for (const type of ['container', 'image', 'volume', 'network', 'builder', 'service', 'daemon']) {
        for (let index = 0; index < 30; index += 1) daemonListener?.(daemonEvent(type));
      }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DECLARED_PERIOD_MS - 1);
    });

    expect(fetchSystemOverview).not.toHaveBeenCalled();
  });

  // use-system-overview.md — "A context switch drops what is held and re-reads at once: the overview
  // belongs to a daemon, not to the screen (REQ-93)."
  it('re-reads when the active context changes', async () => {
    const { result } = renderHook(() => useSystemOverview());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchSystemOverview.mockClear();
    fetchSystemOverview.mockResolvedValue(overviewWith(42));

    act(() => contextListener?.());

    await waitFor(() => expect(result.current.overview?.images.count).toBe(42));
  });

  // use-system-overview.md — "A read that settles after the hook is unmounted updates nothing."
  it('applies nothing from a read that settles after the hook is unmounted', async () => {
    let settle: (value: SystemOverview) => void = () => undefined;
    fetchSystemOverview.mockReturnValue(new Promise<SystemOverview>((resolve) => (settle = resolve)));
    const { result, unmount } = renderHook(() => useSystemOverview());

    unmount();
    await act(async () => {
      settle(overviewWith());
    });

    expect(result.current.overview).toBeUndefined();
    expect(result.current.loaded).toBe(false);
  });
});
