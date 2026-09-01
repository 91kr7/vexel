import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useContainers } from '../../src/data/use-containers';
import type { ContainerSummary } from '../../src/data/containers-client';

// Stands in for the browser's EventSource. The subject of this file is that the
// hook reads for no daemon event whatever
// (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1),
// so the stream is driven for real and the hook is watched for a read; its poll,
// its shape and its other triggers are covered in list-hooks-unchanged.test.tsx.
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
// process's lifetime; with no subscriber left in a list hook, nothing here opens
// one at all, which is the first thing asserted.
function daemonStream(): FakeEventSource | undefined {
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
  // use-containers.md — "Reads for no other reason of its own: a daemon event triggers nothing here"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-13)
  it('opens no daemon event stream of its own', async () => {
    renderHook(() => useContainers());
    await waitFor(() => expect(fetchList).toHaveBeenCalledTimes(1));

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // The same claim from the other side: even with a stream open, an event of any type and any
  // action leaves the listing where it was.
  it.each([
    ['container', 'start'],
    ['container', 'die'],
    ['container', 'destroy'],
    ['container', 'resize'],
    ['image', 'pull'],
    ['volume', 'create'],
    ['network', 'create'],
  ])('reads nothing again for a "%s" / "%s" daemon event', async (type, action) => {
    renderHook(() => useContainers());
    await waitFor(() => expect(fetchList).toHaveBeenCalledTimes(1));

    // Opened by this test, since the hook opens none: an event that reaches
    // nobody is what the requirement asks for.
    const stream = daemonStream() ?? new FakeEventSource('/api/events');
    act(() => {
      for (let i = 0; i < 20; i++) stream.emitDaemonEvent(type, action);
    });
    await Promise.resolve();

    expect(fetchList).toHaveBeenCalledTimes(1);
  });
});
