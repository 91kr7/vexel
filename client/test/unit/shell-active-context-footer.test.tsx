import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Shell } from '../../src/shell/Shell';
import { ConnectionStatusProvider } from '../../src/shell/services/ConnectionStatusService';
import { CrossNavigationProvider } from '../../src/shell/services/CrossNavigationService';
import { DaemonEventStreamProvider } from '../../src/shell/services/EventStreamService';
import { ErrorReportingProvider } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';

// app-shell/specs/shell.md — "The rail's footer names the context every screen
// currently follows, as `name (kind)` ... It follows a switch made on the
// Contexts screen without the shell being remounted (REQ-93)". Driven through
// the real user path: the Contexts screen's own "use" action, with the server
// answering as it does. No timer is advanced: what is under test is the switch
// making the shell follow, not the inventory poll eventually noticing.

class FakeEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
  }
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

const daemonInfo = {
  version: '24.0.0',
  apiVersion: '1.43',
  storageDriver: 'overlay2',
  cgroupDriver: 'systemd',
  operatingSystem: 'Test OS',
  osType: 'linux',
  kernelVersion: '6.1.0',
  architecture: 'aarch64',
  rootDirectory: '/var/lib/docker',
  containers: { total: 0, running: 0, paused: 0, stopped: 0 },
};

function contextsFor(activeName: string) {
  return [
    { name: 'first', endpoint: 'unix:///var/run/docker.sock', kind: 'local', tls: false, active: activeName === 'first' },
    { name: 'second', endpoint: 'ssh://operator@build-host', kind: 'ssh', tls: false, active: activeName === 'second' },
  ];
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

let activeContextName = 'first';

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input.toString();
}

beforeEach(() => {
  activeContextName = 'first';
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.startsWith('/api/contexts/daemon-info')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(daemonInfo) });
      }
      // The server confirms the switch, and every later reading of the inventory answers for it.
      if (url.startsWith('/api/contexts/') && url.endsWith('/use') && init?.method === 'POST') {
        activeContextName = url.slice('/api/contexts/'.length, -'/use'.length);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(contextsFor(activeContextName).find((context) => context.name === activeContextName)),
        });
      }
      if (url.startsWith('/api/contexts')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(contextsFor(activeContextName)) });
      }
      if (url.startsWith('/api/containers') || url.startsWith('/api/images')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.startsWith('/api/persistence/preferences')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ listFilters: {}, logFollow: true, logTimestamps: false }) });
      }
      if (url.startsWith('/api/persistence/analysis-cache')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalSizeBytes: 0 }) });
      }
      if (url.startsWith('/api/system/overview')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(systemOverview) });
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

/** The rail, where the footer names the context every screen follows — the row titles of the Contexts screen name contexts too. */
function rail() {
  return within(screen.getByRole('navigation'));
}

/** The Contexts screen's own row for a context, by its `name (kind)` title. */
function screenRow(title: string): HTMLElement {
  const heading = screen
    .getAllByText(title)
    .find((element) => element.closest('.ui-card-list__item') !== null);
  return heading!.closest('.ui-card-list__item') as HTMLElement;
}

async function renderShellOnContexts() {
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
  await waitFor(() => expect(screen.getByText('Live · daemon events')).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /Contexts/ }));
  await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Docker contexts' })).toBeInTheDocument());
}

describe('the shell footer follows the active context (app-shell/specs/shell.md)', () => {
  it('names the context the inventory marks active, as `name (kind)`', async () => {
    await renderShellOnContexts();

    await waitFor(() => expect(rail().getByText('first (local)')).toBeInTheDocument());
  });

  // plan-docker_management_app/REQ-93 — "the active-context indicator in the shell updates"
  it('renames itself after a switch made on the Contexts screen', async () => {
    await renderShellOnContexts();
    await waitFor(() => expect(rail().getByText('first (local)')).toBeInTheDocument());

    await userEvent.click(screen.getAllByText('use', { exact: true })[0]!);

    // The screen itself has taken the switch: it confirms it and its list marks the new context.
    await waitFor(() => expect(screen.getByText('Active context switched')).toBeInTheDocument());
    await waitFor(() => expect(screenRow('second (ssh)')).toHaveTextContent('active'));

    await waitFor(() => expect(rail().getByText('second (ssh)')).toBeInTheDocument());
  });

  // The counterpart of the above: the context left behind is no longer named.
  it('stops naming the context left behind', async () => {
    await renderShellOnContexts();
    await waitFor(() => expect(rail().getByText('first (local)')).toBeInTheDocument());

    await userEvent.click(screen.getAllByText('use', { exact: true })[0]!);

    await waitFor(() => expect(rail().queryByText('first (local)')).not.toBeInTheDocument());
  });
});
