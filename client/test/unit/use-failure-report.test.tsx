import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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

const TITLE = 'Could not read the layers';
const MESSAGE = 'Error response from daemon: no such image';

type Services = typeof import('../support/reporting-services');

/**
 * A view holding a failure as state, which is what the hook exists for: the
 * failure is set, cleared and re-set from the outside, and the view re-renders
 * on its own in between.
 */
async function renderView(): Promise<Services> {
  const services = await import('../support/reporting-services');
  const { useFailureReport } = await import('../../src/shell/services/use-failure-report');

  function View() {
    const [message, setMessage] = useState<string | undefined>(undefined);
    const [title, setTitle] = useState(TITLE);
    const [redraws, setRedraws] = useState(0);
    useFailureReport(title, message);
    return (
      <>
        <button onClick={() => setMessage(MESSAGE)}>Fail</button>
        <button onClick={() => setMessage(undefined)}>Clear</button>
        <button onClick={() => setTitle('Could not read the layers of this image')}>Rename</button>
        <button onClick={() => setRedraws(redraws + 1)}>{`Redraw ${redraws}`}</button>
      </>
    );
  }

  render(
    <services.ReportingServices>
      <View />
    </services.ReportingServices>,
  );
  services.daemonBecomesReachable();
  return services;
}

function press(name: string | RegExp): Promise<void> {
  return userEvent.setup().click(screen.getByRole('button', { name }));
}

describe('useFailureReport (app-shell/specs/use-failure-report.md)', () => {
  // plan-docker_management_app-inline_error_panels/REQ-5 — a failure a view holds as state is reported
  it('reports the failure the view holds, with the title it was given', async () => {
    const services = await renderView();

    await press('Fail');

    expect(services.toastTexts().join(' ')).toContain(TITLE);
    expect(services.toastTexts().join(' ')).toContain(MESSAGE);
  });

  // plan-docker_management_app-inline_error_panels/REQ-6 — one report per occurrence: the same failure still
  // standing across a re-render reports nothing
  it('reports nothing further while the same failure stands across re-renders', async () => {
    const services = await renderView();

    await press('Fail');
    await press(/Redraw/);
    await press(/Redraw/);

    expect(services.toastCards(), 'a re-render reported the failure again').toHaveLength(1);
  });

  // app-shell/specs/use-failure-report.md — a title that changes while the message stands reports nothing
  it('reports nothing when the title changes while the failure stands', async () => {
    const services = await renderView();

    await press('Fail');
    await press('Rename');

    expect(services.toastCards()).toHaveLength(1);
  });

  // app-shell/specs/use-failure-report.md — a message cleared and arriving again, the same text included,
  // is a new occurrence
  it('reports again when the same failure arrives after being cleared', async () => {
    const services = await renderView();

    await press('Fail');
    await press('Clear');
    await press('Fail');

    expect(services.toastCards()).toHaveLength(2);
  });

  // app-shell/specs/use-failure-report.md — no message, nothing reported
  it('reports nothing while the view holds no failure', async () => {
    const services = await renderView();

    await press(/Redraw/);

    expect(services.toastCards()).toHaveLength(0);
  });

  // app-shell/specs/use-failure-report.md — whether a report becomes a toast is the reporting service's
  // decision: with nothing reachable it is dropped there (…/REQ-13)
  it('raises no toast for a failure held while the daemon is unreachable', async () => {
    const services = await import('../support/reporting-services');
    const { useFailureReport } = await import('../../src/shell/services/use-failure-report');

    function View() {
      useFailureReport(TITLE, MESSAGE);
      return null;
    }

    render(
      <services.ReportingServices>
        <View />
      </services.ReportingServices>,
    );
    services.daemonBecomesUnreachable();

    expect(services.toastCards()).toHaveLength(0);
  });
});
