import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ProgressProvider, useProgress } from '../../src/shell/services/ProgressService';

afterEach(cleanup);

function ProgressHarness() {
  const { pending } = useProgress();
  return (
    <ul>
      {pending.map((operation) => (
        <li key={operation.id}>{operation.label}</li>
      ))}
    </ul>
  );
}

describe('ProgressProvider / useProgress', () => {
  // plan-docker_management_app/REQ-8
  it('shows a pending indication while a non-instantaneous operation runs', async () => {
    let resolveTask!: () => void;
    const task = () => new Promise<void>((resolve) => { resolveTask = resolve; });
    let run!: ReturnType<typeof useProgress>['run'];

    function Runner() {
      ({ run } = useProgress());
      return <ProgressHarness />;
    }

    render(
      <ProgressProvider>
        <Runner />
      </ProgressProvider>,
    );

    let taskPromise!: Promise<void>;
    act(() => {
      taskPromise = run('Removing container', task);
    });

    expect(screen.getByText('Removing container')).toBeInTheDocument();

    resolveTask();
    await act(async () => {
      await taskPromise;
    });

    await waitFor(() => expect(screen.queryByText('Removing container')).not.toBeInTheDocument());
  });

  // app-shell/specs/progress-service.md — the pending entry is removed even when the task fails
  it('clears the pending entry when the operation fails, and rethrows', async () => {
    let run!: ReturnType<typeof useProgress>['run'];

    function Runner() {
      ({ run } = useProgress());
      return <ProgressHarness />;
    }

    render(
      <ProgressProvider>
        <Runner />
      </ProgressProvider>,
    );

    const failingTask = () => Promise.reject(new Error('daemon unreachable'));

    await expect(
      act(async () => {
        await run('Removing container', failingTask);
      }),
    ).rejects.toThrow('daemon unreachable');

    expect(screen.queryByText('Removing container')).not.toBeInTheDocument();
  });

  // app-shell/specs/progress-service.md — usage outside a provider is a programming error
  it('throws when useProgress is called outside a ProgressProvider', () => {
    function Bare() {
      useProgress();
      return null;
    }

    expect(() => render(<Bare />)).toThrow('useProgress must be used within a ProgressProvider');
  });
});
