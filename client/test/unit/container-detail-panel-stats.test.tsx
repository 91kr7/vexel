import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerDetailPanel } from '../../src/containers/ContainerDetailPanel';
import type { ContainerInspect, ContainerSummary } from '../../src/data/containers-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ReportingServices } from '../support/reporting-services';

const container: ContainerSummary = {
  id: 'container-1',
  shortId: 'container1',
  name: 'web-nginx',
  image: 'nginx:1.27',
  state: 'running',
  status: 'Up 3 days',
  ports: [],
};

function baseInspect(): ContainerInspect {
  return {
    id: 'container-1',
    name: 'web-nginx',
    image: 'nginx:1.27',
    command: ['nginx'],
    entrypoint: [],
    createdAt: '2026-01-01T00:00:00Z',
    state: { status: 'running', startedAt: '2026-01-01T00:00:01Z' },
    restartPolicy: { name: 'no' },
    resourceLimits: {},
    env: [],
    ports: [],
    mounts: [],
    networks: [{ name: 'bridge' }],
    labels: {},
    raw: { Id: 'raw-container-1-id', Name: '/web-nginx' },
  };
}

// The panel's read hook, the Logs tab and the Stats tab all subscribe through
// EventSource, which jsdom does not provide.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  private listeners = new Map<string, Array<(event: unknown) => void>>();
  closed = false;

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

function statsStreams(): FakeEventSource[] {
  return FakeEventSource.instances.filter((instance) => instance.url.includes('/stats/stream'));
}

let fetchMock: ReturnType<typeof vi.fn>;

function renderPanel() {
  const onContainerReplaced = vi.fn();
  const view = render(
    <ReportingServices>
      <ProgressProvider>
        <ConfirmationProvider>
          <ContainerDetailPanel container={container} onContainerReplaced={onContainerReplaced} />
        </ConfirmationProvider>
      </ProgressProvider>
    </ReportingServices>,
  );
  return view;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  fetchMock = vi.fn((url: string) => {
    if (url.includes('/processes')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ titles: ['PID', 'USER', 'CMD'], processes: [{ pid: 5, user: 'root', command: 'nginx: master' }] }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(baseInspect()) });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ContainerDetailPanel — Stats and Processes tabs (REQ-32, REQ-33)', () => {
  // container-detail-panel.md — the panel holds the Config, Logs, Stats, Processes and Inspect tabs, Config first and selected on opening (REQ-11)
  it('offers the Stats and Processes tabs alongside the others, with Config selected on opening', async () => {
    renderPanel();

    for (const name of ['Config', 'Logs', 'Stats', 'Processes', 'Inspect']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Config' })).toHaveAttribute('aria-selected', 'true'));
  });

  /**
   * REQ-41 — the detail's live behaviour is unchanged by the tab row's recomposition: the tab it
   * opens on mounts no live view, so nothing is subscribed to until the operator asks for it. Proved
   * rather than assumed, since "which tab opens" and "which stream starts" are one question here.
   */
  it('opens no stream of any kind on the tab it opens with', async () => {
    renderPanel();
    await screen.findByRole('button', { name: 'Edit configuration' });

    const streams = FakeEventSource.instances.map((instance) => instance.url);
    expect(streams.filter((url) => url.includes('/stats/stream'))).toEqual([]);
    expect(streams.filter((url) => url.includes('/logs/stream'))).toEqual([]);
    expect(fetchMock.mock.calls.map(([url]) => url as string).filter((url) => url.includes('/processes'))).toEqual([]);
  });

  // plan-docker_management_app/REQ-32 — the Stats tab shows the container's live resource usage
  it('opens the live stats stream and shows the readings when the Stats tab is selected', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(statsStreams()).toHaveLength(0);

    await user.click(screen.getByRole('tab', { name: 'Stats' }));

    await waitFor(() => expect(statsStreams()).toHaveLength(1));
    expect(statsStreams()[0].url).toContain('/api/containers/container-1/stats/stream');
    expect(screen.getByText(/Waiting for the first sample/i)).toBeInTheDocument();
  });

  // container-detail-panel.md — leaving the Stats tab unmounts the view and thereby stops the live stats stream (REQ-32)
  it('stops the stats stream when another tab is selected', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('tab', { name: 'Stats' }));
    await waitFor(() => expect(statsStreams()).toHaveLength(1));
    const stream = statsStreams()[0];

    await user.click(screen.getByRole('tab', { name: 'Config' }));

    await waitFor(() => expect(stream.closed).toBe(true));
    expect(screen.queryByText(/Waiting for the first sample/i)).not.toBeInTheDocument();
    // No replacement stream is opened behind the closed tab.
    expect(statsStreams()).toHaveLength(1);
  });

  // container-detail-panel.md — closing the panel stops the live stats stream too
  it('stops the stats stream when the panel is closed', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPanel();
    await user.click(screen.getByRole('tab', { name: 'Stats' }));
    await waitFor(() => expect(statsStreams()).toHaveLength(1));
    const stream = statsStreams()[0];

    unmount();

    expect(stream.closed).toBe(true);
  });

  // plan-docker_management_app/REQ-33 — the Processes tab lists the processes running inside the container
  it('reads and shows the process listing when the Processes tab is selected', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes('/processes'))).toHaveLength(0);

    await user.click(screen.getByRole('tab', { name: 'Processes' }));

    expect(await screen.findByText('nginx: master')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes('/processes'))).toHaveLength(1);
  });
});
