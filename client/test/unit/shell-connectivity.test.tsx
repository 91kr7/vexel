import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FakeEventSource, channelOpens, deliverValue, dropChannel, liveChannel } from '../support/live-channel';

// The live channel client is a module-level EventSource singleton, and the
// screens the Shell mounts hold state of their own: a fresh module registry per
// test keeps one test's connection and one test's mocks out of the next.
beforeEach(() => {
  vi.resetModules();
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
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
  stacks: { compose: 0, total: 0 },
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

const coverageBaseline = {
  declared: { engineApiVersion: '1.43', cliVersion: '24.0' },
  daemon: { version: '24.0.7', apiVersion: '1.43' },
  comparison: 'match',
};

// Shell mounts more than the connectivity status this suite targets (the
// containers list for the nav badge, preferences, analysis-cache usage); the
// mock must route each endpoint to a response of the right shape, or those
// other hooks crash / hang on data meant for a different endpoint. The status
// itself is not among them: it arrives on the channel and is asked of nobody
// (…-multiplexed_sse/REQ-17, /REQ-39), so it is delivered below.
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
    // The About screen's coverage matrix reads the declared Docker baseline (REQ-106); this
    // suite pins that screen to prove the shell's own cards survive an unreachable daemon, so
    // it needs an answer of the right shape here too.
    if (url.startsWith('/api/system/baseline')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(coverageBaseline) });
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
  // The server accepts the channel and pushes the status on it. A channel that is
  // not delivering is reported as an unreachable daemon (REQ-11), which would
  // stand in for every status this helper is handed.
  act(() => channelOpens());
  act(() => deliverValue('connection-status', status));

  return { fetchMock };
}

/** How many live channels the page has opened; the page opens streams of its own elsewhere. */
function liveChannels(): number {
  return FakeEventSource.instances.filter((instance) => instance.url === '/api/live').length;
}

/** The titles of the cards on screen, as opposed to any text a screen's own content draws. */
function cardTitles(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-card__title, .ui-section-header__title')).map(
    (title) => title.textContent ?? '',
  );
}

describe('Shell — daemon connectivity (app-shell/specs/shell.md)', () => {
  // plan-docker_management_app/REQ-13 — the negotiated Engine API version is surfaced once the daemon is reachable
  it('shows the negotiated Engine API version once the daemon reports reachable', async () => {
    await renderShellWith(reachableStatus);

    await waitFor(() => expect(screen.getByText(/Engine API v1\.43/)).toBeInTheDocument());
    expect(screen.queryByText(unreachableStatus.daemon.cause)).not.toBeInTheDocument();
  });

  // The lost connection is told by the header report and its retry, and nowhere in the page body:
  // no panel, no banner, no row, no inline message, and no toast
  // (plan-docker_management_app-inline_error_panels/REQ-1, /REQ-2, /REQ-13; REQ-10)
  it('tells the lost connection in the header alone, the page body saying nothing about it', async () => {
    await renderShellWith(unreachableStatus);

    const header = () => document.querySelector<HTMLElement>('.ui-frame__header')!;
    const content = () => document.querySelector<HTMLElement>('.ui-frame__content')!;

    await waitFor(() => expect(header().textContent).toContain('Docker daemon unreachable'));
    expect(within(header()).getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
    expect(content().textContent, 'the lost connection was reported in the page body').not.toContain('unreachable');
    expect(content().textContent, 'the cause was reported in the page body').not.toContain(unreachableStatus.daemon.cause);
    expect(document.querySelector('.ui-toast'), 'the lost connection raised a toast').toBeNull();

    // The rest of the screen stays usable. The "CLI availability" and "Local storage"
    // cards are the shell's own surfaces of REQ-110 and REQ-113, and they sit above
    // the last entry of the navigation — the screen now labelled "About" (shell.md).
    // The screen is pinned rather than inherited: the landing screen is the Dashboard,
    // which carries neither of them. The shell draws no event stream there any more
    // (plan-ui-coherence-optimisation/REQ-71).
    await userEvent.setup().click(screen.getByRole('button', { name: /About/ }));
    // Scoped to the cards' own titles: the coverage matrix names capability areas
    // of its own, so an unscoped locator matches the screen's content as well.
    expect(cardTitles()).toContain('CLI availability');
    expect(cardTitles()).toContain('Local storage');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-10 and …-multiplexed_sse/REQ-18 — the retry action is what the
  // operator can do about a connection that is down: it asks for the channel again, and asks the
  // server for no status of its own.
  it('retrying asks for the live channel again, and the server for nothing', async () => {
    const { fetchMock } = await renderShellWith(reachableStatus);
    const connectivityCalls = () => fetchMock.mock.calls.filter(([input]) => requestUrl(input).startsWith('/api/connectivity/status'));

    act(() => dropChannel());
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0));
    const dropped = liveChannel();
    const openedBefore = liveChannels();

    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Retry' })[0]);

    expect(dropped.closed, 'the channel that was not delivering was left standing').toBe(true);
    expect(liveChannels(), 'the retry did not ask for the channel again').toBe(openedBefore + 1);
    expect(connectivityCalls(), 'the retry asked the server for the status').toHaveLength(0);
  });

  // plan-docker_management_app/REQ-11, plan-docker_management_app/REQ-12 — a live event updates the event stream panel without a manual refresh
  it('shows a live daemon event in the "Daemon event stream" panel as it arrives', async () => {
    await renderShellWith(reachableStatus);
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));

    act(() => {
      liveChannel().emit(
        'daemon-event',
        JSON.stringify({ id: 'evt-1', timestamp: new Date().toISOString(), type: 'network', action: 'create', actor: 'test-net' }),
      );
    });

    await waitFor(() => expect(screen.getByText('test-net')).toBeInTheDocument());
  });
});

/**
 * The header names which side is unreachable, and it is the only place the connection is reported
 * (plan-docker_management_app-inline_error_panels/REQ-9, /REQ-11). One flag used to report both
 * states under one wording.
 */
describe('Shell — the header names which side is unreachable (…-inline_error_panels/REQ-9)', () => {
  const pill = () => document.querySelector<HTMLElement>('.ui-status-pill')!;
  const header = () => document.querySelector<HTMLElement>('.ui-frame__header')!;

  // shell.md — "`Docker daemon unreachable` while it delivers a status saying the daemon cannot be
  // reached", with the inline Retry kept (…/REQ-11).
  it('reads "Docker daemon unreachable" while the channel delivers a daemon it could not reach', async () => {
    await renderShellWith(unreachableStatus);

    await waitFor(() => expect(pill().textContent).toContain('Docker daemon unreachable'));
    expect(pill().textContent, 'the header named the server for a daemon that is down').not.toContain('Server unreachable');
    expect(within(header()).getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
  });

  // shell.md — "`Server unreachable` while the live channel is not delivering". The daemon behind
  // it may well be running: what has stopped answering is the application server.
  it('reads "Server unreachable" while the channel is not delivering', async () => {
    await renderShellWith(reachableStatus);
    await waitFor(() => expect(pill().textContent).toContain('Live · daemon events'));

    act(() => dropChannel());

    await waitFor(() => expect(pill().textContent).toContain('Server unreachable'));
    expect(pill().textContent, 'the header named the daemon for a server that stopped answering').not.toContain(
      'Docker daemon unreachable',
    );
    expect(within(header()).getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
  });

  // shell.md — "`Live · daemon events` otherwise", and no retry offered while nothing is unreachable.
  it('reads "Live · daemon events" while the daemon is reachable, offering no retry', async () => {
    await renderShellWith(reachableStatus);

    await waitFor(() => expect(pill().textContent).toContain('Live · daemon events'));
    expect(pill().textContent).not.toContain('unreachable');
    expect(within(header()).queryAllByRole('button', { name: 'Retry' })).toHaveLength(0);
  });
});

/**
 * The Shell is where the reload signal watches the live channel, once for the life of the
 * application, so a connection that comes back reads every mounted view again
 * (app-shell/specs/shell.md, plan-docker_management_app-inline_error_panels/REQ-12).
 */
describe('Shell — the reload signal watches the channel (…-inline_error_panels/REQ-12)', () => {
  /** A read subscribed to the same signal instance the rendered Shell uses. */
  async function subscribedRead(): Promise<{ count: () => number }> {
    const { subscribeToReload } = await import('../../src/data/reload-signal');
    let count = 0;
    subscribeToReload(() => {
      count += 1;
    });
    return { count: () => count };
  }

  it('reads every mounted view again when the channel returns, and nothing on the first open', async () => {
    await renderShellWith(reachableStatus);
    const read = await subscribedRead();
    expect(read.count(), 'the start-up open read every view again').toBe(0);

    await act(async () => {
      dropChannel();
      channelOpens();
      await Promise.resolve();
    });
    await waitFor(() => expect(read.count()).toBeGreaterThan(0));

    expect(read.count(), 'the channel returning raised more than one reload').toBe(1);
  });
});
