import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

/** The row's action area, which is the row's only action-bearing area. */
function actionArea(index = 0): HTMLElement {
  return document.querySelectorAll('.ui-action-button-group')[index] as HTMLElement;
}

function actionControls(index = 0): HTMLButtonElement[] {
  return Array.from(actionArea(index).querySelectorAll('button'));
}

/** Opens the row's overflow menu and returns its entries, in the order they are listed. */
async function openOverflow(user: ReturnType<typeof userEvent.setup>, name = 'web-nginx'): Promise<HTMLElement[]> {
  await user.click(screen.getByRole('button', { name: `More actions for ${name}` }));
  return screen.getAllByRole('menuitem');
}

// containers-screen.md — the action area is exactly four controls: three fixed lifecycle slots and,
// last, the overflow control; an action the state does not allow keeps its slot, disabled, stating
// why (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5).
describe('ContainersScreen — the row\'s four controls (REQ-1, REQ-2, REQ-5)', () => {
  const SLOTS: Array<{ state: ContainerSummary['state']; first: string }> = [
    { state: 'running', first: 'Stop' },
    { state: 'paused', first: 'Resume' },
    { state: 'restarting', first: 'Stop' },
    { state: 'created', first: 'Start' },
    { state: 'exited', first: 'Start' },
    { state: 'dead', first: 'Start' },
    { state: 'removing', first: 'Start' },
  ];

  it.each(SLOTS)('carries $first, Pause, Restart and the overflow control, in that order, on a $state container', ({ state, first }) => {
    renderScreen([makeContainer({ state })]);

    const controls = actionControls();
    expect(controls).toHaveLength(4);
    expect(controls[0]).toHaveAccessibleName(first);
    expect(controls[1]).toHaveAccessibleName('Pause');
    expect(controls[2]).toHaveAccessibleName('Restart');
    expect(controls[3]).toHaveAccessibleName('More actions for web-nginx');
    expect(controls[3]).toHaveAttribute('aria-haspopup', 'menu');
  });

  it.each(SLOTS)('puts no other action-bearing control anywhere on the row of a $state container', ({ state }) => {
    renderScreen([makeContainer({ state })]);

    const row = document.querySelector('.ui-data-table__row') as HTMLElement;
    const rowButtons = within(row).getAllByRole('button');
    expect(rowButtons).toHaveLength(4);
    for (const button of rowButtons) expect(actionArea().contains(button)).toBe(true);
  });

  it('offers no exec or attach control on the row, in any state', () => {
    for (const state of ['running', 'paused', 'restarting', 'exited'] as const) {
      cleanup();
      renderScreen([makeContainer({ state })]);

      for (const label of ['exec', 'attach', 'Exec', 'Attach']) {
        expect(within(actionArea()).queryByRole('button', { name: label })).not.toBeInTheDocument();
      }
    }
  });
});

// containers-screen.md — the legality matrix the row already offered, re-rendered: nothing became
// legal that the product did not allow before, and every disabled control states its reason
// (REQ-3, REQ-4).
describe('ContainersScreen — the lifecycle slots follow the state (REQ-3, REQ-4)', () => {
  it('enables all three slots for a running container', () => {
    renderScreen([makeContainer({ state: 'running' })]);

    for (const control of actionControls().slice(0, 3)) expect(control).toBeEnabled();
  });

  it('disables Pause on a paused container, stating that it is already paused, and keeps Resume and Restart usable', () => {
    renderScreen([makeContainer({ state: 'paused' })]);

    const [resume, pause, restart] = actionControls();
    expect(resume).toBeEnabled();
    expect(restart).toBeEnabled();
    expect(pause).toBeDisabled();
    expect(pause).toHaveAccessibleDescription(/paused/i);
  });

  it('disables all three slots on a restarting container, each stating why, with Stop in the first slot', () => {
    renderScreen([makeContainer({ state: 'restarting' })]);

    const [stop, pause, restart] = actionControls();
    expect(stop).toHaveAccessibleName('Stop');
    for (const control of [stop, pause, restart]) {
      expect(control).toBeDisabled();
      expect(control).toHaveAccessibleDescription(/restarting/i);
    }
  });

  it.each(['created', 'exited', 'dead', 'removing'] as const)('leaves Start usable and Pause and Restart disabled with a reason on a %s container', (state) => {
    renderScreen([makeContainer({ state })]);

    const [start, pause, restart] = actionControls();
    expect(start).toBeEnabled();
    for (const control of [pause, restart]) {
      expect(control).toBeDisabled();
      expect(control).toHaveAccessibleDescription(/not running/i);
    }
  });
});

// containers-screen.md — the overflow menu holds exactly four entries, always all four, always in
// the same order, whatever the state (REQ-6, REQ-7, REQ-8, REQ-9).
describe('ContainersScreen — the overflow menu (REQ-6, REQ-7, REQ-8, REQ-9)', () => {
  it.each(['running', 'paused', 'restarting', 'created', 'exited', 'dead', 'removing'] as const)(
    'lists Rename…, Export filesystem…, Kill and Remove, and nothing else, on a %s container',
    async (state) => {
      const user = userEvent.setup();
      renderScreen([makeContainer({ state })]);

      const entries = await openOverflow(user);

      expect(entries).toHaveLength(4);
      expect(entries[0]).toHaveAccessibleName('Rename…');
      expect(entries[1]).toHaveAccessibleName('Export filesystem…');
      expect(entries[2]).toHaveAccessibleName('Kill');
      expect(entries[3]).toHaveAccessibleName('Remove');
      expect(screen.queryByRole('menuitem', { name: /duplicate config/i })).not.toBeInTheDocument();
    },
  );

  it('sets Kill and Remove apart as a group, in the destructive tone', async () => {
    const user = userEvent.setup();
    renderScreen([makeContainer({ state: 'running' })]);

    const entries = await openOverflow(user);

    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(1);
    expect(separators[0].nextElementSibling).toHaveAccessibleName('Kill');
    expect(entries[0].className).not.toContain('destructive');
    expect(entries[1].className).not.toContain('destructive');
    expect(entries[2].className).toContain('destructive');
    expect(entries[3].className).toContain('destructive');
  });

  it('carries SIGKILL and rm as the secondary text of Kill and Remove', async () => {
    const user = userEvent.setup();
    renderScreen([makeContainer({ state: 'running' })]);

    const entries = await openOverflow(user);

    expect(entries[2]).toHaveTextContent('SIGKILL');
    expect(entries[2]).toHaveAccessibleDescription(/SIGKILL/);
    expect(entries[3]).toHaveTextContent('rm');
    expect(entries[3]).toHaveAccessibleDescription(/rm/);
  });

  it.each(['running', 'paused', 'restarting'] as const)('offers Kill on a %s container', async (state) => {
    const user = userEvent.setup();
    renderScreen([makeContainer({ state })]);

    const entries = await openOverflow(user);

    expect(entries[2]).not.toHaveAttribute('aria-disabled', 'true');
  });

  it.each(['created', 'exited', 'dead', 'removing'] as const)('disables Kill on a %s container, stating why, and keeps it in place', async (state) => {
    const user = userEvent.setup();
    renderScreen([makeContainer({ state })]);

    const entries = await openOverflow(user);

    expect(entries[2]).toHaveAttribute('aria-disabled', 'true');
    expect(entries[2]).toHaveAccessibleDescription(/\S/);
  });

  it.each(['running', 'paused', 'restarting', 'created', 'exited', 'dead', 'removing'] as const)(
    'leaves Rename…, Export filesystem… and Remove available on a %s container',
    async (state) => {
      const user = userEvent.setup();
      renderScreen([makeContainer({ state })]);

      const entries = await openOverflow(user);

      for (const entry of [entries[0], entries[1], entries[3]]) {
        expect(entry).not.toHaveAttribute('aria-disabled', 'true');
      }
    },
  );

  it('binds its entries to the container its row was rendered for', async () => {
    const user = userEvent.setup();
    renderScreen([
      makeContainer({ id: 'container-1', name: 'web-nginx', state: 'running' }),
      makeContainer({ id: 'container-2', name: 'cache-redis', state: 'running' }),
    ]);

    const entries = await openOverflow(user, 'cache-redis');
    await user.click(entries[3]);
    const confirmButtons = screen.getAllByRole('button', { name: 'rm' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/containers/container-2');
  });
});

// The operations these checks drove before this change are all still driven, through the entry
// point each of them now has: the lifecycle ones from their fixed slot, kill and remove from the
// overflow menu (REQ-20, REQ-21, REQ-22, REQ-23).
describe('ContainersScreen — running lifecycle actions (REQ-20, REQ-21, REQ-22)', () => {
  it('applies a non-destructive action immediately and re-reads the list, without asking for confirmation', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeContainer({ id: 'container-1', state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'Stop' }));

    expect(screen.queryByRole('heading', { name: /^Confirm:/ })).not.toBeInTheDocument();
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/containers/container-1/stop');
    expect(init.method).toBe('POST');
  });

  it('runs Pause, Restart and Resume from their own slots', async () => {
    const user = userEvent.setup();
    renderScreen([makeContainer({ id: 'container-1', state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/api/containers/container-1/pause');

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/api/containers/container-1/restart');

    cleanup();
    fetchMock.mockClear();
    renderScreen([makeContainer({ id: 'container-1', state: 'paused' })]);
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/api/containers/container-1/unpause');
  });

  it('starts a stopped container from its first slot', async () => {
    const user = userEvent.setup();
    renderScreen([makeContainer({ id: 'container-1', state: 'exited' })]);

    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/api/containers/container-1/start');
  });

  it("disables the row's controls while its own request is in flight, so a second click cannot race it", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const { onRefresh } = renderScreen([makeContainer({ state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'Stop' }));

    for (const control of actionControls().slice(0, 3)) {
      expect(control).toBeDisabled();
      expect(control).toHaveAccessibleDescription(/\S/);
    }
    // The overflow control itself stays operable, so the reason on its entries can be read.
    const entries = await openOverflow(user);
    expect(entries).toHaveLength(4);
    for (const entry of entries) {
      expect(entry).toHaveAttribute('aria-disabled', 'true');
      expect(entry).toHaveAccessibleDescription(/\S/);
    }
    await user.keyboard('{Escape}');

    resolveFetch({ ok: true, status: 204 });
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  });

  it('asks for confirmation naming the container before Kill, and performs nothing on cancel', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeContainer({ id: 'container-1', name: 'web-nginx', state: 'running' })]);

    const entries = await openOverflow(user);
    await user.click(entries[2]);

    expect(screen.getByRole('heading', { name: 'Confirm: web-nginx' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('kills the container and re-reads the list once confirmed', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeContainer({ id: 'container-1', name: 'web-nginx', state: 'running' })]);

    const entries = await openOverflow(user);
    await user.click(entries[2]);
    await user.click(screen.getByRole('button', { name: 'kill' }));

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/containers/container-1/kill');
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('asks for confirmation before Remove, performs nothing on cancel and removes once confirmed', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeContainer({ id: 'container-1', name: 'web-nginx', state: 'exited' })]);

    let entries = await openOverflow(user);
    await user.click(entries[3]);
    expect(screen.getByRole('heading', { name: 'Confirm: web-nginx' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fetchMock).not.toHaveBeenCalled();

    entries = await openOverflow(user);
    await user.click(entries[3]);
    await user.click(screen.getByRole('button', { name: 'rm' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/containers/container-1');
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('reports the daemon\'s own error message and leaves the screen usable when a lifecycle action fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'container is not running' }) });
    renderScreen([makeContainer({ state: 'running' })]);

    await user.click(screen.getByRole('button', { name: 'Stop' }));

    expect(await screen.findByText(/container is not running/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('reports the daemon\'s own error message when an action started from the menu fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'cannot kill container' }) });
    renderScreen([makeContainer({ state: 'running' })]);

    const entries = await openOverflow(user);
    await user.click(entries[2]);
    await user.click(screen.getByRole('button', { name: 'kill' }));

    expect(await screen.findByText(/cannot kill container/)).toBeInTheDocument();
  });
});

// containers-screen.md — "Export filesystem…" is started from the row's menu now, with the
// behaviour it had in the detail panel: a browser download of "<container name>.tar", no dialog,
// and a "Download started" toast naming the file (REQ-19, REQ-20, REQ-21).
describe('ContainersScreen — export filesystem from the row (REQ-20, REQ-21)', () => {
  it('downloads the container filesystem as <name>.tar with no dialog opened first, and reports a toast', async () => {
    const user = userEvent.setup();
    const downloadedHrefs: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedHrefs.push(this.href);
      });

    try {
      renderScreen([makeContainer({ id: 'container-1', name: 'web-nginx', state: 'running' })]);

      const entries = await openOverflow(user);
      await user.click(entries[1]);

      expect(downloadedHrefs).toHaveLength(1);
      expect(downloadedHrefs[0]).toContain('/api/containers/container-1/export');
      expect(downloadedHrefs[0]).toContain('filename=web-nginx.tar');
      expect(document.querySelector('.ui-modal')).toBeNull();
      expect(screen.getByText('Download started')).toBeInTheDocument();
      expect(screen.getByText('web-nginx.tar')).toBeInTheDocument();
    } finally {
      clickSpy.mockRestore();
    }
  });
});

// Rename is started from the row's overflow menu now — the pencil on the name cell is gone
// (REQ-18) — and the inline editor it opens is the one it always was (REQ-21).
describe('ContainersScreen — rename (REQ-18, REQ-21)', () => {
  it('offers no rename control on the name cell any more', () => {
    renderScreen([makeContainer({ name: 'web-nginx', state: 'running' })]);

    expect(screen.queryByRole('button', { name: 'Rename web-nginx' })).not.toBeInTheDocument();
  });

  it('starts the rename from the row menu and from nowhere else on the list', async () => {
    const user = userEvent.setup();
    renderScreen([makeContainer({ name: 'web-nginx', state: 'running' })]);

    const entries = await openOverflow(user);
    await user.click(entries[0]);

    expect(screen.getByRole('textbox', { name: 'New name for web-nginx' })).toBeInTheDocument();
  });

  it('replaces the name cell with a pre-filled field and renames on submit', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeContainer({ id: 'container-1', name: 'web-nginx', state: 'running' })]);

    await user.click((await openOverflow(user))[0]);

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

    await user.click((await openOverflow(user))[0]);
    await user.type(screen.getByRole('textbox', { name: 'New name for web-nginx' }), '{Enter}');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'New name for web-nginx' })).not.toBeInTheDocument();
  });

  it('discards the edit when the rename is cancelled', async () => {
    const user = userEvent.setup();
    renderScreen([makeContainer({ name: 'web-nginx', state: 'running' })]);

    await user.click((await openOverflow(user))[0]);
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
    makeContainer({ id: 'c', name: 'db-alpine', image: 'alpine:3.20', state: 'paused' }),
  ];

  it('matches by name, image or state, case-insensitively', async () => {
    const user = userEvent.setup();
    renderScreen(containers);

    await user.type(screen.getByPlaceholderText('Search name, image or state…'), 'REDIS');

    expect(screen.getByText('cache-redis')).toBeInTheDocument();
    expect(screen.queryByText('web-nginx')).not.toBeInTheDocument();
    expect(screen.queryByText('db-alpine')).not.toBeInTheDocument();
  });

  it('narrows to running containers when the Running chip is active', async () => {
    const user = userEvent.setup();
    renderScreen(containers);

    await user.click(screen.getByRole('button', { name: 'Running' }));

    expect(screen.getByText('web-nginx')).toBeInTheDocument();
    expect(screen.queryByText('cache-redis')).not.toBeInTheDocument();
    expect(screen.queryByText('db-alpine')).not.toBeInTheDocument();
  });

  it('narrows to stopped containers when the Stopped chip is active', async () => {
    const user = userEvent.setup();
    renderScreen(containers);

    await user.click(screen.getByRole('button', { name: 'Stopped' }));

    expect(screen.getByText('cache-redis')).toBeInTheDocument();
    expect(screen.queryByText('web-nginx')).not.toBeInTheDocument();
    expect(screen.queryByText('db-alpine')).not.toBeInTheDocument();
  });

  it('narrows to paused containers when the Paused chip is active', async () => {
    const user = userEvent.setup();
    renderScreen(containers);

    await user.click(screen.getByRole('button', { name: 'Paused' }));

    expect(screen.getByText('db-alpine')).toBeInTheDocument();
    expect(screen.queryByText('web-nginx')).not.toBeInTheDocument();
    expect(screen.queryByText('cache-redis')).not.toBeInTheDocument();
  });
});

// Exec and attach (REQ-34, REQ-35) are no longer duplicated as row buttons —
// which is what overflowed the lifecycle column — and are reached through the
// detail panel's tabs instead. Their absence from the row is asserted above;
// the tabs themselves are covered by container-detail-panel.test.tsx, which
// mounts the panel with a realistic inspect payload and the browser stubs it
// needs.
