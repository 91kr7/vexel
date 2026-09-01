import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useContainerProcesses } from '../../src/data/use-container-processes';
import type { ContainerProcessList } from '../../src/data/container-stats-client';

function listing(commands: string[]): ContainerProcessList {
  return {
    titles: ['PID', 'USER', 'CMD'],
    processes: commands.map((command, index) => ({ pid: index + 1, user: 'root', command })),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let nextResult: { ok: boolean; status: number; body: unknown };
/** Resolves the pending read only when a test asks for it, so `loading` is observable. */
let pending: Array<() => void>;
let holdResponses: boolean;

beforeEach(() => {
  nextResult = { ok: true, status: 200, body: listing(['postgres']) };
  pending = [];
  holdResponses = false;
  fetchMock = vi.fn(
    () =>
      new Promise((resolve) => {
        const deliver = () => resolve({ ok: nextResult.ok, status: nextResult.status, json: () => Promise.resolve(nextResult.body) });
        if (holdResponses) pending.push(deliver);
        else deliver();
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * The period use-container-processes.md declares, in the unscaled form a unit
 * run uses: the timing scale is left at 1 here, so `cadence(3000)` is 3 000 ms.
 */
const DECLARED_PERIOD_MS = 3_000;

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function releasePending() {
  const waiting = pending;
  pending = [];
  waiting.forEach((deliver) => deliver());
}

describe('useContainerProcesses (REQ-33)', () => {
  // use-container-processes.md — nothing is read while there is no container id
  it('reads nothing when the id is undefined', () => {
    const { result } = renderHook(() => useContainerProcesses(undefined));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.processes).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  // use-container-processes.md — the listing is read once when the id becomes defined
  it('reads the listing once for the container and reports it loaded', async () => {
    const { result } = renderHook(() => useContainerProcesses('container-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.processes.map((process) => process.command)).toEqual(['postgres']);
    expect(result.current.titles).toEqual(['PID', 'USER', 'CMD']);
    expect(result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/containers/container-1/processes');
  });

  // use-container-processes.md — `loading` is true while a read is in flight, including the first one
  it('reports a read in flight', async () => {
    holdResponses = true;
    const { result } = renderHook(() => useContainerProcesses('container-1'));

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.loaded).toBe(false);

    await act(async () => releasePending());
    expect(result.current.loading).toBe(false);
    expect(result.current.loaded).toBe(true);
  });

  // use-container-processes.md — "The clock: one interval of 3 000 ms, declared through the client's
  // timing scale as cadence(3000)"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27, REQ-33)
  it('re-reads on its own at the declared period, and not before it', async () => {
    vi.useFakeTimers();
    renderHook(() => useContainerProcesses('container-1'));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(DECLARED_PERIOD_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await advance(DECLARED_PERIOD_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  // use-container-processes.md — "cleared when either stops holding": closing the tab stops it
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-28)
  it('stops reading once the view holding the listing is gone', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useContainerProcesses('container-1'));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
    await advance(DECLARED_PERIOD_MS * 10);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // use-container-processes.md — "A container that is not running is asked for nothing at all …
  // with running false no read is taken, and the listing is empty and settled — loaded true, no
  // error" (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27)
  it('asks for nothing at all while the container is not running, and settles empty', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useContainerProcesses('container-1', { running: false }));
    await advance(0);

    expect(result.current.loaded).toBe(true);
    expect(result.current.processes).toEqual([]);
    expect(result.current.error).toBeUndefined();

    await advance(DECLARED_PERIOD_MS * 10);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // use-container-processes.md — "An explicit ask still reads: refresh() … calls the endpoint
  // whatever the state, which is how a stopped container still reports the daemon's own refusal
  // verbatim" (…/REQ-34)
  it('still reads on an explicit refresh while the container is not running', async () => {
    const { result } = renderHook(() => useContainerProcesses('container-1', { running: false }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    nextResult = { ok: false, status: 409, body: { error: 'Container container-1 is not running' } };
    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBe('Container container-1 is not running'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // use-container-processes.md — "the listing is read the moment that view opens, and again on each
  // tick": a container that starts running is picked up without an ask (…/REQ-27)
  it('starts reading the moment the container becomes running', async () => {
    const { result, rerender } = renderHook(({ running }: { running: boolean }) => useContainerProcesses('container-1', { running }), {
      initialProps: { running: false },
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ running: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  // use-container-processes.md — "A read that comes back the same as what is held replaces nothing:
  // processes and titles keep their identity, so the table is not redrawn and the operator's place
  // in a long listing is kept" (…/REQ-29)
  it('keeps the very same rows when a tick brings back what is already held', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useContainerProcesses('container-1'));
    await advance(0);
    const firstRows = result.current.processes;
    const firstTitles = result.current.titles;
    expect(firstRows).toHaveLength(1);

    // A distinct payload with identical content, which is what a second read of
    // an unchanged container actually returns.
    nextResult = { ok: true, status: 200, body: listing(['postgres']) };
    await advance(DECLARED_PERIOD_MS * 3);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(result.current.processes).toBe(firstRows);
    expect(result.current.titles).toBe(firstTitles);
  });

  // plan-docker_management_app/REQ-33 — refresh() re-reads the listing on demand
  it('re-reads the listing when refresh is called', async () => {
    const { result } = renderHook(() => useContainerProcesses('container-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    nextResult = { ok: true, status: 200, body: listing(['postgres', 'sleep 42']) };
    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.processes.map((process) => process.command)).toEqual(['postgres', 'sleep 42']));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // use-container-processes.md — refresh() is a no-op when there is no container id
  it('does nothing when refresh is called without a container id', async () => {
    const { result } = renderHook(() => useContainerProcesses(undefined));

    await act(async () => result.current.refresh());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // use-container-processes.md — changing the id empties the previous container's listing before the new read
  it('empties the previous listing when the container changes', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useContainerProcesses(id), {
      initialProps: { id: 'container-1' },
    });
    await waitFor(() => expect(result.current.processes).toHaveLength(1));

    holdResponses = true;
    await act(async () => rerender({ id: 'container-2' }));

    expect(result.current.processes).toEqual([]);
    expect(result.current.loaded).toBe(false);

    nextResult = { ok: true, status: 200, body: listing(['nginx']) };
    await act(async () => releasePending());
    expect(result.current.processes.map((process) => process.command)).toEqual(['nginx']);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/containers/container-2/processes');
  });

  // use-container-processes.md — "A read that fails leaves the held listing in place and reports
  // the message through error … This replaces the earlier rule that a failed read emptied the
  // listing: under a clock, one failed tick would otherwise throw away a listing that is still the
  // last thing known" (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-32)
  it('reports a failure verbatim and keeps the listing it last read', async () => {
    const { result } = renderHook(() => useContainerProcesses('container-1'));
    await waitFor(() => expect(result.current.processes).toHaveLength(1));
    const lastKnown = result.current.processes;

    nextResult = { ok: false, status: 409, body: { error: 'Container container-1 is not running' } };
    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBe('Container container-1 is not running'));
    expect(result.current.processes).toBe(lastKnown);
    expect(result.current.loaded).toBe(true);
  });

  // use-container-processes.md — the failure is cleared by a successful read
  it('clears the failure on the next successful read', async () => {
    nextResult = { ok: false, status: 500, body: { error: 'daemon unreachable' } };
    const { result } = renderHook(() => useContainerProcesses('container-1'));
    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));

    nextResult = { ok: true, status: 200, body: listing(['postgres']) };
    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
    expect(result.current.processes).toHaveLength(1);
  });

  // use-container-processes.md — a result arriving after the caller unmounted is discarded
  it('discards a result arriving after the caller unmounted', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    holdResponses = true;
    const { unmount } = renderHook(() => useContainerProcesses('container-1'));

    unmount();
    await act(async () => releasePending());

    expect(consoleError).not.toHaveBeenCalled();
  });
});
