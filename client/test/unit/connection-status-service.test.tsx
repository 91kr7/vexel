import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { FakeEventSource, channelOpens, dropChannel, liveChannel } from '../support/live-channel';

// The service reports a live channel that is not delivering as an unreachable
// daemon (REQ-11), so every case here says which of the two it is about. The
// channel client behind it is a module singleton: a fresh module registry per
// test keeps one test's connection out of the next.
let ConnectionStatusProvider: typeof import('../../src/shell/services/ConnectionStatusService').ConnectionStatusProvider;
let useConnectionStatus: typeof import('../../src/shell/services/ConnectionStatusService').useConnectionStatus;

beforeEach(async () => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.resetModules();
  ({ ConnectionStatusProvider, useConnectionStatus } = await import('../../src/shell/services/ConnectionStatusService'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function StatusHarness() {
  const status = useConnectionStatus();
  return (
    <div>
      <span data-testid="reachable">{String(status.daemon.reachable)}</span>
      <span data-testid="cause">{status.daemon.cause ?? ''}</span>
      <button onClick={() => status.retry()}>Retry</button>
    </div>
  );
}

describe('ConnectionStatusProvider / useConnectionStatus', () => {
  // app-shell/specs/connection-status-service.md — usage outside a provider is a programming error
  it('throws when useConnectionStatus is called outside a ConnectionStatusProvider', () => {
    function Bare() {
      useConnectionStatus();
      return null;
    }

    expect(() => render(<Bare />)).toThrow('useConnectionStatus must be used within a ConnectionStatusProvider');
  });

  // plan-docker_management_app/REQ-10 — a fetch failure is reflected as unreachable with a cause, never thrown
  it('reflects a fetch failure as daemon unreachable with a cause, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    render(
      <ConnectionStatusProvider>
        <StatusHarness />
      </ConnectionStatusProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('false'));
    expect(screen.getByTestId('cause').textContent).not.toBe('');
  });

  // plan-docker_management_app/REQ-9, plan-docker_management_app/REQ-13, plan-docker_management_app/REQ-110
  it('reflects a successful fetch: reachability, negotiated API version and CLI availability', async () => {
    const status = {
      daemon: { reachable: true },
      apiVersion: '1.43',
      engineVersion: '24.0.0',
      cli: {
        docker: { available: true, version: '24.0.0' },
        compose: { available: false },
        buildx: { available: true, version: '0.11.0' },
      },
      unavailableCapabilities: ['Compose projects are unavailable: the docker compose plugin was not found.'],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(status) }));

    function FullHarness() {
      const value = useConnectionStatus();
      return <pre data-testid="status">{JSON.stringify(value)}</pre>;
    }

    render(
      <ConnectionStatusProvider>
        <FullHarness />
      </ConnectionStatusProvider>,
    );
    act(() => channelOpens());

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('"apiVersion":"1.43"'));
    const rendered = JSON.parse(screen.getByTestId('status').textContent ?? '{}');
    expect(rendered.daemon.reachable).toBe(true);
    expect(rendered.cli.compose.available).toBe(false);
    expect(rendered.unavailableCapabilities).toHaveLength(1);
  });

  // app-shell/specs/connection-status-service.md — retry() re-fetches immediately, outside the regular poll interval
  it('retry() issues an extra fetch immediately, without waiting for the poll interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          daemon: { reachable: true },
          cli: { docker: { available: true }, compose: { available: true }, buildx: { available: true } },
          unavailableCapabilities: [],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ConnectionStatusProvider>
        <StatusHarness />
      </ConnectionStatusProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  // …-multiplexed_sse/REQ-11, REQ-35 — a channel that is not delivering is told through this
  // same state and this same wording; no element and no wording of its own is added for it.
  it('reports the daemon unreachable with a cause while the channel is not delivering', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          daemon: { reachable: true },
          apiVersion: '1.43',
          cli: { docker: { available: true }, compose: { available: true }, buildx: { available: true } },
          unavailableCapabilities: [],
        }),
    }));

    render(
      <ConnectionStatusProvider>
        <StatusHarness />
      </ConnectionStatusProvider>,
    );
    act(() => channelOpens());
    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('true'));

    act(() => dropChannel());

    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('false'));
    expect(screen.getByTestId('cause').textContent).not.toBe('');
  });

  // …-multiplexed_sse/REQ-11 — the state is cleared as soon as the channel delivers again.
  it('reports the daemon reachable again once the channel delivers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          daemon: { reachable: true },
          apiVersion: '1.43',
          cli: { docker: { available: true }, compose: { available: true }, buildx: { available: true } },
          unavailableCapabilities: [],
        }),
    }));

    render(
      <ConnectionStatusProvider>
        <StatusHarness />
      </ConnectionStatusProvider>,
    );
    act(() => channelOpens());
    act(() => dropChannel());
    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('false'));

    act(() => channelOpens());

    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('true'));
  });

  // connection-status-service.md — "retry() ... asks for the live channel again when it is not delivering".
  it('asks for the channel again when retried while it is not delivering', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          daemon: { reachable: true },
          cli: { docker: { available: true }, compose: { available: true }, buildx: { available: true } },
          unavailableCapabilities: [],
        }),
    }));

    render(
      <ConnectionStatusProvider>
        <StatusHarness />
      </ConnectionStatusProvider>,
    );
    act(() => channelOpens());
    act(() => dropChannel());
    const dropped = liveChannel();
    const opened = FakeEventSource.instances.length;

    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });

    expect(dropped.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(opened + 1);
  });
});
