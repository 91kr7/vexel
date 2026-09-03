import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FakeEventSource } from '../support/live-channel';

// The connection status arrives on the live channel, and the channel client is a
// module-level singleton: a fresh module registry per test keeps one test's
// connection out of the next.
beforeEach(() => {
  vi.resetModules();
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FAILURE_TITLE = 'Could not remove pgdata';
const DAEMON_MESSAGE = 'Error response from daemon: volume is in use';

type Services = typeof import('../support/reporting-services');

/** Renders one trigger under the three services, with nothing delivered on the channel yet. */
async function renderReporter(): Promise<Services> {
  const services = await import('../support/reporting-services');
  const { useErrorReporter } = await import('../../src/shell/services/ErrorReportingService');

  function Trigger() {
    const { reportError } = useErrorReporter();
    return (
      <button onClick={() => reportError(FAILURE_TITLE, DAEMON_MESSAGE)}>Report the failure</button>
    );
  }

  render(
    <services.ReportingServices>
      <Trigger />
    </services.ReportingServices>,
  );
  return services;
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Report the failure' });
}

describe('ErrorReportingProvider / useErrorReporter (app-shell/specs/error-reporting-service.md)', () => {
  // plan-docker_management_app-inline_error_panels/REQ-5 — a failure is reported as a toast in the failure tone,
  // carrying the daemon's own message
  it('raises one danger toast carrying the title and the daemon message verbatim', async () => {
    const user = userEvent.setup();
    const services = await renderReporter();
    services.daemonBecomesReachable();

    await user.click(trigger());

    const toasts = services.toastCards();
    expect(toasts).toHaveLength(1);
    expect(within(toasts[0]).getByText(FAILURE_TITLE)).toBeInTheDocument();
    expect(within(toasts[0]).getByText(DAEMON_MESSAGE)).toBeInTheDocument();
    expect(toasts[0].className, 'the failure was not reported in the failure tone').toContain('ui-toast--tone-danger');
  });

  // plan-docker_management_app-inline_error_panels/REQ-7 — a toast reporting a failure carries no action button
  it('offers no control on the toast other than its dismissal', async () => {
    const user = userEvent.setup();
    const services = await renderReporter();
    services.daemonBecomesReachable();

    await user.click(trigger());

    const buttons = within(services.toastCards()[0]).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([`Dismiss notification: ${FAILURE_TITLE}`]);
  });

  // plan-docker_management_app-inline_error_panels/REQ-6 — every repetition raises a new toast, a repetition of
  // the same message included
  it('raises a further toast for each repetition of the same failure', async () => {
    const user = userEvent.setup();
    const services = await renderReporter();
    services.daemonBecomesReachable();

    await user.click(trigger());
    await user.click(trigger());

    expect(services.toastCards()).toHaveLength(2);
    expect(screen.getAllByText(FAILURE_TITLE)).toHaveLength(2);
  });

  // plan-docker_management_app-inline_error_panels/REQ-6, /REQ-8 — a fourth toast makes room by removing the
  // oldest visible one; the cap of three is the toast component's own
  it('keeps three on screen when a fourth failure is reported, the oldest gone', async () => {
    const user = userEvent.setup();
    const services = await renderReporter();
    services.daemonBecomesReachable();

    for (const ordinal of ['first', 'second', 'third', 'fourth']) {
      await user.click(screen.getByRole('button', { name: 'Report the failure' }));
      // Distinguishing the four is what says which one left; the report itself is the same failure.
      const latest = services.toastCards().at(-1)!;
      latest.dataset.ordinal = ordinal;
    }

    const remaining = services.toastCards().map((toast) => toast.dataset.ordinal);
    expect(remaining, 'the oldest toast did not make room for the fourth').toEqual(['second', 'third', 'fourth']);
  });

  // plan-docker_management_app-inline_error_panels/REQ-13 — a failure raised while nothing is reachable is not
  // told by a toast; the header report is the only place it is told
  it('raises no toast at all while the daemon is unreachable', async () => {
    const user = userEvent.setup();
    const services = await renderReporter();
    services.daemonBecomesUnreachable();

    await user.click(trigger());

    expect(services.toastCards()).toHaveLength(0);
    expect(screen.queryByText(DAEMON_MESSAGE)).not.toBeInTheDocument();
  });

  // app-shell/specs/error-reporting-service.md — the drop lasts as long as the unreachability does
  it('reports again once the daemon is reachable', async () => {
    const user = userEvent.setup();
    const services = await renderReporter();
    services.daemonBecomesUnreachable();
    await user.click(trigger());

    services.daemonBecomesReachable();
    await user.click(trigger());

    await waitFor(() => expect(services.toastCards()).toHaveLength(1));
  });

  // app-shell/specs/error-reporting-service.md — reportError keeps one identity for the life of the provider,
  // so a connection changing state re-runs no effect that depends on it
  it('keeps one reportError identity across a change of reachability', async () => {
    const services = await import('../support/reporting-services');
    const { useErrorReporter } = await import('../../src/shell/services/ErrorReportingService');
    const { useConnectionStatus } = await import('../../src/shell/services/ConnectionStatusService');
    const identities: unknown[] = [];
    const seenReachability: boolean[] = [];

    // The observer reads the connection itself, so it re-renders on every change
    // of it and records what `reportError` was at that moment.
    function Observer() {
      seenReachability.push(useConnectionStatus().daemon.reachable);
      identities.push(useErrorReporter().reportError);
      return null;
    }

    render(
      <services.ReportingServices>
        <Observer />
      </services.ReportingServices>,
    );
    services.daemonBecomesReachable();
    services.daemonBecomesUnreachable();

    expect(new Set(seenReachability), 'the connection never changed under the observer').toEqual(new Set([true, false]));
    expect(new Set(identities).size, 'reportError changed identity when the connection did').toBe(1);
  });

  // app-shell/specs/error-reporting-service.md — nothing can be read back: no list of failures, no dismissal
  it('exposes reportError alone', async () => {
    const services = await import('../support/reporting-services');
    const { useErrorReporter } = await import('../../src/shell/services/ErrorReportingService');
    let reporter: Record<string, unknown> = {};

    function Observer() {
      reporter = useErrorReporter() as unknown as Record<string, unknown>;
      return null;
    }

    render(
      <services.ReportingServices>
        <Observer />
      </services.ReportingServices>,
    );

    expect(Object.keys(reporter)).toEqual(['reportError']);
  });

  // app-shell/specs/error-reporting-service.md — usage outside a provider is a programming error
  it('throws when useErrorReporter is called outside an ErrorReportingProvider', async () => {
    const { useErrorReporter } = await import('../../src/shell/services/ErrorReportingService');

    function Bare() {
      useErrorReporter();
      return null;
    }

    expect(() => render(<Bare />)).toThrow('useErrorReporter must be used within an ErrorReportingProvider');
  });
});
