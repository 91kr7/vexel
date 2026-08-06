import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ConnectionStatusProvider, useConnectionStatus } from '../../src/shell/services/ConnectionStatusService';

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
});
