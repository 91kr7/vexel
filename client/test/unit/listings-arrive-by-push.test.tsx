/**
 * Every listing the server holds arrives on the live channel, and the browser
 * asks for none of them
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-8,
 * REQ-11, REQ-12, REQ-17, REQ-18, REQ-24, REQ-33, REQ-39, REQ-40).
 *
 * One file over the ten, because the claim is about the set: a listing left
 * reading the server on a clock of its own would show up here as one row of the
 * table, whichever row it was. What each hook does beyond the listing — its
 * actions, its malformed deliveries, the context it names active, and what
 * `useComposeProjects` does with the reading its press asks for — stays in that
 * hook's own file.
 *
 * Expected values are read from each hook's own spec: the shape from its
 * contract line, the behaviour from its rules. The names the values travel under
 * are the server's census, asserted on the wire in
 * `server/test/api/live-channel.test.ts`.
 *
 * `fetch` is recorded and refused rather than answered: the claim is that
 * nothing is requested at all, and a mock that answered would hide a request
 * instead of catching it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, renderHook, waitFor, type RenderHookResult } from '@testing-library/react';
import { FakeEventSource, channelOpens, deliverDaemonEvent, deliverDiscard, deliverValue, dropChannel, liveChannel } from '../support/live-channel';
import { arrangeLiveChannel, type ChannelHarness } from '../support/pushed-listing';

/** The manual reload endpoint: the one request any of these hooks may make, and only on a press. */
const RELOAD_URL = '/api/refresh';

type HookResult = Record<string, unknown>;

interface ListingCase {
  /** The hook, as its own spec names it. */
  name: string;
  /** Its module, imported afresh for every test. */
  module: string;
  /** The export to call. */
  exported: string;
  /** The name the value travels under on the channel. */
  channelName: string;
  /** Every key the spec's contract line promises. */
  shape: string[];
  /** The result keys carrying what was delivered. */
  readings: string[];
  /** A delivery of unchanging content, built afresh on every call. */
  delivered: () => Record<string, unknown> | unknown[];
  /** A delivery of other content, `nth` telling two of them apart. */
  changed: (nth: number) => Record<string, unknown> | unknown[];
  /**
   * Whether a press with the channel delivering asks the server to read again. True for the one
   * listing whose screen offers a control whose whole job is that (`use-compose-projects.md`);
   * everywhere else the same name is bound to an error retry that only appears with the channel
   * down, and a press must reach the server never.
   */
  refreshAsksTheServer?: true;
}

const LISTINGS: ListingCase[] = [
  {
    name: 'useContainers',
    module: '../../src/data/use-containers',
    exported: 'useContainers',
    channelName: 'containers',
    shape: ['containers', 'loaded', 'error', 'refresh'],
    readings: ['containers'],
    delivered: () => [{ id: 'c1', shortId: 'c1', name: 'database', image: 'alpine:3.20', state: 'running', status: 'Up 3 seconds', ports: [] }],
    changed: (nth) => [{ id: `c${nth}`, shortId: `c${nth}`, name: `web-${nth}`, image: 'alpine:3.20', state: 'running', status: 'Up 3 seconds', ports: [] }],
  },
  {
    name: 'useImages',
    module: '../../src/data/use-images',
    exported: 'useImages',
    channelName: 'images',
    shape: ['images', 'loaded', 'error', 'refresh'],
    readings: ['images'],
    delivered: () => [{ id: 'img-1', shortId: 'img-1', tags: ['app:1'], platforms: [], sizeBytes: 1, createdAt: '2026-01-01T00:00:00Z' }],
    changed: (nth) => [{ id: 'img-1', shortId: 'img-1', tags: [`app:changed-${nth}`], platforms: [], sizeBytes: 1, createdAt: '2026-01-01T00:00:00Z' }],
  },
  {
    name: 'useVolumes',
    module: '../../src/data/use-volumes',
    exported: 'useVolumes',
    channelName: 'volumes',
    shape: ['volumes', 'loaded', 'error', 'refresh'],
    readings: ['volumes'],
    delivered: () => [{ name: 'vol-1', driver: 'local', mountpoint: '/data/vol-1', scope: 'local', createdAt: '', labels: {}, options: {}, mountedBy: [] }],
    changed: (nth) => [{ name: `vol-${nth}`, driver: 'local', mountpoint: `/data/vol-${nth}`, scope: 'local', createdAt: '', labels: {}, options: {}, mountedBy: [] }],
  },
  {
    name: 'useNetworks',
    module: '../../src/data/use-networks',
    exported: 'useNetworks',
    channelName: 'networks',
    shape: ['networks', 'loaded', 'error', 'refresh'],
    readings: ['networks'],
    delivered: () => [{ id: 'net-1', name: 'app-net', driver: 'bridge', scope: 'local', labels: {}, options: {}, attachedContainers: [] }],
    changed: (nth) => [{ id: 'net-1', name: `app-net-${nth}`, driver: 'bridge', scope: 'local', labels: {}, options: {}, attachedContainers: [] }],
  },
  {
    name: 'useComposeProjects',
    module: '../../src/data/use-compose-projects',
    exported: 'useComposeProjects',
    channelName: 'compose-projects',
    shape: ['projects', 'loaded', 'error', 'refresh'],
    readings: ['projects'],
    delivered: () => [{ name: 'shop', status: 'running(2)', configFiles: ['/srv/shop/compose.yaml'], services: [] }],
    changed: (nth) => [{ name: 'shop', status: `running(${nth})`, configFiles: ['/srv/shop/compose.yaml'], services: [] }],
    refreshAsksTheServer: true,
  },
  {
    name: 'useBuilders',
    module: '../../src/data/use-builders',
    exported: 'useBuilders',
    channelName: 'builders',
    shape: ['builders', 'loaded', 'error', 'refresh', 'create', 'remove', 'use'],
    readings: ['builders'],
    delivered: () => [{ name: 'default', driver: 'docker', endpoint: 'default', platforms: [], status: 'running', active: true }],
    changed: (nth) => [{ name: `builder-${nth}`, driver: 'docker-container', endpoint: 'unix://', platforms: [], status: 'running', active: false }],
  },
  {
    name: 'useBuildCache',
    module: '../../src/data/use-build-cache',
    exported: 'useBuildCache',
    channelName: 'build-cache',
    shape: ['records', 'loaded', 'error', 'refresh', 'prune'],
    readings: ['records'],
    delivered: () => [{ id: 'cache-1', type: 'regular', sizeBytes: 10, usageState: 'reclaimable' }],
    changed: (nth) => [{ id: `cache-${nth}`, type: 'regular', sizeBytes: nth, usageState: 'in-use' }],
  },
  {
    name: 'useContexts',
    module: '../../src/data/use-contexts',
    exported: 'useContexts',
    channelName: 'contexts',
    shape: ['contexts', 'active', 'loaded', 'error', 'refresh', 'create', 'remove', 'use'],
    readings: ['contexts'],
    delivered: () => [{ name: 'default', endpoint: 'unix:///var/run/docker.sock', kind: 'local', tls: false, active: true }],
    changed: (nth) => [{ name: `context-${nth}`, endpoint: 'ssh://build-host', kind: 'ssh', tls: false, active: true }],
  },
  {
    name: 'usePlugins',
    module: '../../src/data/use-plugins',
    exported: 'usePlugins',
    channelName: 'plugins',
    shape: ['cli', 'daemon', 'loaded', 'error', 'refresh', 'readPrivileges', 'install', 'enable', 'disable', 'inspect', 'remove'],
    readings: ['cli', 'daemon'],
    delivered: () => ({
      cli: { items: [{ name: 'compose', command: 'docker compose', availability: 'enabled' }] },
      daemon: { items: [{ id: 'id-sshfs', name: 'vieux/sshfs:latest', enabled: false, interfaceTypes: [], type: 'volume driver' }] },
    }),
    changed: (nth) => ({
      cli: { items: [{ name: `compose-${nth}`, command: 'docker compose', availability: 'enabled' }] },
      daemon: { items: [{ id: 'id-sshfs', name: `vieux/sshfs:${nth}`, enabled: true, interfaceTypes: [], type: 'volume driver' }] },
    }),
  },
  {
    name: 'useRegistries',
    module: '../../src/data/use-registries',
    exported: 'useRegistries',
    channelName: 'registries',
    shape: ['registries', 'loaded', 'error', 'refresh', 'logIn', 'logOut'],
    readings: ['registries'],
    delivered: () => [{ host: 'docker.io', serverUrl: 'https://index.docker.io/v1/', authenticated: false, secure: true, official: true }],
    changed: (nth) => [{ host: `ghcr-${nth}.io`, serverUrl: `https://ghcr-${nth}.io`, authenticated: true, secure: true, official: false }],
  },
];

/** Long enough for any clock a hook could have kept to have fired many times. */
const LONGER_THAN_ANY_CLOCK_MS = 600_000;

let harness: ChannelHarness;

beforeEach(() => {
  harness = arrangeLiveChannel();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mount(listing: ListingCase): Promise<RenderHookResult<HookResult, unknown>> {
  const module = (await import(/* @vite-ignore */ listing.module)) as Record<string, () => HookResult>;
  const useListing = module[listing.exported]!;
  return renderHook(() => useListing());
}

/** What the hook exposes for the delivery: one reading, or one per side. */
function readingsOf(result: HookResult, listing: ListingCase): unknown[] {
  return listing.readings.map((key) => result[key]);
}

/** The delivery, split the way the hook exposes it. */
function expectedOf(value: Record<string, unknown> | unknown[], listing: ListingCase): unknown[] {
  if (listing.readings.length === 1) return [value];
  return listing.readings.map((key) => (value as Record<string, unknown>)[key]);
}

describe('every listing the server holds arrives on the live channel', () => {
  for (const listing of LISTINGS) {
    describe(listing.name, () => {
      // Each hook's own spec states the contract line asserted here.
      it('answers exactly the shape its screen uses', async () => {
        const { result } = await mount(listing);

        expect(Object.keys(result.current).sort()).toEqual([...listing.shape].sort());
        expect(typeof result.current.refresh).toBe('function');
      });

      // REQ-40 — an open channel that has delivered nothing leaves the screen loading, not empty-and-done.
      it('is not loaded, with nothing to show, while the channel has delivered nothing', async () => {
        const { result } = await mount(listing);
        act(() => channelOpens());

        expect(result.current.loaded).toBe(false);
        expect(result.current.error).toBeUndefined();
        for (const reading of readingsOf(result.current, listing)) {
          expect(Array.isArray(reading) ? reading : (reading as { items: unknown[] }).items).toEqual([]);
        }
      });

      // REQ-8 — the value the channel delivers is what the screen shows.
      it('shows what the channel delivered, and is loaded from it', async () => {
        const { result } = await mount(listing);
        act(() => channelOpens());

        const value = listing.delivered();
        act(() => deliverValue(listing.channelName, value));

        expect(readingsOf(result.current, listing)).toEqual(expectedOf(value, listing));
        expect(result.current.loaded).toBe(true);
      });

      // REQ-17, REQ-39 — no clock and no request: the hook asks the server for the listing never,
      // and the one connection it uses is the window's live channel.
      it('makes no request of its own, on mount or on any stretch of time', async () => {
        vi.useFakeTimers();
        await mount(listing);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });

        expect(harness.requests).toEqual([]);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(LONGER_THAN_ANY_CLOCK_MS);
        });

        expect(harness.requests, `${listing.name} asked the server for its listing on a clock`).toEqual([]);
        expect(FakeEventSource.instances.map((channel) => channel.url)).toEqual(['/api/live']);
      });

      // REQ-33 — a change made outside the application reaches the screen with the operator doing
      // nothing, and without a request being made for it.
      it('follows a change delivered with nothing operated', async () => {
        const { result } = await mount(listing);
        act(() => channelOpens());
        act(() => deliverValue(listing.channelName, listing.delivered()));

        const changed = listing.changed(1);
        act(() => deliverValue(listing.channelName, changed));

        expect(readingsOf(result.current, listing)).toEqual(expectedOf(changed, listing));
        expect(harness.requests).toEqual([]);
      });

      // REQ-12 — a listing delivered again unchanged replaces nothing the operator has in hand.
      it('keeps the very reading it holds when the same one is delivered again', async () => {
        const { result } = await mount(listing);
        act(() => channelOpens());
        act(() => deliverValue(listing.channelName, listing.delivered()));
        const held = readingsOf(result.current, listing);

        for (let delivery = 0; delivery < 5; delivery += 1) act(() => deliverValue(listing.channelName, listing.delivered()));

        readingsOf(result.current, listing).forEach((reading, index) => {
          expect(reading, `${listing.name} replaced a reading with an equal one`).toBe(held[index]);
        });
      });

      // REQ-24 — a context switch: the server drops what it holds and says so, and the screen is
      // back to having been delivered nothing rather than showing the daemon left behind.
      it('is no longer loaded, and shows nothing, once the channel says the held values are gone', async () => {
        const { result } = await mount(listing);
        act(() => channelOpens());
        act(() => deliverValue(listing.channelName, listing.delivered()));

        act(() => deliverDiscard());

        expect(result.current.loaded).toBe(false);
        for (const reading of readingsOf(result.current, listing)) {
          expect(Array.isArray(reading) ? reading : (reading as { items: unknown[] }).items).toEqual([]);
        }
      });

      it('shows the new context reading delivered after a discard', async () => {
        const { result } = await mount(listing);
        act(() => channelOpens());
        act(() => deliverValue(listing.channelName, listing.delivered()));
        act(() => deliverDiscard());

        const arrived = listing.changed(2);
        act(() => deliverValue(listing.channelName, arrived));

        expect(result.current.loaded).toBe(true);
        expect(readingsOf(result.current, listing)).toEqual(expectedOf(arrived, listing));
      });

      // REQ-11 — a channel that is not delivering is reported through the state the hook already has.
      it('reports a failure while the channel is not delivering, and clears it when it delivers again', async () => {
        const { result } = await mount(listing);
        act(() => channelOpens());
        expect(result.current.error).toBeUndefined();

        act(() => dropChannel());
        expect(result.current.error).toBeTruthy();

        act(() => channelOpens());
        expect(result.current.error).toBeUndefined();
      });

      // REQ-12 — a drop does not blank what the operator has on screen.
      it('keeps the reading it holds when the channel drops', async () => {
        const { result } = await mount(listing);
        act(() => channelOpens());
        const value = listing.delivered();
        act(() => deliverValue(listing.channelName, value));

        act(() => dropChannel());

        expect(readingsOf(result.current, listing)).toEqual(expectedOf(value, listing));
      });

      // REQ-18 — what the retry the screen offers does: it asks for the channel again, nothing else.
      it('asks for the channel again when refreshed while it is not delivering', async () => {
        const { result } = await mount(listing);
        act(() => channelOpens());
        act(() => dropChannel());
        const dropped = liveChannel();

        act(() => (result.current.refresh as () => void)());

        expect(dropped.closed).toBe(true);
        expect(FakeEventSource.instances).toHaveLength(2);
        expect(harness.requests).toEqual([]);
      });

      // REQ-23 — and with the channel delivering: the one listing whose screen offers a control
      // whose whole job is "read again now" asks the server, and the nine others read nothing at all.
      // What that press then does with the answer is `use-compose-projects.test.tsx`.
      if (listing.refreshAsksTheServer) {
        it('asks the server to read again when refreshed while the channel is delivering', async () => {
          harness.answers(RELOAD_URL, { ok: true, reloaded: [listing.channelName], skipped: [], failed: [] }, { method: 'POST' });
          const { result } = await mount(listing);
          act(() => channelOpens());
          const delivering = liveChannel();

          act(() => (result.current.refresh as () => void)());

          await waitFor(() => expect(harness.requests).toEqual([{ url: RELOAD_URL, method: 'POST' }]));
          expect(delivering.closed).toBe(false);
          expect(FakeEventSource.instances).toHaveLength(1);
        });
      } else {
        it('does nothing when refreshed while the channel is delivering', async () => {
          const { result } = await mount(listing);
          act(() => channelOpens());
          const delivering = liveChannel();

          act(() => (result.current.refresh as () => void)());

          expect(delivering.closed).toBe(false);
          expect(FakeEventSource.instances).toHaveLength(1);
          expect(harness.requests, `${listing.name} asked the server for a reading no control of its screen offers`).toEqual([]);
        });
      }

      // plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1 — a daemon event
      // triggers nothing here: what the daemon did reaches the screen as the value the server pushes.
      it('reads nothing for a daemon event, and changes nothing on one', async () => {
        const { result } = await mount(listing);
        act(() => channelOpens());
        act(() => deliverValue(listing.channelName, listing.delivered()));
        const held = readingsOf(result.current, listing);

        for (const type of ['container', 'image', 'volume', 'network', 'plugin', 'daemon']) {
          act(() => deliverDaemonEvent({ id: `evt-${type}`, timestamp: '2026-01-01T00:00:00Z', type, action: 'create' }));
        }

        expect(harness.requests, `${listing.name} read again because of a daemon event`).toEqual([]);
        readingsOf(result.current, listing).forEach((reading, index) => {
          expect(reading).toBe(held[index]);
        });
      });
    });
  }
});
