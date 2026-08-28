import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener() {}

  close() {
    this.closed = true;
  }

  emitDaemonEvent(type: string, action: string, actor?: { actorId?: string; actor?: string }) {
    this.onmessage?.({
      data: JSON.stringify({ id: `${type}-${action}-${Math.random()}`, timestamp: '2026-08-07T10:00:00.000Z', type, action, ...actor }),
    });
  }
}

// The event-stream module opens a single EventSource and keeps it for the
// process's lifetime, so every test drives that one instance.
function daemonStream(): FakeEventSource {
  return FakeEventSource.instances[0];
}

// Identifiers of the shape the daemon reports, so the attribution rule is
// exercised on what it actually receives rather than on two short labels.
const SHOWN = '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0';
const OTHER = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

function inspectPayload(): ContainerInspect {
  return { id: SHOWN, name: 'database', raw: {} } as unknown as ContainerInspect;
}

// Typed with the signature of the function it stands in for: an untyped
// `vi.fn()` is not callable through `ReturnType<typeof vi.fn>`.
let fetchInspect: Mock<(id: string) => Promise<ContainerInspect>>;

vi.mock('../../src/data/containers-client', () => ({
  fetchContainerInspect: (id: string) => fetchInspect(id),
}));

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  fetchInspect = vi.fn<(id: string) => Promise<ContainerInspect>>().mockResolvedValue(inspectPayload());
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
  // use-container-detail.md — "A `container` event about another container is ignored: the daemon is
  // not asked about the shown container, and the view does not change"
  // (plan-docker_management_app-refresh_cache/REQ-7)
  it('does not read the shown container again for an event about another container', async () => {
    renderHook(() => useContainerDetail(SHOWN));
    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(1));

    act(() => {
      daemonStream().emitDaemonEvent('container', 'start', { actorId: OTHER, actor: 'other-container' });
      daemonStream().emitDaemonEvent('container', 'die', { actorId: OTHER, actor: 'other-container' });
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchInspect).toHaveBeenCalledTimes(1);
  });

  // use-container-detail.md — re-reads for a `container` event about that same container
  // (plan-docker_management_app-refresh_cache/REQ-8)
  it('reads again for an event carrying the shown container identifier', async () => {
    renderHook(() => useContainerDetail(SHOWN));
    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(1));

    act(() => daemonStream().emitDaemonEvent('container', 'die', { actorId: SHOWN, actor: 'database' }));

    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(2));
    expect(fetchInspect).toHaveBeenLastCalledWith(SHOWN);
  });

  // event-stream-client.md — the short form and the full identifier name one container, so a view
  // opened on the twelve characters the list carries still reads again for its own events
  it('reads again when the event carries the full identifier of a container shown by its short form', async () => {
    const shortId = SHOWN.slice(0, 12);
    renderHook(() => useContainerDetail(shortId));
    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(1));

    act(() => daemonStream().emitDaemonEvent('container', 'die', { actorId: SHOWN, actor: 'database' }));

    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(2));
  });

  // use-container-detail.md — "one carrying none is treated as about the shown container, so no
  // change is ever missed" (plan-docker_management_app-refresh_cache/REQ-8)
  it('reads again for an event that carries no identifier at all', async () => {
    renderHook(() => useContainerDetail(SHOWN));
    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(1));

    act(() => daemonStream().emitDaemonEvent('container', 'die', { actor: 'another-container' }));

    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(2));
  });

  // use-container-detail.md — the excluded actions stay excluded whoever they are about
  it('does not read again for a resize action about the shown container', async () => {
    renderHook(() => useContainerDetail(SHOWN));
    await waitFor(() => expect(fetchInspect).toHaveBeenCalledTimes(1));

    act(() => daemonStream().emitDaemonEvent('container', 'resize', { actorId: SHOWN, actor: 'database' }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchInspect).toHaveBeenCalledTimes(1);
  });
});
