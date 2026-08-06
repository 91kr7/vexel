import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainersScreen } from '../../src/containers/ContainersScreen';
import type { ContainerSummary } from '../../src/data/containers-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

function makeContainer(overrides: Partial<ContainerSummary> = {}): ContainerSummary {
  return {
    id: 'abcdef1234567890',
    shortId: 'abcdef123456',
    name: 'web-nginx',
    image: 'nginx:1.27',
    state: 'running',
    status: 'Up 3 days',
    ports: [],
    ...overrides,
  };
}

function ReportedErrors() {
  const { errors } = useErrorReporter();
  return (
    <>
      {errors.map((error) => (
        <p key={error.id}>{`${error.title}${error.detail ? `: ${error.detail}` : ''}`}</p>
      ))}
    </>
  );
}

function renderScreen(containers: ContainerSummary[], onRefresh = vi.fn()) {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <ContainersScreen containers={containers} loaded onRefresh={onRefresh} />
            <ReportedErrors />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
  return { onRefresh };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ContainersScreen — lifecycle actions restricted by state (REQ-20)', () => {
  it('offers rename, stop, pause, restart, kill and rm for a running container', () => {
    renderScreen([makeContainer({ state: 'running' })]);

    for (const label of ['rename', 'stop', 'pause', 'restart', 'kill', 'rm']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'unpause' })).not.toBeInTheDocument();
  });

  it('offers rename, unpause, restart, kill and rm for a paused container', () => {
    renderScreen([makeContainer({ state: 'paused' })]);

    for (const label of ['rename', 'unpause', 'restart', 'kill', 'rm']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'stop' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'pause' })).not.toBeInTheDocument();
  });

  it('offers only rename, kill and rm for a restarting container', () => {
    renderScreen([makeContainer({ state: 'restarting' })]);

    for (const label of ['rename', 'kill', 'rm']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'restart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'start' })).not.toBeInTheDocument();
  });

  it('offers rename, start and rm for an exited container', () => {
    renderScreen([makeContainer({ state: 'exited' })]);

    for (const label of ['rename', 'start', 'rm']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'stop' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'kill' })).not.toBeInTheDocument();
  });
});

describe('ContainersScreen — running lifecycle actions (REQ-20)', () => {
  it('applies a non-destructive action immediately and re-reads the list, without asking for confirmation', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeContainer({ id: 'container-1', state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'stop' }));

    expect(screen.queryByRole('heading', { name: /^Confirm:/ })).not.toBeInTheDocument();
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/containers/container-1/stop');
    expect(init.method).toBe('POST');
  });

  it('disables a row action while its own request is in flight, so a second click cannot race it', async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const { onRefresh } = renderScreen([makeContainer({ state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'stop' }));

    expect(screen.getByRole('button', { name: 'stop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'kill' })).toBeDisabled();

    resolveFetch({ ok: true, status: 204 });
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'stop' })).toBeEnabled();
  });

  it('asks for confirmation naming the container before a destructive action, and performs nothing on cancel', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeContainer({ id: 'container-1', name: 'web-nginx', state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'kill' }));

    expect(screen.getByRole('heading', { name: 'Confirm: web-nginx' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('performs the destructive action and re-reads the list once confirmed', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeContainer({ id: 'container-1', name: 'web-nginx', state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'kill' }));
    const killButtons = screen.getAllByRole('button', { name: 'kill' });
    await user.click(killButtons[killButtons.length - 1]);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/containers/container-1/kill');
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('reports the daemon\'s own error message and leaves the screen usable when a lifecycle action fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'container is not running' }) });
    renderScreen([makeContainer({ state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'stop' }));

    expect(await screen.findByText(/container is not running/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'stop' })).toBeInTheDocument();
  });
});

describe('ContainersScreen — rename (REQ-21)', () => {
  it('replaces the name cell with a pre-filled field and renames on submit', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeContainer({ id: 'container-1', name: 'web-nginx', state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'rename' }));

    const field = screen.getByRole('textbox', { name: 'New name for web-nginx' });
    expect(field).toHaveValue('web-nginx');

    await user.clear(field);
    await user.type(field, 'web-proxy{Enter}');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/containers/container-1/rename');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'web-proxy' });
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('does nothing when the rename is submitted unchanged', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeContainer({ name: 'web-nginx', state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'rename' }));
    await user.type(screen.getByRole('textbox', { name: 'New name for web-nginx' }), '{Enter}');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'New name for web-nginx' })).not.toBeInTheDocument();
  });

  it('discards the edit when the rename is cancelled', async () => {
    const user = userEvent.setup();
    renderScreen([makeContainer({ name: 'web-nginx', state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'rename' }));
    await user.type(screen.getByRole('textbox', { name: 'New name for web-nginx' }), 'discarded-name');
    await user.click(screen.getByRole('button', { name: 'Cancel rename' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('web-nginx')).toBeInTheDocument();
  });
});

describe('ContainersScreen — bulk prune of stopped containers (REQ-22)', () => {
  it('disables "Prune stopped" when no container is stopped', () => {
    renderScreen([makeContainer({ state: 'running' })]);

    expect(screen.getByRole('button', { name: 'Prune stopped' })).toBeDisabled();
  });

  it('enables "Prune stopped" when at least one container is stopped', () => {
    renderScreen([makeContainer({ id: 'a', state: 'running' }), makeContainer({ id: 'b', state: 'exited' })]);

    expect(screen.getByRole('button', { name: 'Prune stopped' })).toBeEnabled();
  });

  it('reports the removed count and reclaimed space, and re-reads the list, once confirmed', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ removedCount: 2, reclaimedBytes: 2048 }) });
    const { onRefresh } = renderScreen([makeContainer({ state: 'exited' })]);

    await user.click(screen.getByRole('button', { name: 'Prune stopped' }));
    expect(screen.getByRole('heading', { name: /^Confirm:/ })).toBeInTheDocument();
    const pruneButtons = screen.getAllByRole('button', { name: 'Prune stopped' });
    await user.click(pruneButtons[pruneButtons.length - 1]);

    await waitFor(() => expect(document.querySelector('.ui-toast-viewport')?.textContent).toMatch(/2/));
    expect(document.querySelector('.ui-toast-viewport')?.textContent).toMatch(/\d+(\.\d+)?\s?(B|KB|MB|GB)\b/);
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});

describe('ContainersScreen — text/state filtering (REQ-23)', () => {
  const containers = [
    makeContainer({ id: 'a', name: 'web-nginx', image: 'nginx:1.27', state: 'running' }),
    makeContainer({ id: 'b', name: 'cache-redis', image: 'redis:7', state: 'exited' }),
    makeContainer({ id: 'c', name: 'db-postgres', image: 'postgres:16', state: 'paused' }),
  ];

  it('matches by name, image or state, case-insensitively', async () => {
    const user = userEvent.setup();
    renderScreen(containers);

    await user.type(screen.getByPlaceholderText('Search name, image or state…'), 'REDIS');

    expect(screen.getByText('cache-redis')).toBeInTheDocument();
    expect(screen.queryByText('web-nginx')).not.toBeInTheDocument();
    expect(screen.queryByText('db-postgres')).not.toBeInTheDocument();
  });

  it('narrows to running containers when the Running chip is active', async () => {
    const user = userEvent.setup();
    renderScreen(containers);

    await user.click(screen.getByRole('button', { name: 'Running' }));

    expect(screen.getByText('web-nginx')).toBeInTheDocument();
    expect(screen.queryByText('cache-redis')).not.toBeInTheDocument();
    expect(screen.queryByText('db-postgres')).not.toBeInTheDocument();
  });

  it('narrows to stopped containers when the Stopped chip is active', async () => {
    const user = userEvent.setup();
    renderScreen(containers);

    await user.click(screen.getByRole('button', { name: 'Stopped' }));

    expect(screen.getByText('cache-redis')).toBeInTheDocument();
    expect(screen.queryByText('web-nginx')).not.toBeInTheDocument();
    expect(screen.queryByText('db-postgres')).not.toBeInTheDocument();
  });

  it('narrows to paused containers when the Paused chip is active', async () => {
    const user = userEvent.setup();
    renderScreen(containers);

    await user.click(screen.getByRole('button', { name: 'Paused' }));

    expect(screen.getByText('db-postgres')).toBeInTheDocument();
    expect(screen.queryByText('web-nginx')).not.toBeInTheDocument();
    expect(screen.queryByText('cache-redis')).not.toBeInTheDocument();
  });
});
