/**
 * The client's list hooks are where the refresh-cache plan did **not** go
 * (plan-docker_management_app-refresh_cache/REQ-21): the work moved onto the
 * server's refresh cache, and each hook keeps the public shape its screens use
 * and its own interval.
 *
 * The event-subscription half of that claim was withdrawn by
 * plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-6
 * and REQ-13: the poll is now the whole of the automatic trigger, and no list
 * hook listens to the daemon event stream at all. That is what the last case
 * below asserts, in place of the event types each hook used to re-read on.
 *
 * One file over all eight, because the claim is about the set: finishing the
 * plan by quietly moving the work into the client would show up here as one row
 * of the table changing, whichever row it was.
 *
 * Expected values are read from each hook's own spec — the shape from its
 * contract line, the interval and the event types from its rules — and never
 * from the hook. Where a spec says only "a bounded poll", this file asks only
 * for a poll that is genuinely bounded, since a number the contract does not
 * state is not a number the contract protects.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, type RenderHookResult } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

const reads = {
  containers: vi.fn(),
  images: vi.fn(),
  volumes: vi.fn(),
  networks: vi.fn(),
  compose: vi.fn(),
  contexts: vi.fn(),
  builders: vi.fn(),
  buildCache: vi.fn(),
};

/** Every daemon-event listener the hook under test registered, so an event can be delivered to it. */
let daemonListeners: ((event: DaemonEvent) => void)[] = [];
const subscribeToDaemonEvents = vi.fn((listener: (event: DaemonEvent) => void) => {
  daemonListeners.push(listener);
  return () => {
    daemonListeners = daemonListeners.filter((registered) => registered !== listener);
  };
});

// The real modules are spread and only the read is replaced: a hook that imports
// more than its own listing (a create, a removal, a switch) still gets the real
// exports, and nothing here can make a hook look narrower than it is.
vi.mock('../../src/data/containers-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/containers-client')>()),
  fetchContainers: () => reads.containers(),
}));
vi.mock('../../src/data/images-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/images-client')>()),
  fetchImages: () => reads.images(),
}));
vi.mock('../../src/data/volumes-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/volumes-client')>()),
  fetchVolumes: () => reads.volumes(),
}));
vi.mock('../../src/data/networks-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/networks-client')>()),
  fetchNetworks: () => reads.networks(),
}));
vi.mock('../../src/data/compose-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/compose-client')>()),
  fetchComposeProjects: () => reads.compose(),
}));
vi.mock('../../src/data/contexts-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/contexts-client')>()),
  fetchContexts: () => reads.contexts(),
}));
vi.mock('../../src/data/builders-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/builders-client')>()),
  fetchBuilders: () => reads.builders(),
  fetchBuildCache: () => reads.buildCache(),
}));
vi.mock('../../src/data/event-stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/event-stream')>()),
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useContainers } = await import('../../src/data/use-containers');
const { useImages } = await import('../../src/data/use-images');
const { useVolumes } = await import('../../src/data/use-volumes');
const { useNetworks } = await import('../../src/data/use-networks');
const { useComposeProjects } = await import('../../src/data/use-compose-projects');
const { useContexts } = await import('../../src/data/use-contexts');
const { useBuilders } = await import('../../src/data/use-builders');
const { useBuildCache } = await import('../../src/data/use-build-cache');

interface ListHookCase {
  /** How the hook is named in a failure message, and in its own spec. */
  name: string;
  read: ReturnType<typeof vi.fn>;
  render: () => RenderHookResult<Record<string, unknown>, unknown>;
  /** Every key the spec's contract line promises, the list's own key first. */
  shape: string[];
  /** The interval the spec states, in ms; `undefined` where it says only "a bounded poll". */
  statedPollMs?: number;
  /** Whether the spec writes the signature as `refresh: () => void`. */
  refreshDeclaredVoid: boolean;
}

/**
 * The eight lists this plan moved onto the server's refresh cache, each with
 * what its own spec promises.
 */
const LIST_HOOKS: ListHookCase[] = [
  {
    name: 'useContainers',
    read: reads.containers,
    render: () => renderHook(() => useContainers() as unknown as Record<string, unknown>),
    shape: ['containers', 'loaded', 'error', 'refresh'],
    statedPollMs: 3000,
    refreshDeclaredVoid: true,
  },
  {
    name: 'useImages',
    read: reads.images,
    render: () => renderHook(() => useImages() as unknown as Record<string, unknown>),
    shape: ['images', 'loaded', 'error', 'refresh'],
    statedPollMs: 3000,
    refreshDeclaredVoid: true,
  },
  {
    name: 'useVolumes',
    read: reads.volumes,
    render: () => renderHook(() => useVolumes() as unknown as Record<string, unknown>),
    shape: ['volumes', 'loaded', 'error', 'refresh'],
    statedPollMs: 3000,
    refreshDeclaredVoid: true,
  },
  {
    name: 'useNetworks',
    read: reads.networks,
    render: () => renderHook(() => useNetworks() as unknown as Record<string, unknown>),
    shape: ['networks', 'loaded', 'error', 'refresh'],
    statedPollMs: 3000,
    refreshDeclaredVoid: true,
  },
  {
    name: 'useComposeProjects',
    read: reads.compose,
    render: () => renderHook(() => useComposeProjects() as unknown as Record<string, unknown>),
    shape: ['projects', 'loaded', 'error', 'refresh'],
    refreshDeclaredVoid: false,
  },
  {
    name: 'useContexts',
    read: reads.contexts,
    render: () => renderHook(() => useContexts() as unknown as Record<string, unknown>),
    shape: ['contexts', 'active', 'loaded', 'error', 'refresh', 'create', 'remove', 'use'],
    refreshDeclaredVoid: false,
  },
  {
    name: 'useBuilders',
    read: reads.builders,
    render: () => renderHook(() => useBuilders() as unknown as Record<string, unknown>),
    shape: ['builders', 'loaded', 'error', 'refresh', 'create', 'remove', 'use'],
    refreshDeclaredVoid: false,
  },
  {
    name: 'useBuildCache',
    read: reads.buildCache,
    render: () => renderHook(() => useBuildCache() as unknown as Record<string, unknown>),
    shape: ['records', 'loaded', 'error', 'refresh', 'prune'],
    refreshDeclaredVoid: false,
  },
];

/** Wide enough for the slowest poll any of these hooks is allowed to keep. */
const BOUNDED_POLL_CEILING_MS = 60_000;

function daemonEvent(type: string): DaemonEvent {
  return { id: 'evt-1', timestamp: new Date().toISOString(), type, action: 'start' };
}

/** Lets the mount read settle, without leaving the fake clock. */
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
  for (const read of Object.values(reads)) {
    read.mockReset();
    read.mockResolvedValue([]);
  }
  subscribeToDaemonEvents.mockClear();
  daemonListeners = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the client list hooks this plan left alone (REQ-21)', () => {
  for (const listHook of LIST_HOOKS) {
    describe(listHook.name, () => {
      // Each hook's own spec states the contract line asserted here.
      it('answers exactly the shape its screen uses', async () => {
        const { result, unmount } = listHook.render();
        await settle();

        expect(Object.keys(result.current).sort()).toEqual([...listHook.shape].sort());
        expect(result.current.loaded).toBe(true);
        expect(typeof result.current.refresh).toBe('function');
        if (listHook.refreshDeclaredVoid) {
          // `refresh: () => void`. A promise returned here is the shape the
          // screens do not use, and is what REQ-21 refuses.
          let returned: unknown;
          await act(async () => {
            returned = (result.current.refresh as () => unknown)();
          });
          expect(returned).toBeUndefined();
        }
        unmount();
      });

      it('reports a failed read through error, and clears it on the next successful one', async () => {
        listHook.read.mockRejectedValueOnce(new Error('daemon unreachable'));
        const { result, unmount } = listHook.render();
        await settle();

        expect(result.current.error).toBe('daemon unreachable');

        await act(async () => {
          (result.current.refresh as () => unknown)();
        });
        await settle();

        expect(result.current.error).toBeUndefined();
        unmount();
      });

      it('holds a poll of its own, re-reading with nothing operated and no event delivered', async () => {
        const { unmount } = listHook.render();
        await settle();
        expect(listHook.read).toHaveBeenCalledTimes(1);

        if (listHook.statedPollMs !== undefined) {
          await advance(listHook.statedPollMs - 1);
          expect(listHook.read).toHaveBeenCalledTimes(1);
          await advance(1);
          expect(listHook.read).toHaveBeenCalledTimes(2);
        } else {
          await advance(BOUNDED_POLL_CEILING_MS);
          expect(listHook.read.mock.calls.length).toBeGreaterThan(1);
        }
        unmount();
      });

      // plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-13 — the
      // hook subscribes to nothing on the daemon event stream, so no event of any type reaches it
      // and none can make it read.
      it('subscribes to no daemon event, and reads for none', async () => {
        const { unmount } = listHook.render();
        await settle();

        expect(
          daemonListeners.length,
          `${listHook.name} subscribed to the daemon event stream`,
        ).toBe(0);

        listHook.read.mockClear();
        for (const type of ['container', 'image', 'volume', 'network', 'plugin', 'daemon']) {
          await act(async () => {
            for (const listener of daemonListeners) listener(daemonEvent(type));
          });
        }
        await settle();
        expect(listHook.read, `${listHook.name} read again because of a daemon event`).not.toHaveBeenCalled();

        unmount();
      });
    });
  }

  // plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-13 — the claim is
  // about the set: not one of these eight hooks reached the subscription at all.
  it('leaves the daemon-event subscription uncalled with every one of them mounted', async () => {
    const mounted = LIST_HOOKS.map((listHook) => listHook.render());
    await settle();

    expect(subscribeToDaemonEvents).not.toHaveBeenCalled();

    for (const rendered of mounted) rendered.unmount();
  });

  // use-contexts.md — "The poll is deliberately slower than a daemon-object one".
  it('useContexts polls more slowly than a daemon-object list does', async () => {
    const { unmount } = renderHook(() => useContexts());
    await settle();
    expect(reads.contexts).toHaveBeenCalledTimes(1);

    await advance(3000);

    expect(reads.contexts).toHaveBeenCalledTimes(1);
    unmount();
  });
});
