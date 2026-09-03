import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useContainerDetail } from '../../src/data/use-container-detail';
import { requestReload } from '../../src/data/reload-signal';
import type { ContainerInspect } from '../../src/data/containers-client';

// The triggers useContainerDetail has after
// plan-docker_management_app-refresh_cache-client_event_refresh_removal: the
// clock scoped to the tab showing the data, the read when that tab opens, the
// `id` change, the operator's refresh and the reload signal — and no daemon
// event at all (containers/specs/use-container-detail.md).
//
// The event stream is stood in for so the absence can be stated: nothing here
// opens one, and an event delivered on one opened by the test reaches nobody.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((message: { data: string }) => void) | null = null;

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener() {}

  close() {}

  emitDaemonEvent(type: string, action: string, actor?: { actorId?: string; actor?: string }) {
    this.onmessage?.({
      data: JSON.stringify({ id: `${type}-${action}-${Math.random()}`, timestamp: '2026-08-07T10:00:00.000Z', type, action, ...actor }),
    });
  }
}

/**
 * The period use-container-detail.md declares, in the unscaled form a unit run
 * uses: the timing scale is left at 1 here, so `cadence(3000)` is 3 000 ms.
 */
const DECLARED_PERIOD_MS = 3_000;

const SHOWN = '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0';

function inspectPayload(state = 'running'): ContainerInspect {
  return { id: SHOWN, name: 'database', raw: { State: { Status: state, Paused: false } } } as unknown as ContainerInspect;
}

// Typed with the signature of the function it stands in for: an untyped
// `vi.fn()` is not callable through `ReturnType<typeof vi.fn>`.
let fetchInspect: Mock<(id: string) => Promise<ContainerInspect>>;

vi.mock('../../src/data/containers-client', () => ({
  fetchContainerInspect: (id: string) => fetchInspect(id),
}));

/** Lets the mount read settle without leaving the fake clock. */
async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  fetchInspect = vi.fn<(id: string) => Promise<ContainerInspect>>().mockResolvedValue(inspectPayload());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useContainerDetail — the triggers it has (use-container-detail.md)', () => {
  // use-container-detail.md — "inspect is undefined until the first fetch for the current id
  // resolves" / "loaded becomes true once the initial fetch for the current id has settled"
  it('reads the inspect data when the detail is opened on a container', async () => {
    const { result } = renderHook(() => useContainerDetail(SHOWN));

    expect(result.current.inspect).toBeUndefined();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchInspect).toHaveBeenCalledTimes(1);
    expect(fetchInspect).toHaveBeenLastCalledWith(SHOWN);
  });

  // use-container-detail.md — "refresh() re-reads the current id's inspect data immediately; a
  // no-op when id is undefined"
  it('reads nothing at all, and refreshes nothing, while no container is selected', async () => {
    const { result } = renderHook(() => useContainerDetail(undefined));

    act(() => result.current.refresh());
    await Promise.resolve();

    expect(fetchInspect).not.toHaveBeenCalled();
    expect(result.current.inspect).toBeUndefined();
  });

  // use-container-detail.md — "The clock: one interval of 3 000 ms, declared through the client's
  // timing scale as cadence(3000)"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-26, REQ-33)
  it('re-reads on its own at the declared period, and not before it', async () => {
    vi.useFakeTimers();
    renderHook(() => useContainerDetail(SHOWN));
    await settle();
    expect(fetchInspect).toHaveBeenCalledTimes(1);

    await advance(DECLARED_PERIOD_MS - 1);
    expect(fetchInspect).toHaveBeenCalledTimes(1);

    await advance(1);
    expect(fetchInspect).toHaveBeenCalledTimes(2);

    await advance(DECLARED_PERIOD_MS * 3);
    expect(fetchInspect).toHaveBeenCalledTimes(5);
  });

  // use-container-detail.md — "while shown is false nothing is read at all"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-28)
  it('reads nothing while the tab showing the data is not the one on screen', async () => {
    vi.useFakeTimers();
    renderHook(() => useContainerDetail(SHOWN, { shown: false }));
    await settle();

    await advance(DECLARED_PERIOD_MS * 10);

    expect(fetchInspect).not.toHaveBeenCalled();
  });

  // use-container-detail.md — "the moment it becomes true the data is read once and the interval
  // starts" (…/REQ-28): switching to the Inspect tab shows what is true now, without a wait.
  it('reads once the moment its tab becomes the one on screen, and starts its clock there', async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ shown }) => useContainerDetail(SHOWN, { shown }), {
      initialProps: { shown: false },
    });
    await settle();
    expect(fetchInspect).not.toHaveBeenCalled();

    rerender({ shown: true });
    await settle();
    expect(fetchInspect).toHaveBeenCalledTimes(1);

    await advance(DECLARED_PERIOD_MS);
    expect(fetchInspect).toHaveBeenCalledTimes(2);
  });

  // use-container-detail.md — "cleared when it stops being true": leaving the tab stops the clock.
  it('stops reading when its tab stops being the one on screen', async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ shown }) => useContainerDetail(SHOWN, { shown }), {
      initialProps: { shown: true },
    });
    await settle();
    expect(fetchInspect).toHaveBeenCalledTimes(1);

    rerender({ shown: false });
    await advance(DECLARED_PERIOD_MS * 10);

    expect(fetchInspect).toHaveBeenCalledTimes(1);
  });

  // use-container-detail.md — "cleared … when the caller unmounts"
  it('stops reading once the detail is closed', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useContainerDetail(SHOWN));
    await settle();
    expect(fetchInspect).toHaveBeenCalledTimes(1);

    unmount();
    await advance(DECLARED_PERIOD_MS * 10);

    expect(fetchInspect).toHaveBeenCalledTimes(1);
  });

  // use-container-detail.md — "loaded … resets to false whenever id changes"
  it('reads the new container when the detail is opened on another one', async () => {
    const { result, rerender } = renderHook(({ id }) => useContainerDetail(id), { initialProps: { id: 'c1' } });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    fetchInspect.mockClear();
    rerender({ id: 'c2' });

    await waitFor(() => expect(fetchInspect).toHaveBeenCalledWith('c2'));
  });

  // use-container-detail.md — "refresh() re-reads the current id's inspect data immediately"
  // (…/REQ-34)
  it('re-reads when the operator asks for a refresh', async () => {
    const { result } = renderHook(() => useContainerDetail(SHOWN));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchInspect.mockClear();

    act(() => result.current.refresh());

    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(1));
  });

  // use-container-detail.md — "Re-reads on the manual reload signal, and that signal waits for this
  // read" (…/REQ-34)
  it('re-reads on the reload signal, and the signal waits for that read', async () => {
    const { result } = renderHook(() => useContainerDetail(SHOWN));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchInspect.mockClear();

    let settled = false;
    fetchInspect.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      settled = true;
      return inspectPayload();
    });

    await act(async () => {
      await requestReload();
    });

    expect(fetchInspect).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
  });

  // use-container-detail.md — "A daemon event triggers nothing"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-13)
  it('opens no daemon event stream, and adds no read for an event delivered on one', async () => {
    vi.useFakeTimers();
    renderHook(() => useContainerDetail(SHOWN));
    await settle();
    expect(FakeEventSource.instances).toHaveLength(0);

    fetchInspect.mockClear();
    const stream = new FakeEventSource('/api/events');
    act(() => {
      for (const action of ['start', 'die', 'pause', 'destroy']) {
        stream.emitDaemonEvent('container', action, { actorId: SHOWN, actor: 'database' });
      }
    });
    await advance(DECLARED_PERIOD_MS - 1);

    expect(fetchInspect).not.toHaveBeenCalled();
  });
});

describe('useContainerDetail — what a tick does to what is held (use-container-detail.md)', () => {
  // use-container-detail.md — "A read that comes back the same as what is held replaces nothing:
  // inspect keeps its identity, so nothing downstream is redrawn"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-29)
  it('keeps the very same object when a tick brings back what is already held', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useContainerDetail(SHOWN));
    await settle();
    const firstReading = result.current.inspect;
    expect(firstReading).toBeDefined();

    // A distinct object with identical content, which is what a second read of
    // an unchanged container actually returns.
    fetchInspect.mockResolvedValue(inspectPayload());
    await advance(DECLARED_PERIOD_MS * 3);

    expect(fetchInspect.mock.calls.length).toBeGreaterThan(1);
    expect(result.current.inspect).toBe(firstReading);
  });

  // use-container-detail.md — "Only a read that differs replaces"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-30)
  it('replaces what is held when a tick finds the container changed', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useContainerDetail(SHOWN));
    await settle();
    const firstReading = result.current.inspect;

    fetchInspect.mockResolvedValue(inspectPayload('paused'));
    await advance(DECLARED_PERIOD_MS);

    expect(result.current.inspect).not.toBe(firstReading);
    expect((result.current.inspect as unknown as { raw: { State: { Status: string } } }).raw.State.Status).toBe('paused');
  });

  // use-container-detail.md — "A read that fails leaves the last one in place: inspect is untouched
  // and the message is reported through error"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-32)
  it('keeps the last reading on screen when a tick fails, and reports the failure', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useContainerDetail(SHOWN));
    await settle();
    const firstReading = result.current.inspect;

    fetchInspect.mockRejectedValue(new Error('No such container: database'));
    await advance(DECLARED_PERIOD_MS);

    expect(result.current.inspect).toBe(firstReading);
    expect(result.current.error).toBe('No such container: database');
  });

  // use-container-detail.md — "error … cleared on the next successful fetch"
  it('clears the failure and replaces the reading on the next successful tick', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useContainerDetail(SHOWN));
    await settle();

    fetchInspect.mockRejectedValueOnce(new Error('daemon unreachable'));
    await advance(DECLARED_PERIOD_MS);
    expect(result.current.error).toBe('daemon unreachable');

    fetchInspect.mockResolvedValue(inspectPayload('exited'));
    await advance(DECLARED_PERIOD_MS);

    expect(result.current.error).toBeUndefined();
    expect((result.current.inspect as unknown as { raw: { State: { Status: string } } }).raw.State.Status).toBe('exited');
  });

  // use-container-detail.md — "A read that settles after the caller unmounted updates nothing."
  it('applies nothing from a read that settles after the detail is closed', async () => {
    let settleRead: (value: ContainerInspect) => void = () => undefined;
    fetchInspect.mockReturnValue(new Promise<ContainerInspect>((resolve) => (settleRead = resolve)));
    const { result, unmount } = renderHook(() => useContainerDetail(SHOWN));

    unmount();
    await act(async () => {
      settleRead(inspectPayload());
    });

    expect(result.current.inspect).toBeUndefined();
    expect(result.current.loaded).toBe(false);
  });
});
