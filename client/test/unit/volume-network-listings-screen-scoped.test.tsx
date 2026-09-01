import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ConnectionStatusProvider } from '../../src/shell/services/ConnectionStatusService';
import { CrossNavigationProvider } from '../../src/shell/services/CrossNavigationService';
import { DaemonEventStreamProvider } from '../../src/shell/services/EventStreamService';
import { ErrorReportingProvider } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';

/**
 * Where the volume and network listings are read, and where they are not
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40,
 * REQ-42).
 *
 * The shell used to mount `useVolumes()` and `useNetworks()` for every screen,
 * so both polled wherever the operator was. Each now belongs to the component
 * that shows it — the screen and its Networks panel — and the claim is about who
 * mounts them, so it is checked on the shell itself rather than on either hook:
 * a hook asked for its behaviour in isolation would answer the same before and
 * after this change.
 *
 * The two reads are the subject, so they are the only thing mocked away from the
 * real client; every other endpoint the shell touches is answered by shape, as
 * in `shell.test.tsx`.
 */

const fetchVolumes = vi.fn();
const fetchNetworks = vi.fn();

// The real modules are spread and only the listing read is replaced: the panels'
// create, remove, prune, attach and inspect calls stay the real ones, so nothing
// here can make a panel look quieter than it is.
vi.mock('../../src/data/volumes-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/volumes-client')>()),
  fetchVolumes: () => fetchVolumes(),
}));
vi.mock('../../src/data/networks-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/networks-client')>()),
  fetchNetworks: () => fetchNetworks(),
}));

const { Shell } = await import('../../src/shell/Shell');

/** Ten periods of the 3 000 ms poll both listings declare: a clock of theirs would have fired. */
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

async function renderShell(): Promise<void> {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConnectionStatusProvider>
          <DaemonEventStreamProvider>
            <CrossNavigationProvider>
              <Shell />
            </CrossNavigationProvider>
          </DaemonEventStreamProvider>
        </ConnectionStatusProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
  await advance(0);
}

beforeEach(() => {
  fetchVolumes.mockReset();
  fetchVolumes.mockResolvedValue([]);
  fetchNetworks.mockReset();
  fetchNetworks.mockResolvedValue([]);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(answerFor(url)) });
    }),
  );
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// REQ-40 — the two listings are read only while the Volumes & networks screen is on screen; on
// every other screen the interface asks for neither.
describe('the volume and network listings on another screen', () => {
  it('asks for neither on the screen the application opens on, however long the clock runs', async () => {
    await renderShell();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();

    await advance(LONG_ENOUGH_FOR_EITHER_CLOCK_MS);

    expect(fetchVolumes, 'the volume listing was read with the Dashboard active').not.toHaveBeenCalled();
    expect(fetchNetworks, 'the network listing was read with the Dashboard active').not.toHaveBeenCalled();
  });

  it('asks for neither on a screen the operator moves to, however long the clock runs', async () => {
    await renderShell();

    await activateScreen('Containers');
    await advance(LONG_ENOUGH_FOR_EITHER_CLOCK_MS);

    expect(fetchVolumes, 'the volume listing was read with Containers active').not.toHaveBeenCalled();
    expect(fetchNetworks, 'the network listing was read with Containers active').not.toHaveBeenCalled();
  });

  // The operator's own case: they were on Volumes & networks earlier, and left. What ran there
  // stops with the screen instead of outliving it.
  it('stops asking for either once the operator leaves the screen that reads them', async () => {
    await renderShell();
    await activateScreen('Volumes & networks');
    await advance(0);
    fetchVolumes.mockClear();
    fetchNetworks.mockClear();

    await activateScreen('Containers');
    await advance(LONG_ENOUGH_FOR_EITHER_CLOCK_MS);

    expect(fetchVolumes, 'the volume listing kept being read after the screen was left').not.toHaveBeenCalled();
    expect(fetchNetworks, 'the network listing kept being read after the screen was left').not.toHaveBeenCalled();
  });
});

// REQ-42 — opening the screen reads both. REQ-40 — that is the one screen on which either is read.
describe('the volume and network listings on the screen that shows them', () => {
  it('reads both the moment Volumes & networks becomes the active screen', async () => {
    await renderShell();
    await advance(LONG_ENOUGH_FOR_EITHER_CLOCK_MS);
    expect(fetchVolumes).not.toHaveBeenCalled();
    expect(fetchNetworks).not.toHaveBeenCalled();

    await activateScreen('Volumes & networks');

    // Both, and on the activation itself: the screen opens on a reading of the
    // daemon rather than on whatever the server was left holding.
    expect(fetchVolumes).toHaveBeenCalledTimes(1);
    expect(fetchNetworks).toHaveBeenCalledTimes(1);
  });

  it('keeps both on their own poll while the screen stays open', async () => {
    await renderShell();
    await activateScreen('Volumes & networks');
    await advance(0);
    expect(fetchVolumes).toHaveBeenCalledTimes(1);
    expect(fetchNetworks).toHaveBeenCalledTimes(1);

    await advance(LONG_ENOUGH_FOR_EITHER_CLOCK_MS);

    expect(fetchVolumes.mock.calls.length).toBeGreaterThan(1);
    expect(fetchNetworks.mock.calls.length).toBeGreaterThan(1);
  });
});
