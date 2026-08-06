import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Shell } from '../../src/shell/Shell';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider, useProgress } from '../../src/shell/services/ProgressService';

afterEach(cleanup);

interface ShellApi {
  reportError: ReturnType<typeof useErrorReporter>['reportError'];
  run: ReturnType<typeof useProgress>['run'];
}

function renderShell() {
  const api: Partial<ShellApi> = {};

  function Driver() {
    api.reportError = useErrorReporter().reportError;
    api.run = useProgress().run;
    return null;
  }

  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <Driver />
        <Shell />
      </ProgressProvider>
    </ErrorReportingProvider>,
  );

  return api as ShellApi;
}

describe('Shell', () => {
  // plan-docker_management_app/REQ-1
  it('opens on the Dashboard screen with the Vessel brand and the active-context footer', () => {
    renderShell();

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Vessel')).toBeInTheDocument();
    expect(screen.getByText('Active context')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-2
  it('activating a nav entry replaces the main area and marks it active, keeping rail/header/footer', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: /Containers/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Containers' })).toBeInTheDocument();
    expect(screen.getByText('Vessel')).toBeInTheDocument();
    expect(screen.getByText('Active context')).toBeInTheDocument();

    const activeEntries = screen.getAllByRole('button', { current: 'page' });
    expect(activeEntries).toHaveLength(1);
    expect(activeEntries[0]).toHaveAccessibleName(expect.stringContaining('Containers'));
  });

  // app-shell/specs/error-reporting-service.md — the shell renders errors alongside the screen, not instead of it (REQ-7)
  it('shows a reported error next to the active screen without hiding it', async () => {
    const api = renderShell();

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
    const api = renderShell();

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
