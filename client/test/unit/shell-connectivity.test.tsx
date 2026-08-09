import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Both the connectivity data client (fetch) and the event-stream data client
// (a module-level EventSource singleton) need a fresh module registry per
// test so mocks from one test never leak into the next.
class FakeEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
  }
}

let currentEventSource: FakeEventSource | undefined;

beforeEach(() => {
  vi.resetModules();
  currentEventSource = undefined;
  vi.stubGlobal(
    'EventSource',
    class extends FakeEventSource {
      constructor(url: string) {
        super(url);
        currentEventSource = this;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

const unreachableStatus = {
  daemon: { reachable: false, cause: 'Connection refused by the Docker endpoint' },
  cli: {
    docker: { available: false },
    compose: { available: false },
    buildx: { available: false },
  },
  unavailableCapabilities: ['The raw console CLI channel is unavailable: the docker CLI was not found.'],
};

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input.toString();
}

// The Dashboard is the default landing screen (app-shell/specs/shell.md) and it
// reads the host overview: without an answer of the right shape here the shell
// renders the connectivity payload as if it were an overview and throws.
const systemOverview = {
  containers: { total: 0, running: 0, paused: 0, stopped: 0 },
  images: { count: 0, sizeBytes: 0 },
  volumes: { count: 0, sizeBytes: 0 },
  stacks: { compose: 0, swarm: 0, total: 0 },
  buildCache: { sizeBytes: 0 },
  diskUsage: {
    categories: [
      { id: 'images', sizeBytes: 0, itemCount: 0 },
      { id: 'containers', sizeBytes: 0, itemCount: 0 },
      { id: 'volumes', sizeBytes: 0, itemCount: 0 },
      { id: 'build-cache', sizeBytes: 0, itemCount: 0 },
    ],
    totalBytes: 0,
  },
};

// Shell mounts more than the connectivity probe this suite targets (the
// containers list for the nav badge, preferences, analysis-cache usage); the
// mock must route each endpoint to a response of the right shape, or those
// other hooks crash / hang on data meant for a different endpoint.
async function renderShellWith(status: unknown) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.startsWith('/api/containers')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.startsWith('/api/persistence/preferences')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ listFilters: {}, logFollow: true, logTimestamps: false }) });
    }
    if (url.startsWith('/api/persistence/analysis-cache')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalSizeBytes: 0 }) });
    }
    // The rail's context count and its active-context footer read the context
    // inventory (REQ-92, REQ-93); without its own answer here the Shell renders
    // the connectivity payload as if it were a list and throws.
    if (url.startsWith('/api/contexts')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.startsWith('/api/system/overview')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(systemOverview) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(status) });
  });
  vi.stubGlobal('fetch', fetchMock);

  const { Shell } = await import('../../src/shell/Shell');
  const { ErrorReportingProvider } = await import('../../src/shell/services/ErrorReportingService');
  const { ProgressProvider } = await import('../../src/shell/services/ProgressService');
  const { ConnectionStatusProvider } = await import('../../src/shell/services/ConnectionStatusService');
  const { DaemonEventStreamProvider } = await import('../../src/shell/services/EventStreamService');
  // The Shell switches to the screen a cross-navigation request names
  // (app-shell/specs/shell.md), so it only stands inside a provider.
  const { CrossNavigationProvider } = await import('../../src/shell/services/CrossNavigationService');

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

  return { fetchMock };
}

describe('Shell — daemon connectivity (app-shell/specs/shell.md)', () => {
  // plan-docker_management_app/REQ-13 — the negotiated Engine API version is surfaced once the daemon is reachable
  it('shows the negotiated Engine API version once the daemon reports reachable', async () => {
    await renderShellWith(reachableStatus);

    await waitFor(() => expect(screen.getByText(/Engine API v1\.43/)).toBeInTheDocument());
    expect(screen.queryByText(unreachableStatus.daemon.cause)).not.toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-10 — the unreachable cause is explained with a retry action, screen stays usable
  it('explains the unreachable cause with a retry action while the rest of the screen stays visible', async () => {
    await renderShellWith(unreachableStatus);

    await waitFor(() => expect(screen.getByText(unreachableStatus.daemon.cause)).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);

    // The unreachable banner does not replace or hide the rest of the screen. The
    // "CLI availability" card belongs to the screens no feature batch has built
    // yet, so it is pinned on one of those rather than on the landing screen,
    // which has been the real Dashboard since batch 25.
    await userEvent.setup().click(screen.getByRole('button', { name: /Swarm/ }));
    expect(screen.getByText('CLI availability')).toBeInTheDocument();
    expect(screen.getByText('Daemon event stream')).toBeInTheDocument();
    expect(screen.getByText(unreachableStatus.daemon.cause)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-10 — the retry action re-probes the daemon immediately
  it('retrying re-fetches the connectivity status', async () => {
    const { fetchMock } = await renderShellWith(unreachableStatus);
    const connectivityCalls = () => fetchMock.mock.calls.filter(([input]) => requestUrl(input).startsWith('/api/connectivity/status'));

    await waitFor(() => expect(connectivityCalls()).toHaveLength(1));
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Retry' })[0]);

    await waitFor(() => expect(connectivityCalls().length).toBeGreaterThanOrEqual(2));
  });

  // plan-docker_management_app/REQ-11, plan-docker_management_app/REQ-12 — a live event updates the event stream panel without a manual refresh
  it('shows a live daemon event in the "Daemon event stream" panel as it arrives', async () => {
    await renderShellWith(reachableStatus);
    await waitFor(() => expect(currentEventSource).toBeDefined());

    act(() => {
      currentEventSource!.onmessage?.({
        data: JSON.stringify({ id: 'evt-1', timestamp: new Date().toISOString(), type: 'network', action: 'create', actor: 'test-net' }),
      });
    });

    await waitFor(() => expect(screen.getByText('test-net')).toBeInTheDocument());
  });
});
