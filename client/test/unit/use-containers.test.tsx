import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useContainers } from '../../src/data/use-containers';
import type { ContainerSummary } from '../../src/data/containers-client';

// Stands in for the browser's EventSource: the daemon event stream is the
// hook's only push channel, so the tests drive it by emitting on the instance
// the hook opened.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((message: { data: string }) => void) | null = null;
  closed = false;

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener() {}

  close() {
    this.closed = true;
  }

  emitDaemonEvent(type: string, action: string) {
    this.onmessage?.({
      data: JSON.stringify({ id: `${type}-${action}-${Math.random()}`, timestamp: '2026-08-07T10:00:00.000Z', type, action }),
    });
  }
}

// The event-stream module opens a single EventSource and keeps it for the
// process's lifetime, so every test drives that one instance.
function daemonStream(): FakeEventSource {
  return FakeEventSource.instances[0];
}

// Typed with the signature of the function it stands in for: an untyped
// `vi.fn()` is not callable through `ReturnType<typeof vi.fn>`.
let fetchList: Mock<() => Promise<ContainerSummary[]>>;

vi.mock('../../src/data/containers-client', () => ({
  fetchContainers: () => fetchList(),
}));

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  fetchList = vi
    .fn<() => Promise<ContainerSummary[]>>()
    .mockResolvedValue([{ id: 'c1', name: 'database', state: 'running' }] as unknown as ContainerSummary[]);
});

afterEach(() => {
  cleanup();
});

describe('useContainers', () => {
  // use-containers.md — re-reads whenever a container-typed daemon event arrives (REQ-19)
  it('re-reads the list when a container lifecycle event arrives', async () => {
    renderHook(() => useContainers());
    await waitFor(() => expect(fetchList).toHaveBeenCalledTimes(1));

    act(() => daemonStream().emitDaemonEvent('container', 'start'));

    await waitFor(() => expect(fetchList).toHaveBeenCalledTimes(2));
  });

  // use-containers.md — does not re-read for resize / exec lifecycle / top actions,
  // which an open exec or attach session (REQ-34, REQ-35) fires without changing the list
  it.each(['resize', 'exec_create', 'exec_start', 'exec_die', 'exec_detach', 'top'])(
    'does not re-read the list for a "%s" container action',
    async (action) => {
      renderHook(() => useContainers());
      await waitFor(() => expect(fetchList).toHaveBeenCalledTimes(1));

      act(() => {
        for (let i = 0; i < 20; i++) daemonStream().emitDaemonEvent('container', action);
      });

      await Promise.resolve();
      expect(fetchList).toHaveBeenCalledTimes(1);
    },
  );

  // use-containers.md — a burst of session-driven actions must not starve the UI with refetches
  it('stays at a single read while an open session fires a burst of resize actions', async () => {
    renderHook(() => useContainers());
    await waitFor(() => expect(fetchList).toHaveBeenCalledTimes(1));

    act(() => {
      for (let i = 0; i < 200; i++) daemonStream().emitDaemonEvent('container', 'resize');
    });

    expect(fetchList).toHaveBeenCalledTimes(1);
  });
});
