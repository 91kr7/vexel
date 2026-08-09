import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Shell } from '../../src/shell/Shell';
import { ConnectionStatusProvider } from '../../src/shell/services/ConnectionStatusService';
// The Shell switches to the screen a cross-navigation request names
// (app-shell/specs/shell.md), so it only stands inside a provider.
import { CrossNavigationProvider } from '../../src/shell/services/CrossNavigationService';
import { DaemonEventStreamProvider } from '../../src/shell/services/EventStreamService';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider, useProgress } from '../../src/shell/services/ProgressService';

class FakeEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(public url: string) {}
}

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

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input.toString();
}

beforeEach(() => {
  // Shell mounts more than the connectivity probe (the containers list for
  // the nav badge, preferences, analysis-cache usage); route each endpoint
  // to a response of the right shape so those hooks don't choke on data
  // meant for a different endpoint.
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.startsWith('/api/containers') || url.startsWith('/api/images')) {
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
      return Promise.resolve({ ok: true, json: () => Promise.resolve(reachableStatus) });
    }),
  );
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface ShellApi {
  reportError: ReturnType<typeof useErrorReporter>['reportError'];
  run: ReturnType<typeof useProgress>['run'];
}

async function renderShell() {
  const api: Partial<ShellApi> = {};

  function Driver() {
    api.reportError = useErrorReporter().reportError;
    api.run = useProgress().run;
    return null;
  }

  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConnectionStatusProvider>
          <DaemonEventStreamProvider>
            <CrossNavigationProvider>
              <Driver />
              <Shell />
            </CrossNavigationProvider>
          </DaemonEventStreamProvider>
        </ConnectionStatusProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );

  // Connectivity status resolves asynchronously (REQ-9); wait for it so the
  // header status pill has settled before tests written for batch 1's
  // REQ-1/2/7/8 assert on other parts of the shell.
  await waitFor(() => expect(screen.getByText('Live · daemon events')).toBeInTheDocument());

  return api as ShellApi;
}

describe('Shell', () => {
  // plan-docker_management_app/REQ-1
  it('opens on the Dashboard screen with the Vexel brand and the active-context footer', async () => {
    await renderShell();

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Vexel')).toBeInTheDocument();
    expect(screen.getByText('Active context')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-2
  it('activating a nav entry replaces the main area and marks it active, keeping rail/header/footer', async () => {
    const user = userEvent.setup();
    await renderShell();

    await user.click(screen.getByRole('button', { name: /Containers/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Containers' })).toBeInTheDocument();
    expect(screen.getByText('Vexel')).toBeInTheDocument();
    expect(screen.getByText('Active context')).toBeInTheDocument();

    const activeEntries = screen.getAllByRole('button', { current: 'page' });
    expect(activeEntries).toHaveLength(1);
    expect(activeEntries[0]).toHaveAccessibleName(expect.stringContaining('Containers'));
  });

  // app-shell/specs/error-reporting-service.md — the shell renders errors alongside the screen, not instead of it (REQ-7)
  it('shows a reported error next to the active screen without hiding it', async () => {
    const api = await renderShell();

    act(() => {
      api.reportError('Failed to remove container', 'Error: cannot remove a running container');
    });

    expect(screen.getByText('Failed to remove container')).toBeInTheDocument();
    expect(screen.getByText('Error: cannot remove a running container')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText(/Dashboard is not built yet/)).toBeInTheDocument();
  });

  // app-shell/specs/shell.md — the header status pill reflects the pending-operation count (REQ-8)
  it('reflects an in-flight operation in the header status pill without leaving the screen', async () => {
    const api = await renderShell();

    expect(screen.getByText('Live · daemon events')).toBeInTheDocument();

    let resolveTask!: () => void;
    const task = () => new Promise<void>((resolve) => { resolveTask = resolve; });

    let taskPromise!: Promise<void>;
    act(() => {
      taskPromise = api.run('Removing container', task);
    });

    expect(screen.getByText('1 pending')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();

    resolveTask();
    await act(async () => {
      await taskPromise;
    });

    await waitFor(() => expect(screen.getByText('Live · daemon events')).toBeInTheDocument());
  });
});
