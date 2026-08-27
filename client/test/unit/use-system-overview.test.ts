import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';
import type { SystemOverview } from '../../src/data/system-client';

// useSystemOverview holds the host overview behind the dashboard's tiles and
// disk-usage breakdown (dashboard/specs/use-system-overview.md): the data
// client, the daemon event stream and the active-context broadcast are mocked,
// so what is under test is only the hook's own re-read, coalescing and error
// decisions.
const fetchSystemOverview = vi.fn();
let daemonListener: ((event: DaemonEvent) => void) | undefined;
let contextListener: (() => void) | undefined;

vi.mock('../../src/data/system-client', () => ({
  fetchSystemOverview: () => fetchSystemOverview(),
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

const { useSystemOverview } = await import('../../src/data/use-system-overview');

/** Long enough for any coalescing window the hook uses to have elapsed. */
const AFTER_ANY_COALESCING_MS = 5_000;

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

  // use-system-overview.md — "The overview is re-read whenever a container, image, volume, network,
  // builder or service daemon event arrives"
  it.each(['container', 'image', 'volume', 'network', 'builder', 'service'])(
    're-reads on a %s daemon event',
    async (type) => {
      vi.useFakeTimers();
      const { result } = await mountSettled();
      expect(result.current.loaded).toBe(true);
      fetchSystemOverview.mockClear();

      act(() => daemonListener?.(daemonEvent(type)));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AFTER_ANY_COALESCING_MS);
      });

      expect(fetchSystemOverview).toHaveBeenCalledTimes(1);
    },
  );

  // use-system-overview.md — only the object types whose appearance, removal or state change moves
  // one of its numbers are relevant
  it('ignores a daemon event of an unrelated type', async () => {
    vi.useFakeTimers();
    const { result } = await mountSettled();
    expect(result.current.loaded).toBe(true);
    fetchSystemOverview.mockClear();

    act(() => daemonListener?.(daemonEvent('daemon')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AFTER_ANY_COALESCING_MS);
    });

    expect(fetchSystemOverview).not.toHaveBeenCalled();
  });

  // use-system-overview.md — "resize and the exec lifecycle actions are ignored … an open exec or
  // attach session fires them on every keystroke-driven resize without moving anything"
  it.each(['resize', 'exec_create', 'exec_start', 'exec_die'])(
    'ignores the %s container action an open session fires',
    async (action) => {
      vi.useFakeTimers();
      const { result } = await mountSettled();
      expect(result.current.loaded).toBe(true);
      fetchSystemOverview.mockClear();

      act(() => daemonListener?.(daemonEvent('container', action)));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AFTER_ANY_COALESCING_MS);
      });

      expect(fetchSystemOverview).not.toHaveBeenCalled();
    },
  );

  // use-system-overview.md — "A burst of such events — a compose up, a prune — leads to a single
  // re-read, not one per event."
  it('coalesces a burst of daemon events into a single re-read', async () => {
    vi.useFakeTimers();
    const { result } = await mountSettled();
    expect(result.current.loaded).toBe(true);
    fetchSystemOverview.mockClear();

    act(() => {
      for (let index = 0; index < 30; index += 1) daemonListener?.(daemonEvent('container', 'destroy'));
      for (let index = 0; index < 30; index += 1) daemonListener?.(daemonEvent('volume', 'destroy'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AFTER_ANY_COALESCING_MS);
    });

    expect(fetchSystemOverview).toHaveBeenCalledTimes(1);
  });

  // use-system-overview.md — "It does not poll: … a dashboard left open all day must not keep the
  // daemon busy computing it."
  it('never re-reads on its own while nothing happens', async () => {
    vi.useFakeTimers();
    const { result } = await mountSettled();
    expect(result.current.loaded).toBe(true);
    expect(fetchSystemOverview).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });

    expect(fetchSystemOverview).toHaveBeenCalledTimes(1);
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
