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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  // use-container-processes.md — the listing is never polled: it stays as read until an explicit refresh
  it('never re-reads the listing on its own', async () => {
    const { result } = renderHook(() => useContainerProcesses('container-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  // use-container-processes.md — a failed read reports the message and keeps no stale rows
  it('reports a failure verbatim and keeps no stale rows', async () => {
    const { result } = renderHook(() => useContainerProcesses('container-1'));
    await waitFor(() => expect(result.current.processes).toHaveLength(1));

    nextResult = { ok: false, status: 409, body: { error: 'Container container-1 is not running' } };
    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBe('Container container-1 is not running'));
    expect(result.current.processes).toEqual([]);
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
