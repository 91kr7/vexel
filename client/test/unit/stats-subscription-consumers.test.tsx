import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContainerSummary } from '../../src/data/containers-client';

// The gate is expressed in consumers of the figures, not in one named screen:
// the containers list and the dashboard are both consumers, and each holds the
// subscription for exactly as long as it is being shown
// (containers/specs/containers-screen.md, dashboard/specs/dashboard-screen.md,
// plan-docker_management_app-containers_card_view/REQ-42, REQ-45, REQ-48).
//
// The dashboard's own two live sources are mocked, as its own coverage does:
// what is under test here is the connection each screen holds, not what either
// draws.
vi.mock('../../src/data/use-system-overview', () => ({
  useSystemOverview: () => ({ loaded: true, refresh: vi.fn() }),
}));
vi.mock('../../src/shell/services/EventStreamService', () => ({
  useDaemonEventStream: () => ({ events: [] }),
}));

const { ContainersScreen } = await import('../../src/containers/ContainersScreen');
const { DashboardScreen } = await import('../../src/dashboard/DashboardScreen');
const { CrossNavigationProvider } = await import('../../src/shell/services/CrossNavigationService');
const { ConfirmationProvider } = await import('../../src/shell/services/ConfirmationService');
const { ErrorReportingProvider } = await import('../../src/shell/services/ErrorReportingService');
const { ProgressProvider } = await import('../../src/shell/services/ProgressService');
const { ToastProvider } = await import('../../src/ui');

const SUBSCRIPTION_URL = '/api/containers/stats/subscription';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  onmessage: ((message: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener() {}
  removeEventListener() {}

  close() {
    this.closed = true;
  }
}

/** The subscriptions still held — what the server counts as live consumers. */
function heldSubscriptions(): FakeEventSource[] {
  return FakeEventSource.instances.filter((instance) => instance.url === SUBSCRIPTION_URL && !instance.closed);
}

function container(): ContainerSummary {
  return {
    id: 'abcdef1234567890',
    shortId: 'abcdef123456',
    name: 'web-nginx',
    image: 'nginx:1.27',
    state: 'running',
    status: 'Up 3 days',
    ports: [],
  } as unknown as ContainerSummary;
}

function renderContainersScreen() {
  return render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <ContainersScreen containers={[container()]} loaded onRefresh={vi.fn()} />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
}

function renderDashboardScreen() {
  return render(
    <CrossNavigationProvider>
      <DashboardScreen containers={[container()]} containersLoaded onRefreshContainers={vi.fn()} />
    </CrossNavigationProvider>,
  );
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the screens that consume the sampled figures hold the subscription (REQ-45)', () => {
  it('the containers screen holds one subscription while it is shown, and releases it when it goes', () => {
    const { unmount } = renderContainersScreen();

    expect(heldSubscriptions()).toHaveLength(1);

    unmount();

    expect(heldSubscriptions()).toHaveLength(0);
  });

  it('the dashboard holds one subscription while it is shown, and releases it when it goes', () => {
    const { unmount } = renderDashboardScreen();

    expect(heldSubscriptions()).toHaveLength(1);

    unmount();

    expect(heldSubscriptions()).toHaveLength(0);
  });

  // containers-screen.md — "an open detail dialog does not close that gate": the screen is still the
  // screen being shown while the dialog stands over it, so the daemon goes on being sampled and
  // closing the dialog blanks no card (detail_modal/REQ-22).
  it('the containers screen keeps its subscription while a detail dialog stands over it', async () => {
    const user = userEvent.setup();
    // The detail reads the container's inspect data; the figures it draws are not what is under test.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'abcdef1234567890',
              name: 'web-nginx',
              image: 'nginx:1.27',
              command: ['sleep'],
              entrypoint: [],
              createdAt: '2026-01-01T00:00:00Z',
              state: { status: 'running', startedAt: '2026-01-01T00:00:01Z' },
              restartPolicy: { name: 'no' },
              resourceLimits: {},
              env: [],
              ports: [],
              mounts: [],
              networks: [],
              labels: {},
              raw: { Id: 'abcdef1234567890' },
            }),
        }),
      ),
    );
    renderContainersScreen();
    const held = heldSubscriptions()[0];

    await user.click(screen.getByRole('button', { name: 'Open web-nginx details' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal--size-large');
    expect(dialog, 'the detail did not open').not.toBeNull();
    await within(dialog!).findByRole('tab', { name: 'Config' });

    expect(heldSubscriptions(), 'the open dialog closed the sampling gate').toEqual([held]);

    await user.click(within(dialog!).getByRole('button', { name: 'Close dialog' }));

    await waitFor(() => expect(document.querySelector('.ui-modal--size-large')).toBeNull());
    expect(heldSubscriptions(), 'dismissing the dialog dropped the subscription the screen holds').toEqual([held]);
  });

  // Two consumers at once is ordinary, and one of them leaving leaves the other's subscription
  // standing — the count, not a flag (REQ-47)
  it('both screens shown at once are two consumers, and one leaving leaves the other held', () => {
    const containersScreen = renderContainersScreen();
    renderDashboardScreen();

    expect(heldSubscriptions()).toHaveLength(2);

    containersScreen.unmount();

    expect(heldSubscriptions()).toHaveLength(1);
  });
});
