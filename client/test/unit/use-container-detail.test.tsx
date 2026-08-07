import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useContainerDetail } from '../../src/data/use-container-detail';
import type { ContainerInspect } from '../../src/data/containers-client';

// Stands in for the browser's EventSource: the daemon event stream is the
// hook's only push channel, so the tests drive it by emitting on the instance
// the hook opened.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((message: { data: string }) => void) | null = null;
  closed = false;

  constructor(public url: string) {
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

function inspectPayload(): ContainerInspect {
  return { id: 'c1', name: 'database', raw: {} } as unknown as ContainerInspect;
}

let fetchInspect: ReturnType<typeof vi.fn>;

vi.mock('../../src/data/containers-client', () => ({
  fetchContainerInspect: (id: string) => fetchInspect(id),
}));

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  fetchInspect = vi.fn().mockResolvedValue(inspectPayload());
});

afterEach(() => {
  cleanup();
});

describe('useContainerDetail', () => {
  // use-container-detail.md — re-reads whenever a container-typed daemon event arrives
  it('re-reads the inspect data when a container lifecycle event arrives', async () => {
    renderHook(() => useContainerDetail('c1'));
    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(1));

    act(() => daemonStream().emitDaemonEvent('container', 'start'));

    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(2));
  });

  // use-container-detail.md — does not re-read for resize / exec lifecycle / top actions,
  // which an open exec or attach session (REQ-34, REQ-35) fires without changing inspect data
  it.each(['resize', 'exec_create', 'exec_start', 'exec_die', 'exec_detach', 'top'])(
    'does not re-read the inspect data for a "%s" container action',
    async (action) => {
      renderHook(() => useContainerDetail('c1'));
      await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(1));

      act(() => {
        for (let i = 0; i < 20; i++) daemonStream().emitDaemonEvent('container', action);
      });

      await Promise.resolve();
      expect(fetchInspect).toHaveBeenCalledTimes(1);
    },
  );

  // use-container-detail.md — a burst of session-driven actions must not starve the UI with refetches
  it('stays at a single read while an open session fires a burst of resize actions', async () => {
    renderHook(() => useContainerDetail('c1'));
    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(1));

    act(() => {
      for (let i = 0; i < 200; i++) daemonStream().emitDaemonEvent('container', 'resize');
    });

    expect(fetchInspect).toHaveBeenCalledTimes(1);
  });
});
