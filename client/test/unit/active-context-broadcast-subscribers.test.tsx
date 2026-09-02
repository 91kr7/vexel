import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { FakeEventSource, channelOpens } from '../support/live-channel';

/**
 * Who re-reads when another daemon becomes the active one
 * (`contexts/specs/active-context-broadcast.md`, REQ-93).
 *
 * The subscribers are "the views that read on demand — the connection status,
 * the daemon information, the disk-usage breakdown, the coverage matrix and the
 * registry repository browsing". **The listings are not among them** on
 * plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-24:
 * the server discards what it holds, says so on the channel, and the new
 * context's values arrive on it. So this file asserts both halves — the five
 * re-read, and the ten listings ask for nothing at all.
 *
 * Every request is recorded rather than each client mocked away: a listing that
 * quietly re-read on the broadcast would show up here as a request nobody
 * expected.
 */

/** Every request the page made, in order. */
let requests: string[];

const DAEMON_INFO_URL = '/api/contexts/daemon-info';
const DISK_USAGE_URL = '/api/system/disk-usage';
const BASELINE_URL = '/api/system/baseline';
const REPOSITORIES_URL = '/api/registries/repositories';

const status = {
  daemon: { reachable: true },
  apiVersion: '1.43',
  engineVersion: '24.0.0',
  cli: { docker: { available: true }, compose: { available: true }, buildx: { available: true } },
  unavailableCapabilities: [],
};

/** What each on-demand endpoint answers; anything else answers an empty list. */
function answerFor(url: string): unknown {
  if (url.startsWith(DAEMON_INFO_URL)) return { version: '24.0.0', apiVersion: '1.43', containers: { total: 0, running: 0, paused: 0, stopped: 0 } };
  if (url.startsWith(DISK_USAGE_URL)) return { categories: [], totalBytes: 0 };
  if (url.startsWith(BASELINE_URL)) return { areas: [], generatedAt: '2026-01-01T00:00:00Z' };
  if (url.startsWith('/api/connectivity')) return status;
  return [];
}

beforeEach(() => {
  requests = [];
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      requests.push(url);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(answerFor(url)) });
    }),
  );
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** How many requests were made to the endpoint named. */
function callsTo(url: string): number {
  return requests.filter((made) => made.startsWith(url)).length;
}

interface OnDemandView {
  name: string;
  /** The endpoint the view reads, so its re-read can be counted. */
  url: string;
  mount: () => Promise<void>;
}

const ON_DEMAND_VIEWS: OnDemandView[] = [
  {
    name: 'useDaemonInfo',
    url: DAEMON_INFO_URL,
    mount: async () => {
      const { useDaemonInfo } = await import('../../src/data/use-daemon-info');
      renderHook(() => useDaemonInfo());
    },
  },
  {
    name: 'useDiskUsage',
    url: DISK_USAGE_URL,
    mount: async () => {
      const { useDiskUsage } = await import('../../src/data/use-disk-usage');
      renderHook(() => useDiskUsage());
    },
  },
  {
    name: 'useCoverage',
    url: BASELINE_URL,
    mount: async () => {
      const { useCoverage } = await import('../../src/data/use-coverage');
      renderHook(() => useCoverage());
    },
  },
  {
    name: 'useRegistryRepositories',
    url: REPOSITORIES_URL,
    mount: async () => {
      const { useRegistryRepositories } = await import('../../src/data/use-registry-repositories');
      renderHook(() => useRegistryRepositories('docker.io', 'nginx'));
    },
  },
];

describe('the views that read on demand re-read on the active-context broadcast (REQ-93)', () => {
  for (const view of ON_DEMAND_VIEWS) {
    it(`${view.name} reads again when another context becomes the active one`, async () => {
      const { notifyActiveContextChanged } = await import('../../src/data/active-context');
      await view.mount();
      await waitFor(() => expect(callsTo(view.url)).toBeGreaterThan(0));
      const readOnMount = callsTo(view.url);

      act(() => notifyActiveContextChanged());

      await waitFor(() => expect(callsTo(view.url)).toBeGreaterThan(readOnMount));
    });
  }

  // The connection status is a subscriber too: after a switch it describes the daemon now in use,
  // not the one left behind.
  it('the connection status describes the daemon now in use after a switch', async () => {
    const { notifyActiveContextChanged } = await import('../../src/data/active-context');
    const { ConnectionStatusProvider, useConnectionStatus } = await import('../../src/shell/services/ConnectionStatusService');
    const probe = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ...status, engineVersion: '24.0.0' }) });
    vi.stubGlobal('fetch', probe);
    function StatusHarness() {
      const current = useConnectionStatus();
      return <span data-testid="engine-version">{current.engineVersion ?? ''}</span>;
    }

    render(
      <ConnectionStatusProvider>
        <StatusHarness />
      </ConnectionStatusProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('engine-version')).toHaveTextContent('24.0.0'));

    probe.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ...status, engineVersion: '25.0.3' }) });
    act(() => notifyActiveContextChanged());

    await waitFor(() => expect(screen.getByTestId('engine-version')).toHaveTextContent('25.0.3'));
  });
});

/** The ten listings the live channel carries, each with the module that reads it. */
const LISTINGS: Array<[string, string, string]> = [
  ['useContainers', '../../src/data/use-containers', 'useContainers'],
  ['useImages', '../../src/data/use-images', 'useImages'],
  ['useVolumes', '../../src/data/use-volumes', 'useVolumes'],
  ['useNetworks', '../../src/data/use-networks', 'useNetworks'],
  ['useComposeProjects', '../../src/data/use-compose-projects', 'useComposeProjects'],
  ['useBuilders', '../../src/data/use-builders', 'useBuilders'],
  ['useBuildCache', '../../src/data/use-build-cache', 'useBuildCache'],
  ['useContexts', '../../src/data/use-contexts', 'useContexts'],
  ['usePlugins', '../../src/data/use-plugins', 'usePlugins'],
  ['useRegistries', '../../src/data/use-registries', 'useRegistries'],
];

describe('the listings are not subscribers, because they arrive on the channel (REQ-24)', () => {
  it('asks the server for nothing when another context becomes the active one, with every one of them mounted', async () => {
    const { notifyActiveContextChanged } = await import('../../src/data/active-context');
    for (const [, module, exported] of LISTINGS) {
      const imported = (await import(/* @vite-ignore */ module)) as Record<string, () => unknown>;
      renderHook(() => imported[exported]!());
    }
    act(() => channelOpens());
    requests.length = 0;

    act(() => notifyActiveContextChanged());
    await act(async () => {
      await Promise.resolve();
    });

    expect(requests, 'a listing re-read from the server on the active-context broadcast').toEqual([]);
  });
});
