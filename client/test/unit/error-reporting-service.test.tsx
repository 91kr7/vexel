import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';

afterEach(cleanup);

function ErrorReportingHarness() {
  const { errors, reportError, dismissError } = useErrorReporter();
  return (
    <div>
      <button onClick={() => reportError('Failed to remove container', 'Error: cannot remove a running container')}>
        Trigger failure
      </button>
      <ul>
        {errors.map((error) => (
          <li key={error.id}>
            <span>{error.title}</span>
            {error.detail ? <span>{error.detail}</span> : null}
            <button onClick={() => dismissError(error.id)}>{`Dismiss ${error.id}`}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('ErrorReportingProvider / useErrorReporter', () => {
  // plan-docker_management_app/REQ-7
  it('shows the failure together with the daemon own error message verbatim', async () => {
    const user = userEvent.setup();
    render(
      <ErrorReportingProvider>
        <ErrorReportingHarness />
      </ErrorReportingProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Trigger failure' }));

    expect(screen.getByText('Failed to remove container')).toBeInTheDocument();
    expect(screen.getByText('Error: cannot remove a running container')).toBeInTheDocument();
  });

  // app-shell/specs/error-reporting-service.md — reportError never replaces existing active errors
  it('keeps previously reported errors when a new one is reported', async () => {
    const user = userEvent.setup();
    render(
      <ErrorReportingProvider>
        <ErrorReportingHarness />
      </ErrorReportingProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Trigger failure' }));
    await user.click(screen.getByRole('button', { name: 'Trigger failure' }));

    expect(screen.getAllByText('Failed to remove container')).toHaveLength(2);
  });

  // app-shell/specs/error-reporting-service.md — dismissError removes only the targeted error
  it('removes a specific error from the active list on dismissal', async () => {
    const user = userEvent.setup();
    render(
      <ErrorReportingProvider>
        <ErrorReportingHarness />
      </ErrorReportingProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Trigger failure' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss 0' }));

    expect(screen.queryByText('Failed to remove container')).not.toBeInTheDocument();
  });

  // app-shell/specs/error-reporting-service.md — usage outside a provider is a programming error
  it('throws when useErrorReporter is called outside an ErrorReportingProvider', () => {
    function Bare() {
      useErrorReporter();
      return null;
    }

    expect(() => render(<Bare />)).toThrow('useErrorReporter must be used within an ErrorReportingProvider');
  });
});
