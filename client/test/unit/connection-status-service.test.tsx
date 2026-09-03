import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { FakeEventSource, channelOpens, deliverDiscard, deliverValue, dropChannel, liveChannel } from '../support/live-channel';
import { arrangeLiveChannel, type ChannelHarness } from '../support/pushed-listing';

/**
 * The status arrives on the live channel and from nowhere else
 * (…-multiplexed_sse/REQ-17, /REQ-19, /REQ-39).
 *
 * Two states are reported through the same shape and every case below says which it is about: a
 * daemon the server could not reach, and a channel that is not delivering (REQ-11). `fetch` is
 * recorded rather than answered — a mock that answered would hide a request this service is
 * contracted never to make — and a fresh module registry per test keeps one test's channel, a
 * module singleton, out of the next.
 */
let harness: ChannelHarness;
let ConnectionStatusProvider: typeof import('../../src/shell/services/ConnectionStatusService').ConnectionStatusProvider;
let useConnectionStatus: typeof import('../../src/shell/services/ConnectionStatusService').useConnectionStatus;

beforeEach(async () => {
  harness = arrangeLiveChannel();
  vi.resetModules();
  ({ ConnectionStatusProvider, useConnectionStatus } = await import('../../src/shell/services/ConnectionStatusService'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The status the server pushes when it reached the daemon, in the shape the channel delivers. */
const reachableStatus = {
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

/** The status the server pushes when its own probe could not reach the daemon. */
const unreachableStatus = {
  daemon: { reachable: false, cause: 'connect ENOENT /var/run/docker.sock' },
  cli: { docker: { available: true }, compose: { available: true }, buildx: { available: true } },
  unavailableCapabilities: [],
};

/** The name the server gives the connection status on the channel. */
const CONNECTION_STATUS = 'connection-status';

function StatusHarness() {
  const status = useConnectionStatus();
  return (
    <div>
      <span data-testid="reachable">{String(status.daemon.reachable)}</span>
      <span data-testid="cause">{status.daemon.cause ?? ''}</span>
      <span data-testid="loading">{String(status.loading)}</span>
      <span data-testid="unreachable">{status.unreachable ?? 'none'}</span>
      <pre data-testid="status">{JSON.stringify(status)}</pre>
      <button onClick={() => status.retry()}>Retry</button>
    </div>
  );
}

function renderStatus() {
  render(
    <ConnectionStatusProvider>
      <StatusHarness />
    </ConnectionStatusProvider>,
  );
}

function rendered(): Record<string, never> & { daemon: { reachable: boolean; cause?: string } } {
  return JSON.parse(screen.getByTestId('status').textContent ?? '{}');
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

  // connection-status-service.md — "Before anything has been delivered ... the daemon reads as not
  // reachable with no cause: nothing is claimed to have failed that has not."
  it('reports the daemon unreachable with no cause while the channel has delivered nothing', () => {
    renderStatus();
    act(() => channelOpens());

    expect(screen.getByTestId('reachable')).toHaveTextContent('false');
    expect(screen.getByTestId('cause').textContent, 'a failure was claimed before anything was delivered').toBe('');
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  // plan-docker_management_app/REQ-9, /REQ-13, /REQ-110 and …-multiplexed_sse/REQ-39 — the
  // reachability, the negotiated versions and the CLI availability are what the channel delivered.
  it('shows what the channel delivered: reachability, negotiated versions and CLI availability', async () => {
    renderStatus();
    act(() => channelOpens());

    act(() => deliverValue(CONNECTION_STATUS, reachableStatus));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('"apiVersion":"1.43"'));
    const status = rendered() as unknown as typeof reachableStatus & { loading: boolean };
    expect(status.daemon.reachable).toBe(true);
    expect(status.engineVersion).toBe('24.0.0');
    expect(status.cli.compose.available).toBe(false);
    expect(status.unavailableCapabilities).toHaveLength(1);
    expect(status.loading).toBe(false);
  });

  // …-multiplexed_sse/REQ-19 — the server's own probe is what reports an unreachable daemon; the
  // cause it delivered is shown verbatim, and the state is that of the daemon, not of the channel.
  it('shows the cause the server delivered for a daemon it could not reach', async () => {
    renderStatus();
    act(() => channelOpens());

    act(() => deliverValue(CONNECTION_STATUS, unreachableStatus));

    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('false'));
    expect(screen.getByTestId('cause')).toHaveTextContent(unreachableStatus.daemon.cause);
  });

  // …-multiplexed_sse/REQ-17, /REQ-19, /REQ-20 — "The browser holds no clock for a converted
  // value": nothing is asked of the server, and nothing changes on its own over several of the
  // periods the removed poll used to run at.
  it('asks the server for nothing, on no clock', async () => {
    vi.useFakeTimers();
    renderStatus();
    act(() => channelOpens());
    act(() => deliverValue(CONNECTION_STATUS, reachableStatus));
    expect(screen.getByTestId('reachable')).toHaveTextContent('true');

    // Six times the five-second period the browser used to ask on.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(harness.requests, `the browser asked the server for ${harness.requests.map((made) => made.url).join(', ')}`).toEqual([]);
    expect(screen.getByTestId('reachable'), 'the status changed with nothing delivered').toHaveTextContent('true');
  });

  // …-multiplexed_sse/REQ-11, /REQ-35 — a channel that is not delivering is told through this
  // same state and this same wording; no element and no wording of its own is added for it.
  it('reports the daemon unreachable with a cause while the channel is not delivering', async () => {
    renderStatus();
    act(() => channelOpens());
    act(() => deliverValue(CONNECTION_STATUS, reachableStatus));
    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('true'));

    act(() => dropChannel());

    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('false'));
    expect(screen.getByTestId('cause').textContent).not.toBe('');
  });

  // …-multiplexed_sse/REQ-11 — the state is cleared as soon as the channel delivers again.
  it('reports the daemon reachable again once the channel delivers', async () => {
    renderStatus();
    act(() => channelOpens());
    act(() => deliverValue(CONNECTION_STATUS, reachableStatus));
    act(() => dropChannel());
    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('false'));

    act(() => channelOpens());

    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('true'));
  });

  // connection-status-service.md — `loading` is true "again from a discard until the next one is
  // delivered", and the daemon is back to unreachable with no cause: the values held are gone.
  it('is loading again, with nothing claimed to have failed, after the values held are discarded', async () => {
    renderStatus();
    act(() => channelOpens());
    act(() => deliverValue(CONNECTION_STATUS, reachableStatus));
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    act(() => deliverDiscard());

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('true'));
    expect(screen.getByTestId('reachable')).toHaveTextContent('false');
    expect(screen.getByTestId('cause').textContent).toBe('');
  });

  // connection-status-service.md — "retry() asks for the live channel again when it is not
  // delivering", which is the one thing an operator can do about a connection that is down (REQ-18).
  it('asks for the channel again when retried while it is not delivering', async () => {
    renderStatus();
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

  // connection-status-service.md — "and does nothing when it is: the status arrives on the channel,
  // so there is nothing to re-read". A request here would be the removed poll, on a press.
  it('leaves the channel alone and asks for nothing when retried while it is delivering', async () => {
    renderStatus();
    act(() => channelOpens());
    act(() => deliverValue(CONNECTION_STATUS, reachableStatus));
    const delivering = liveChannel();
    const opened = FakeEventSource.instances.length;

    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });

    expect(delivering.closed, 'a delivering channel was closed by a retry').toBe(false);
    expect(FakeEventSource.instances).toHaveLength(opened);
    expect(harness.requests, 'a retry on a delivering channel asked the server for the status').toEqual([]);
  });
});

/**
 * Which of the two sides cannot be reached (…-inline_error_panels/REQ-9). The same
 * `daemon.reachable: false` used to stand for both, and the header named the daemon for a daemon
 * that was running behind a server that had stopped answering.
 */
describe('useConnectionStatus — which side is unreachable (…-inline_error_panels/REQ-9)', () => {
  // connection-status-service.md — "'daemon' when it is delivering and the status it delivered says
  // the daemon cannot be reached"
  it('names the daemon while the channel delivers a status the daemon is not reachable in', async () => {
    renderStatus();
    act(() => channelOpens());

    act(() => deliverValue(CONNECTION_STATUS, unreachableStatus));

    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('false'));
    expect(screen.getByTestId('unreachable')).toHaveTextContent('daemon');
  });

  // connection-status-service.md — "'server' when the live channel is not delivering"
  it('names the server while the channel is not delivering', async () => {
    renderStatus();
    act(() => channelOpens());
    act(() => deliverValue(CONNECTION_STATUS, reachableStatus));
    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('none'));

    act(() => dropChannel());

    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('server'));
  });

  // connection-status-service.md — "set exactly while daemon.reachable is false"
  it('names nothing while the daemon is reachable', async () => {
    renderStatus();
    act(() => channelOpens());

    act(() => deliverValue(CONNECTION_STATUS, reachableStatus));

    await waitFor(() => expect(screen.getByTestId('reachable')).toHaveTextContent('true'));
    expect(screen.getByTestId('unreachable')).toHaveTextContent('none');
  });

  // connection-status-service.md — "Before anything has been delivered it reads 'daemon': the
  // channel is up, and what the daemon is doing is not yet known."
  it('names the daemon before anything has been delivered', () => {
    renderStatus();

    act(() => channelOpens());

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    expect(screen.getByTestId('unreachable')).toHaveTextContent('daemon');
  });

  // The transition an operator sees when the server comes back: the side named is dropped as soon
  // as the channel delivers a reachable daemon again.
  it('names nothing again once the channel delivers a reachable daemon after being down', async () => {
    renderStatus();
    act(() => channelOpens());
    act(() => deliverValue(CONNECTION_STATUS, reachableStatus));
    act(() => dropChannel());
    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('server'));

    act(() => channelOpens());

    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('none'));
  });
});
