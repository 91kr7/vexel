import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FakeEventSource, channelOpens, deliverValue } from '../support/live-channel';

/**
 * Where the volume and network listings come from, now that they come from the
 * channel
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17,
 * REQ-39).
 *
 * This file used to hold the screen-scoped reading of
 * `plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40`
 * and REQ-41 — both listings read only while the Volumes & networks screen was
 * open. That is the **stated departure** of this plan: the open channel holds
 * the demand for every value the server registers, so both are read on the
 * server's own period whenever a window is open, and the screen waits for
 * nothing when it opens.
 *
 * What survives of the claim is the half that still bites, and it is now wider:
 * neither listing is requested from **any** screen, on any trigger. It is checked
 * on the shell rather than on either hook, because that is where the question is:
 * a hook asked in isolation cannot say what the rest of the application did.
 */

/** Every request the application made, in order. */
let requests: string[];

/** Ten of the 3 000 ms period both listings used to poll on: a clock would have fired. */
const LONG_ENOUGH_FOR_EITHER_CLOCK_MS = 30_000;

const reachableStatus = {
  daemon: { reachable: true },
  apiVersion: '1.43',
  engineVersion: '24.0.0',
  cli: {
    docker: { available: true, version: '24.0.0' },
    compose: { available: true, version: '2.24.0' },
    buildx: { available: true, version: '0.11.0' },
  },
  unavailableCapabilities: [],
};

const systemOverview = {
  containers: { total: 0, running: 0, paused: 0, stopped: 0 },
  images: { count: 0, sizeBytes: 0 },
  volumes: { count: 0, sizeBytes: 0 },
  stacks: { compose: 0, total: 0 },
  buildCache: { sizeBytes: 0 },
  diskUsage: { categories: [], totalBytes: 0 },
};

const VOLUME = {
  name: 'vexel-unit-volume',
  driver: 'local',
  mountpoint: '/data/vexel-unit-volume',
  scope: 'local',
  createdAt: '',
  labels: {},
  options: {},
  mountedBy: [],
};

const NETWORK = { id: 'net-1', name: 'vexel-unit-network', driver: 'bridge', scope: 'local', labels: {}, options: {}, attachedContainers: [] };

function answerFor(url: string): unknown {
  if (url.startsWith('/api/persistence/preferences')) return { listFilters: {}, logFollow: true, logTimestamps: false };
  if (url.startsWith('/api/persistence/analysis-cache')) return { totalSizeBytes: 0 };
  if (url.startsWith('/api/system/overview')) return systemOverview;
  if (url.startsWith('/api/containers') || url.startsWith('/api/images') || url.startsWith('/api/contexts')) return [];
  return reachableStatus;
}

/** Lets mounts and reads settle, and runs the clock, without leaving the fake timers. */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function navRail(): HTMLElement {
  return document.querySelector<HTMLElement>('.ui-nav-rail')!;
}

/**
 * A screen switch under a fake clock, where userEvent's own timers cannot run —
 * the mechanism `container-detail-panel.test.tsx` uses for its tab switch. The
 * rail is what it is scoped to: the Dashboard names several of these screens in
 * cross-navigation tiles of its own.
 */
async function activateScreen(label: string): Promise<void> {
  await act(async () => {
    fireEvent.click(within(navRail()).getByRole('button', { name: new RegExp(label) }));
  });
  expect(screen.getByRole('heading', { level: 1, name: label })).toBeInTheDocument();
}

/**
 * The shell and its providers are imported from the registry each test resets,
 * so the live channel behind them is this test's own and not the previous one's.
 */
async function renderShell(): Promise<void> {
  const { Shell } = await import('../../src/shell/Shell');
  const { ConnectionStatusProvider } = await import('../../src/shell/services/ConnectionStatusService');
  const { CrossNavigationProvider } = await import('../../src/shell/services/CrossNavigationService');
  const { DaemonEventStreamProvider } = await import('../../src/shell/services/EventStreamService');
  const { ErrorReportingProvider } = await import('../../src/shell/services/ErrorReportingService');
  const { ProgressProvider } = await import('../../src/shell/services/ProgressService');
  // The order App wires (app-shell/specs/app.md): a report is a toast, so the toast
  // service and the connection status both sit above the reporter.
  const { ToastProvider } = await import('../../src/ui');
  render(
    <ToastProvider>
      <ConnectionStatusProvider>
        <ErrorReportingProvider>
          <ProgressProvider>
            <DaemonEventStreamProvider>
              <CrossNavigationProvider>
                <Shell />
              </CrossNavigationProvider>
            </DaemonEventStreamProvider>
          </ProgressProvider>
        </ErrorReportingProvider>
      </ConnectionStatusProvider>
    </ToastProvider>,
  );
  await advance(0);
  act(() => channelOpens());
}

/** Every request made to the listing endpoints this file is about. */
function listingRequests(): string[] {
  return requests.filter((url) => url.startsWith('/api/volumes') || url.startsWith('/api/networks'));
}

beforeEach(() => {
  requests = [];
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      requests.push(url);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(answerFor(url)) });
    }),
  );
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the volume and network listings are asked for on no screen at all', () => {
  it('asks for neither on the screen the application opens on, however long the clock runs', async () => {
    await renderShell();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();

    await advance(LONG_ENOUGH_FOR_EITHER_CLOCK_MS);

    expect(listingRequests(), 'a listing was read with the Dashboard active').toEqual([]);
  });

  it('asks for neither on a screen the operator moves to, however long the clock runs', async () => {
    await renderShell();

    await activateScreen('Containers');
    await advance(LONG_ENOUGH_FOR_EITHER_CLOCK_MS);

    expect(listingRequests(), 'a listing was read with Containers active').toEqual([]);
  });

  // The screen that shows them is the one that used to read them, and the one where a clock left
  // standing would show first.
  it('asks for neither on the screen that shows them, however long the clock runs', async () => {
    await renderShell();

    await activateScreen('Volumes & networks');
    await advance(LONG_ENOUGH_FOR_EITHER_CLOCK_MS);

    expect(listingRequests(), 'a listing was read with Volumes & networks active').toEqual([]);
  });
});

describe('the screen that shows them shows what the channel delivered', () => {
  // REQ-8, REQ-13 — the demand is the open channel's, so the screen opens on values already held
  // rather than on a reading it starts itself.
  it('lists the volume and the network the channel delivered before the screen was opened', async () => {
    await renderShell();
    act(() => deliverValue('volumes', [VOLUME]));
    act(() => deliverValue('networks', [NETWORK]));

    await activateScreen('Volumes & networks');

    expect(screen.getByText(VOLUME.name)).toBeInTheDocument();
    expect(screen.getByText(NETWORK.name)).toBeInTheDocument();
    expect(listingRequests()).toEqual([]);
  });

  // REQ-33 — a change made outside the application reaches the open screen with nothing pressed.
  it('shows a volume and a network delivered while the screen is open, with nothing operated', async () => {
    await renderShell();
    await activateScreen('Volumes & networks');
    act(() => deliverValue('volumes', []));
    act(() => deliverValue('networks', []));
    expect(screen.queryByText(VOLUME.name)).not.toBeInTheDocument();

    act(() => deliverValue('volumes', [VOLUME]));
    act(() => deliverValue('networks', [NETWORK]));

    expect(screen.getByText(VOLUME.name)).toBeInTheDocument();
    expect(screen.getByText(NETWORK.name)).toBeInTheDocument();
    expect(listingRequests()).toEqual([]);
  });
});
