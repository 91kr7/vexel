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

/** One container's inspect payload, as far as the dialog's tabs read it. */
function inspectFor(id: string) {
  return {
    id,
    name: id,
    image: 'nginx:1.27',
    command: ['sleep'],
    entrypoint: [],
    createdAt: '2026-01-01T00:00:00Z',
    state: { status: 'running', startedAt: '2026-01-01T00:00:01Z' },
    restartPolicy: { name: 'no' },
    resourceLimits: {},
    env: [] as string[],
    ports: [],
    mounts: [],
    networks: [],
    labels: {},
    raw: { Id: id },
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

function screenTree(containers: ContainerSummary[], onRefresh: () => void) {
  return (
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <ContainersScreen containers={containers} loaded onRefresh={onRefresh} />
            <ReportedErrors />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>
  );
}

function renderScreen(containers: ContainerSummary[], onRefresh = vi.fn()) {
  const view = render(screenTree(containers, onRefresh));
  return {
    onRefresh,
    /** Re-renders the screen with a new list, the way the live list re-reads under it. */
    withContainers: (next: ContainerSummary[]) => view.rerender(screenTree(next, onRefresh)),
  };
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

/**
 * The cards, in the order the grid draws them: the surfaces the screen puts in the table row's
 * place. Read as the grid's own children rather than by a selectable treatment the card no longer
 * asks for (`containers-screen.md`, detail_modal/REQ-7).
 */
function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-grid--cards > .ui-surface'));
}

/** One container's card — the surface the screen now draws per container, in the table row's place. */
function cardFor(name = 'web-nginx'): HTMLElement {
  const card = cards().find((candidate) => candidate.textContent?.includes(name));
  if (!card) throw new Error(`no card for ${name}`);
  return card;
}

/** The tone an element is drawn in; a badge or a dot carrying no tone class is the neutral one. */
function toneOf(element: Element | null): string | null {
  return element === null ? null : (/--tone-(\w+)/.exec(element.className)?.[1] ?? 'neutral');
}

/** One container's identity as a surface states it: the dot's tone, the name, the pills and the short id. */
interface Identity {
  dot: string | null;
  name: string | null;
  state: string | null;
  health: string | null;
  shortId: string | null;
}

function identityIn(region: HTMLElement | null): Identity {
  const badges = Array.from(region?.querySelectorAll('.ui-badge') ?? []).map((badge) => badge.textContent ?? '');
  return {
    dot: toneOf(region?.querySelector('.ui-table-status-dot') ?? null),
    name: region?.querySelector('.ui-section-header__title')?.textContent ?? null,
    state: badges[0] ?? null,
    health: badges[1] ?? null,
    shortId: region?.querySelector('.ui-table-identifier-cell')?.textContent ?? null,
  };
}

/**
 * What the dialog's header says the detail belongs to — the identity composition that replaced the
 * `Container — <name>` string, read from the dialog itself rather than by proximity to a card
 * (containers-screen.md, tabs_composition_refactor/REQ-6, REQ-7, REQ-8).
 */
function detailIdentity(): Identity {
  const dialog = document.querySelector<HTMLElement>('.ui-modal--size-large');
  return identityIn(dialog?.querySelector<HTMLElement>('.ui-modal__title') ?? null);
}

/**
 * The card's action-bearing areas: the primary lifecycle slot and the joined
 * `Pause` · `Restart` · `…` cluster are two groups, so the card's own action
 * area is both of them and nothing else.
 */
function actionAreas(name = 'web-nginx'): HTMLElement[] {
  return Array.from(cardFor(name).querySelectorAll<HTMLElement>('.ui-action-button-group'));
}

/** The four controls in the order they are drawn: the lifecycle slot, Pause, Restart, then the overflow. */
function actionControls(name = 'web-nginx'): HTMLButtonElement[] {
  return Array.from(cardFor(name).querySelectorAll<HTMLButtonElement>('.ui-action-button-group button'));
}

/** Opens the card's overflow menu and returns its entries, in the order they are listed. */
async function openOverflow(user: ReturnType<typeof userEvent.setup>, name = 'web-nginx'): Promise<HTMLElement[]> {
  await user.click(screen.getByRole('button', { name: `More actions for ${name}` }));
  return screen.getAllByRole('menuitem');
}

// containers-screen.md — four controls: three fixed lifecycle slots, then the overflow (REQ-1, REQ-2, REQ-5).
describe('ContainersScreen — the card\'s four controls (REQ-1, REQ-2, REQ-5)', () => {
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

  // container-card.md — the footer is the card's only action-bearing area; the detail opener stands
  // beside the id and outside the footer, and is named rather than counted away (detail_modal/REQ-9).
  it.each(SLOTS)('puts no other action-bearing control anywhere on the card of a $state container', ({ state }) => {
    renderScreen([makeContainer({ state })]);

    const cardButtons = within(cardFor()).getAllByRole('button');
    const areas = actionAreas();
    const detailControl = screen.getByRole('button', { name: 'Open web-nginx details' });
    expect(cardButtons).toHaveLength(5);
    for (const button of cardButtons) {
      if (button === detailControl) continue;
      expect(areas.some((area) => area.contains(button))).toBe(true);
    }
    expect(areas.some((area) => area.contains(detailControl)), 'the detail control sits in the action area').toBe(false);
    expect(detailControl).toBeEnabled();
  });

  it('offers no exec or attach control on the card, in any state', () => {
    for (const state of ['running', 'paused', 'restarting', 'exited'] as const) {
      cleanup();
      renderScreen([makeContainer({ state })]);

      for (const label of ['exec', 'attach', 'Exec', 'Attach']) {
        expect(within(cardFor()).queryByRole('button', { name: label })).not.toBeInTheDocument();
      }
    }
  });
});

// containers-screen.md — the delivered legality matrix, carried onto the card (REQ-3, REQ-4).
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

  it('binds its entries to the container its card was rendered for', async () => {
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

// containers-screen.md — every operation still driven, from the entry point it now has (REQ-20, REQ-21, REQ-22).
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

  it("disables the card's controls while its own request is in flight, so a second click cannot race it", async () => {
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

// containers-screen.md — "Export filesystem…" downloads `<name>.tar` with no dialog, and reports a toast (REQ-20, REQ-21).
describe('ContainersScreen — export filesystem from the card (REQ-20, REQ-21)', () => {
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

// Rename is started from the card's overflow menu — the pencil beside the name is gone (REQ-18) —
// and the inline editor it opens is the one it always was (REQ-21), now in the card's name place.
describe('ContainersScreen — rename (REQ-18, REQ-21)', () => {
  it('offers no rename control beside the name any more', () => {
    renderScreen([makeContainer({ name: 'web-nginx', state: 'running' })]);

    expect(screen.queryByRole('button', { name: 'Rename web-nginx' })).not.toBeInTheDocument();
  });

  it('starts the rename from the card menu and from nowhere else on the list', async () => {
    const user = userEvent.setup();
    renderScreen([makeContainer({ name: 'web-nginx', state: 'running' })]);

    const entries = await openOverflow(user);
    await user.click(entries[0]);

    expect(screen.getByRole('textbox', { name: 'New name for web-nginx' })).toBeInTheDocument();
  });

  it('replaces the name with a pre-filled field and renames on submit', async () => {
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

// containers-screen.md — the card's top-right control opens the detail on the library's dialog
// surface at its large size, and it is the only route in; the dialog has two ways out and `Escape`
// is not one of them (detail_modal/REQ-1, REQ-2, REQ-5, REQ-6, REQ-16, REQ-18).
//
// Restates the delivered "card selection opens and closes the detail panel" checks: the gesture,
// the surface and the dismissal routes all moved, and none of what they named goes unchecked.
describe('ContainersScreen — the card control opens the detail as a dialog (REQ-1, REQ-2, REQ-3, REQ-5, REQ-16, REQ-18)', () => {
  const web = makeContainer({ id: 'container-1', shortId: 'container1', name: 'web-nginx', image: 'nginx:1.27', state: 'running' });
  const cache = makeContainer({ id: 'container-2', shortId: 'container2', name: 'cache-redis', image: 'redis:7', state: 'running' });

  // The detail's read hook subscribes to daemon events through a module-level
  // EventSource, which jsdom does not provide.
  class FakeEventSource {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    addEventListener() {}
    close() {}
  }

  function inspectPayload(container: ContainerSummary) {
    return {
      id: container.id,
      name: container.name,
      image: container.image,
      command: ['sleep'],
      entrypoint: [],
      createdAt: '2026-01-01T00:00:00Z',
      state: { status: container.state, startedAt: '2026-01-01T00:00:01Z' },
      restartPolicy: { name: 'no' },
      resourceLimits: {},
      env: [],
      ports: [],
      mounts: [],
      networks: [],
      labels: {},
      raw: { Id: container.id },
    };
  }

  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    fetchMock.mockImplementation((url: string) => {
      const inspected = [web, cache].find((container) => String(url).includes(`/containers/${container.id}/inspect`));
      return Promise.resolve(
        inspected
          ? { ok: true, status: 200, json: () => Promise.resolve(inspectPayload(inspected)) }
          : { ok: true, status: 204, json: () => Promise.resolve({}) },
      );
    });
  });

  /** The dialog the card's control opens: the library's own surface, at its large size. */
  function detailDialog(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.ui-modal--size-large');
  }


  async function openDetail(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
    await user.click(within(cardFor(name)).getByRole('button', { name: `Open ${name} details` }));
  }

  it('opens that container’s detail on the large dialog surface, naming the container it belongs to', async () => {
    const user = userEvent.setup();
    renderScreen([web, cache]);

    await openDetail(user, 'web-nginx');

    const dialog = detailDialog();
    expect(dialog, 'the detail did not open on the library’s large dialog surface').not.toBeNull();
    // The identity composition that replaced the `Container — <name>` string: the dot, the bare
    // name, the state pill and the short id (tabs_composition_refactor/REQ-6, REQ-8).
    expect(detailIdentity()).toEqual({ dot: 'success', name: 'web-nginx', state: 'RUNNING', health: null, shortId: 'container1' });
    // …and it says as much as the card the operator just left: the same reading, from the same data.
    expect(detailIdentity()).toEqual(identityIn(cardFor('web-nginx')));
    expect(dialog!.querySelector('.ui-modal__title')?.textContent, 'the withdrawn prefix is still drawn').not.toMatch(/Container\s+—/);
    expect(await within(dialog!).findByRole('tab', { name: 'Config' })).toBeInTheDocument();
  });

  // detail_modal/REQ-4 — the same tabs in the same order, the same one active on open.
  it('shows the delivered tab row, Config active, inside the dialog', async () => {
    const user = userEvent.setup();
    renderScreen([web, cache]);

    await openDetail(user, 'web-nginx');
    const dialog = within(detailDialog()!);
    await dialog.findByRole('tab', { name: 'Config' });

    expect(dialog.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Logs',
      'Stats',
      'Config',
      'Processes',
      'Inspect',
      'Exec',
      'Attach',
    ]);
    expect(dialog.getByRole('tab', { name: 'Config' })).toHaveAttribute('aria-selected', 'true');
  });

  // detail_modal/REQ-2, REQ-3 — the inline expansion is gone: nothing opens beneath a card or
  // beneath a row of cards, and the grid still holds one card per matching container and nothing else.
  it('draws no expansion inside the grid, leaving the list exactly as it was', async () => {
    const user = userEvent.setup();
    renderScreen([web, cache]);
    const before = cards().map((card) => card.querySelector('.ui-section-header__title')?.textContent ?? '');

    await openDetail(user, 'web-nginx');
    await within(detailDialog()!).findByRole('tab', { name: 'Config' });

    expect(document.querySelector('.ui-grid__span-full'), 'the grid still holds a row-spanning expansion').toBeNull();
    expect(document.querySelector('.ui-detail-panel'), 'the detail is still drawn as the shared panel').toBeNull();
    expect(detailDialog()!.closest('.ui-grid--cards'), 'the dialog is a child of the list’s grid').toBeNull();
    expect(cards().map((card) => card.querySelector('.ui-section-header__title')?.textContent ?? '')).toEqual(before);
  });

  // detail_modal/REQ-8 — nothing on any card marks it as the one whose detail is open.
  it('marks no card as the one whose detail is open', async () => {
    const user = userEvent.setup();
    renderScreen([web, cache]);

    await openDetail(user, 'web-nginx');
    await within(detailDialog()!).findByRole('tab', { name: 'Config' });

    expect(document.querySelectorAll('.ui-surface--selected')).toHaveLength(0);
    for (const card of cards()) {
      expect(card.getAttribute('aria-selected')).toBeNull();
      expect(card.getAttribute('aria-expanded')).toBeNull();
    }
  });

  // detail_modal/REQ-6 — the control is the only route in: clicking the card anywhere else opens nothing.
  it('opens nothing when the card is clicked anywhere but its control', async () => {
    const user = userEvent.setup();
    renderScreen([web, cache]);

    const card = cardFor('web-nginx');
    await user.click(card.querySelector('.ui-section-header__title') as HTMLElement);
    await user.click(card.querySelector('.ui-chip--block') as HTMLElement);
    await user.click(card.querySelector('.ui-metric-strip') as HTMLElement);

    expect(detailDialog(), 'the card body is still a route into the detail').toBeNull();
  });

  // detail_modal/REQ-15 — at most one detail stands at a time, and it is the one last opened.
  it('holds one detail at a time, on the container last asked for', async () => {
    const user = userEvent.setup();
    renderScreen([web, cache]);

    await openDetail(user, 'web-nginx');
    await within(detailDialog()!).findByRole('tab', { name: 'Config' });
    expect(document.querySelectorAll('.ui-modal--size-large')).toHaveLength(1);

    // The dialog covers the cards, so the second one is reached by leaving the first: whichever
    // route gets there, two never stand at once.
    await user.click(within(detailDialog()!).getByRole('button', { name: 'Close dialog' }));
    await openDetail(user, 'cache-redis');

    expect(document.querySelectorAll('.ui-modal--size-large')).toHaveLength(1);
    expect(detailIdentity()).toEqual({ dot: 'success', name: 'cache-redis', state: 'RUNNING', health: null, shortId: 'container2' });
  });
});

// containers-screen.md — two ways out and only those two, both returning the point of interaction
// to the control that opened the dialog (detail_modal/REQ-10, REQ-11, REQ-13, REQ-17).
describe('ContainersScreen — the detail dialog’s two ways out (REQ-10, REQ-11, REQ-13, REQ-17)', () => {
  const web = makeContainer({ id: 'container-1', shortId: 'container1', name: 'web-nginx', image: 'nginx:1.27', state: 'running' });

  class FakeEventSource {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    addEventListener() {}
    close() {}
  }

  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes(`/containers/${web.id}/inspect`)
          ? {
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  id: web.id,
                  name: web.name,
                  image: web.image,
                  command: ['sleep'],
                  entrypoint: [],
                  createdAt: '2026-01-01T00:00:00Z',
                  state: { status: web.state, startedAt: '2026-01-01T00:00:01Z' },
                  restartPolicy: { name: 'no' },
                  resourceLimits: {},
                  env: [],
                  ports: [],
                  mounts: [],
                  networks: [],
                  labels: {},
                  raw: { Id: web.id },
                }),
            }
          : { ok: true, status: 204, json: () => Promise.resolve({}) },
      ),
    );
  });

  function detailDialog(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.ui-modal--size-large');
  }

  function opener(): HTMLElement {
    return within(cardFor('web-nginx')).getByRole('button', { name: 'Open web-nginx details' });
  }

  async function openDetail(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(opener());
    await within(detailDialog()!).findByRole('tab', { name: 'Config' });
  }

  it('carries one labelled close control that dismisses it, and hands the point of interaction back', async () => {
    const user = userEvent.setup();
    renderScreen([web]);
    await openDetail(user);

    expect(document.querySelectorAll('.ui-modal--size-large button[aria-label="Close dialog"]')).toHaveLength(1);
    await user.click(within(detailDialog()!).getByRole('button', { name: 'Close dialog' }));

    expect(detailDialog()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener()));
  });

  it('is dismissed by a click on the dimmed area beside it, handing the point of interaction back too', async () => {
    const user = userEvent.setup();
    renderScreen([web]);
    await openDetail(user);

    await user.click(document.querySelector('.ui-modal-overlay') as HTMLElement);

    expect(detailDialog()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener()));
  });

  // detail_modal/REQ-11 — a change against the starting point, stated rather than inferred: the
  // inline panel this replaces closed on the key, and the dialog does not.
  it('is left standing by Escape, from the dialog and from a control inside it', async () => {
    const user = userEvent.setup();
    renderScreen([web]);
    await openDetail(user);

    await user.keyboard('{Escape}');
    expect(detailDialog(), 'Escape closed the dialog').not.toBeNull();

    await user.click(within(detailDialog()!).getByRole('tab', { name: 'Inspect' }));
    within(detailDialog()!).getByRole('tab', { name: 'Inspect' }).focus();
    await user.keyboard('{Escape}');

    expect(detailDialog(), 'Escape closed the dialog from a control inside it').not.toBeNull();
    expect(within(detailDialog()!).getByRole('tab', { name: 'Inspect' })).toHaveAttribute('aria-selected', 'true');
  });
});

// container-detail-panel.md — "nothing the panel owns outlives the dialog, and opening and closing
// detail after detail accumulates none of them" (detail_modal/REQ-23, REQ-24). Every stream the
// detail opened is counted, so a stream left running behind a dismissed dialog is named rather than
// inferred from the screen still working.
describe('ContainersScreen — nothing outlives a dismissed dialog (REQ-23, REQ-24)', () => {
  const containers = ['web-nginx', 'cache-redis', 'db-alpine'].map((name, index) =>
    makeContainer({ id: `container-${index + 1}`, shortId: `container${index + 1}`, name, state: 'running' }),
  );

  /** Every stream the page opened, and whether it is still open: the count the requirement is about. */
  class TrackingEventSource {
    static instances: TrackingEventSource[] = [];
    url: string;
    closed = false;

    constructor(url: string) {
      this.url = url;
      TrackingEventSource.instances.push(this);
    }

    addEventListener() {}
    removeEventListener() {}

    close() {
      this.closed = true;
    }
  }

  function detailStreams(): TrackingEventSource[] {
    return TrackingEventSource.instances.filter((instance) => /\/(logs|stats)\/stream/.test(instance.url));
  }

  beforeEach(() => {
    TrackingEventSource.instances = [];
    vi.stubGlobal('EventSource', TrackingEventSource);
    fetchMock.mockImplementation((url: string) => {
      const id = /\/containers\/([^/]+)\/inspect/.exec(String(url))?.[1];
      return Promise.resolve(
        id
          ? {
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  id,
                  name: id,
                  image: 'nginx:1.27',
                  command: ['sleep'],
                  entrypoint: [],
                  createdAt: '2026-01-01T00:00:00Z',
                  state: { status: 'running', startedAt: '2026-01-01T00:00:01Z' },
                  restartPolicy: { name: 'no' },
                  resourceLimits: {},
                  env: [],
                  ports: [],
                  mounts: [],
                  networks: [],
                  labels: {},
                  raw: { Id: id },
                }),
            }
          : { ok: true, status: 200, json: () => Promise.resolve({ titles: [], processes: [] }) },
      );
    });
  });

  it('ends every stream the detail opened, over detail after detail, by both dismissal routes', async () => {
    const user = userEvent.setup();
    renderScreen(containers);
    const dialog = () => document.querySelector<HTMLElement>('.ui-modal--size-large');

    for (const [index, container] of containers.entries()) {
      await user.click(within(cardFor(container.name)).getByRole('button', { name: `Open ${container.name} details` }));
      const open = within(dialog()!);
      await open.findByRole('tab', { name: 'Config' });

      // The two tabs that own a live stream, visited on every container.
      await user.click(open.getByRole('tab', { name: 'Logs' }));
      await waitFor(() => expect(detailStreams().length).toBeGreaterThan(index));
      await user.click(open.getByRole('tab', { name: 'Stats' }));

      // Both ways out, alternated: neither may leave a stream behind.
      if (index % 2 === 0) await user.click(open.getByRole('button', { name: 'Close dialog' }));
      else await user.click(document.querySelector('.ui-modal-overlay') as HTMLElement);

      await waitFor(() => expect(dialog()).toBeNull());
    }

    expect(detailStreams().length, 'the detail opened no stream at all, so this would prove nothing').toBeGreaterThanOrEqual(
      containers.length,
    );
    expect(
      detailStreams().filter((stream) => !stream.closed).map((stream) => stream.url),
      'a stream is still running behind a dismissed dialog',
    ).toEqual([]);
    expect(document.querySelectorAll('.ui-modal'), 'a dialog is still standing').toHaveLength(0);
  });
});

// containers-screen.md — the dialog is bound to its container by id, read from the whole list
// rather than the filtered one. Restates the delivered checks that had a filter take the panel off
// screen with its card (detail_modal/REQ-32, arriving with the construction of F1).
describe('ContainersScreen — the dialog follows its container, not the filter (REQ-32)', () => {
  const web = makeContainer({ id: 'container-1', shortId: 'container1', name: 'web-nginx', image: 'nginx:1.27', state: 'running' });
  const cache = makeContainer({ id: 'container-2', shortId: 'container2', name: 'cache-redis', image: 'redis:7', state: 'running' });

  class FakeEventSource {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    addEventListener() {}
    close() {}
  }

  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    fetchMock.mockImplementation((url: string) => {
      const id = /\/containers\/([^/]+)\/inspect/.exec(String(url))?.[1];
      return Promise.resolve(
        id
          ? {
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  id,
                  name: id,
                  image: 'nginx:1.27',
                  command: ['sleep'],
                  entrypoint: [],
                  createdAt: '2026-01-01T00:00:00Z',
                  state: { status: 'running', startedAt: '2026-01-01T00:00:01Z' },
                  restartPolicy: { name: 'no' },
                  resourceLimits: {},
                  env: [],
                  ports: [],
                  mounts: [],
                  networks: [],
                  labels: {},
                  raw: { Id: id },
                }),
            }
          : { ok: true, status: 204, json: () => Promise.resolve({}) },
      );
    });
  });

  function detailDialog(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.ui-modal--size-large');
  }

  async function openDetail(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
    await user.click(within(cardFor(name)).getByRole('button', { name: `Open ${name} details` }));
    expect(detailDialog()).not.toBeNull();
  }

  it('stays open on its container while a search narrows the cards behind it', async () => {
    const user = userEvent.setup();
    renderScreen([web, cache]);
    await openDetail(user, 'web-nginx');

    const search = screen.getByPlaceholderText('Search name, image or state…');
    await user.type(search, 'cache');

    expect(cards().some((card) => card.textContent?.includes('web-nginx')), 'the filtered-out card is still drawn').toBe(false);
    expect(detailDialog(), 'a filter behind the dialog dismissed it').not.toBeNull();
    expect(detailIdentity()).toEqual({ dot: 'success', name: 'web-nginx', state: 'RUNNING', health: null, shortId: 'container1' });

    await user.clear(search);

    expect(detailDialog()).not.toBeNull();
    expect(detailIdentity()).toEqual({ dot: 'success', name: 'web-nginx', state: 'RUNNING', health: null, shortId: 'container1' });
  });

  it('stays open on its container while a state filter excludes it', async () => {
    const user = userEvent.setup();
    renderScreen([web, makeContainer({ id: 'container-3', name: 'db-alpine', state: 'exited' })]);
    await openDetail(user, 'web-nginx');

    await user.click(screen.getByRole('button', { name: 'Stopped' }));

    expect(cards().some((card) => card.textContent?.includes('web-nginx'))).toBe(false);
    expect(detailDialog()).not.toBeNull();
    expect(detailIdentity()).toEqual({ dot: 'success', name: 'web-nginx', state: 'RUNNING', health: null, shortId: 'container1' });
  });

  // containers-screen.md — "neither is a list re-read that moves or redraws the cards": the bond is
  // to the container's id, so the same container, the same tab and the same streams survive one
  // (detail_modal/REQ-32).
  it('stays open on its container, on the same tab, across a list re-read that redraws the cards', async () => {
    const user = userEvent.setup();
    const { withContainers } = renderScreen([web, cache]);
    await openDetail(user, 'web-nginx');
    await within(detailDialog()!).findByRole('tab', { name: 'Config' });
    await user.click(within(detailDialog()!).getByRole('tab', { name: 'Inspect' }));

    // The live list re-reads: the same container, redrawn, now behind a neighbour.
    withContainers([{ ...cache, status: 'Up 4 days' }, { ...web, status: 'Up 4 days' }]);

    expect(detailDialog(), 'a list re-read behind the dialog dismissed it').not.toBeNull();
    expect(detailIdentity()).toEqual({ dot: 'success', name: 'web-nginx', state: 'RUNNING', health: null, shortId: 'container1' });
    expect(
      within(detailDialog()!).getByRole('tab', { name: 'Inspect' }),
      'the re-read sent the dialog back to another tab',
    ).toHaveAttribute('aria-selected', 'true');
  });
});

// containers-screen.md — "the header's values come from the container data the screen already
// holds … a state or a health outcome that changes while the dialog is open shows there on the
// screen's own re-read, without the operator acting, and no request, endpoint or sampling cadence
// is added to make it so" (tabs_composition_refactor/REQ-6, REQ-7, REQ-8, REQ-9).
describe('ContainersScreen — the dialog\'s header carries the container\'s identity (REQ-6, REQ-7, REQ-8, REQ-9)', () => {
  const healthy = makeContainer({
    id: 'container-1',
    shortId: 'container1',
    name: 'web-nginx',
    image: 'nginx:1.27',
    state: 'running',
    status: 'Up 3 days (healthy)',
  });
  const plain = makeContainer({ id: 'container-2', shortId: 'container2', name: 'cache-redis', image: 'redis:7', state: 'running' });

  class FakeEventSource {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }

  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    fetchMock.mockImplementation((url: string) => {
      const id = /\/containers\/([^/]+)\/inspect/.exec(String(url))?.[1];
      return Promise.resolve(
        id
          ? { ok: true, status: 200, json: () => Promise.resolve(inspectFor(id)) }
          : { ok: true, status: 200, json: () => Promise.resolve({ titles: [], processes: [] }) },
      );
    });
  });

  function detailDialog(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.ui-modal--size-large');
  }

  async function openDetail(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
    await user.click(within(cardFor(name)).getByRole('button', { name: `Open ${name} details` }));
    await within(detailDialog()!).findByRole('tab', { name: 'Config' });
  }

  /** Every URL the screen has asked the daemon for, so a new request can be told from none. */
  function requestedUrls(): string[] {
    return fetchMock.mock.calls.map(([url]) => String(url));
  }

  // REQ-7 — a container the daemon states an outcome for shows it as a pill; one it states none for
  // shows no health pill at all.
  it('shows the health outcome the daemon states, and nothing at all where it states none', async () => {
    const user = userEvent.setup();
    renderScreen([healthy, plain]);

    await openDetail(user, 'web-nginx');
    expect(detailIdentity()).toEqual({ dot: 'success', name: 'web-nginx', state: 'RUNNING', health: 'HEALTHY', shortId: 'container1' });

    await user.click(within(detailDialog()!).getByRole('button', { name: 'Close dialog' }));
    await openDetail(user, 'cache-redis');

    expect(detailIdentity()).toEqual({ dot: 'success', name: 'cache-redis', state: 'RUNNING', health: null, shortId: 'container2' });
    expect(
      detailDialog()!.querySelectorAll('.ui-modal__title .ui-badge'),
      'a second pill stands where the absent health outcome would be',
    ).toHaveLength(1);
  });

  // REQ-9 — the state that changes under an open detail shows there on the screen's own re-read,
  // with the operator doing nothing and nothing new asked of the daemon.
  it('follows a state that changes under the open dialog, asking the daemon for nothing new', async () => {
    const user = userEvent.setup();
    const { withContainers } = renderScreen([healthy, plain]);
    await openDetail(user, 'web-nginx');
    expect(detailIdentity().state).toBe('RUNNING');
    const askedBefore = new Set(requestedUrls());

    // The list re-reads: the same container, stopped by another client of the same daemon.
    withContainers([{ ...healthy, state: 'exited', status: 'Exited (0) 2 seconds ago' }, plain]);

    await waitFor(() =>
      expect(detailIdentity()).toEqual({ dot: 'neutral', name: 'web-nginx', state: 'EXITED', health: null, shortId: 'container1' }),
    );
    expect(
      requestedUrls().filter((url) => !askedBefore.has(url) && !/\/inspect/.test(url)),
      'the header asked the daemon for something of its own',
    ).toEqual([]);
  });

  // REQ-9 / containers-screen.md — a health outcome that changes is read the same way, out of the
  // status sentence the re-read list already carries.
  it('follows a health outcome that changes under the open dialog', async () => {
    const user = userEvent.setup();
    const { withContainers } = renderScreen([healthy, plain]);
    await openDetail(user, 'web-nginx');
    expect(detailIdentity().health).toBe('HEALTHY');

    withContainers([{ ...healthy, status: 'Up 3 days (unhealthy)' }, plain]);

    await waitFor(() => expect(detailIdentity().health).toBe('UNHEALTHY'));
    expect(toneOf(detailDialog()!.querySelectorAll('.ui-modal__title .ui-badge')[1])).toBe('danger');
  });

  // containers-screen.md — "in that end state the header freezes at the container's last known
  // identity": the values are the ones the list last carried, not the ones it opened on.
  it('freezes the header at the last identity the list carried once the container has gone', async () => {
    const user = userEvent.setup();
    const { withContainers } = renderScreen([healthy, plain]);
    await openDetail(user, 'web-nginx');

    // Stopped first, then removed: the frozen identity must be the last one, not the opened one.
    withContainers([{ ...healthy, state: 'exited', status: 'Exited (137) 1 second ago' }, plain]);
    await waitFor(() => expect(detailIdentity().state).toBe('EXITED'));

    withContainers([plain]);

    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll('.ui-modal--size-large .ui-empty-state__title')).some((title) =>
          /no longer exists/i.test(title.textContent ?? ''),
        ),
      ).toBe(true),
    );
    expect(detailIdentity()).toEqual({ dot: 'neutral', name: 'web-nginx', state: 'EXITED', health: null, shortId: 'container1' });
  });
});

// containers-screen.md — "a container that leaves the daemon's list does not close the dialog
// silently: the dialog states it, in place", keeping its chrome so both ways out still work, with
// every stream and session it owned gone with the tabs (detail_modal/REQ-33, REQ-34, REQ-36).
// Restates the delivered check that had the same event close the panel without a word.
describe('ContainersScreen — a container that ceases to exist is stated on the dialog (REQ-33, REQ-34, REQ-36)', () => {
  const web = makeContainer({ id: 'container-1', shortId: 'container1', name: 'web-nginx', image: 'nginx:1.27', state: 'running' });
  const cache = makeContainer({ id: 'container-2', shortId: 'container2', name: 'cache-redis', image: 'redis:7', state: 'running' });

  /** Every stream the page opened, and whether it is still open — REQ-36's first half is a count. */
  class TrackingEventSource {
    static instances: TrackingEventSource[] = [];
    url: string;
    closed = false;

    constructor(url: string) {
      this.url = url;
      TrackingEventSource.instances.push(this);
    }

    addEventListener() {}
    removeEventListener() {}

    close() {
      this.closed = true;
    }
  }

  function detailStreams(): TrackingEventSource[] {
    return TrackingEventSource.instances.filter((instance) => /\/(logs|stats)\/stream/.test(instance.url));
  }

  beforeEach(() => {
    TrackingEventSource.instances = [];
    vi.stubGlobal('EventSource', TrackingEventSource);
    fetchMock.mockImplementation((url: string) => {
      const id = /\/containers\/([^/]+)\/inspect/.exec(String(url))?.[1];
      return Promise.resolve(
        id
          ? { ok: true, status: 200, json: () => Promise.resolve(inspectFor(id)) }
          : { ok: true, status: 200, json: () => Promise.resolve({ titles: [], processes: [] }) },
      );
    });
  });

  function detailDialog(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.ui-modal--size-large');
  }

  /** The dialog's stated end state, drawn on the library's one empty-result surface. */
  function endStateTitle(): HTMLElement | null {
    return (
      Array.from(document.querySelectorAll<HTMLElement>('.ui-modal--size-large .ui-empty-state__title')).find((title) =>
        /no longer exists/i.test(title.textContent ?? ''),
      ) ?? null
    );
  }

  async function openDetail(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
    await user.click(within(cardFor(name)).getByRole('button', { name: `Open ${name} details` }));
    await within(detailDialog()!).findByRole('tab', { name: 'Config' });
  }

  /** The removal, as the live list reports it: the container is simply no longer in the re-read. */
  async function removeFromTheList(withContainers: (next: ContainerSummary[]) => void): Promise<void> {
    withContainers([cache]);
    await waitFor(() => {
      expect(detailDialog(), 'the dialog closed silently instead of stating the removal').not.toBeNull();
      expect(endStateTitle(), 'the dialog said nothing about the container having gone').not.toBeNull();
    });
  }

  it('states in place of the tabs that the container no longer exists, and keeps the dialog’s chrome', async () => {
    const user = userEvent.setup();
    const { withContainers } = renderScreen([web, cache]);
    await openDetail(user, 'web-nginx');

    await removeFromTheList(withContainers);

    const dialog = detailDialog()!;
    expect(endStateTitle()!.textContent).toBe('This container no longer exists');
    // The explanation and the resolving action are what the empty-result surface is made of.
    expect(dialog.querySelector('.ui-empty-state__description')?.textContent ?? '').toMatch(/remov/i);
    expect(within(dialog.querySelector('.ui-empty-state') as HTMLElement).getAllByRole('button').length).toBeGreaterThan(0);
    // In place of the tabs: nothing of the detail is left standing on data that has stopped.
    expect(within(dialog).queryAllByRole('tab'), 'the tabs are still drawn beside the statement').toHaveLength(0);
    // The chrome is kept, so the dialog still says what it belonged to and still has its way out.
    // The header is frozen at the last identity the list carried for the container: it states no
    // new state of its own, so it never contradicts the end state the body states
    // (containers-screen.md, tabs_composition_refactor/REQ-9).
    expect(detailIdentity()).toEqual({ dot: 'success', name: 'web-nginx', state: 'RUNNING', health: null, shortId: 'container1' });
    expect(within(dialog).getAllByRole('button', { name: 'Close dialog' })).toHaveLength(1);
    expect(cards().some((card) => card.textContent?.includes('web-nginx'))).toBe(false);
  });

  it('has ended every stream the detail owned by the time it states the removal', async () => {
    const user = userEvent.setup();
    const { withContainers } = renderScreen([web, cache]);
    await openDetail(user, 'web-nginx');

    // The two tabs that own a live stream, so there is something to have ended.
    await user.click(within(detailDialog()!).getByRole('tab', { name: 'Logs' }));
    await waitFor(() => expect(detailStreams().length).toBeGreaterThan(0));
    await user.click(within(detailDialog()!).getByRole('tab', { name: 'Stats' }));
    await waitFor(() => expect(detailStreams().length).toBeGreaterThan(1));

    await removeFromTheList(withContainers);

    expect(
      detailStreams().filter((stream) => !stream.closed).map((stream) => stream.url),
      'a stream the detail opened is still running behind the stated end state',
    ).toEqual([]);
  });

  it('is dismissed from the end state by the close control, landing the point of interaction on the list', async () => {
    const user = userEvent.setup();
    const { withContainers } = renderScreen([web, cache]);
    await openDetail(user, 'web-nginx');
    await removeFromTheList(withContainers);

    await user.click(within(detailDialog()!).getByRole('button', { name: 'Close dialog' }));

    expect(detailDialog()).toBeNull();
    // The card that opened it left with the container, so the list region is what takes the focus.
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('.ui-grid--cards')));
  });

  it('is dismissed from the end state by a click on the dimmed area beside it', async () => {
    const user = userEvent.setup();
    const { withContainers } = renderScreen([web, cache]);
    await openDetail(user, 'web-nginx');
    await removeFromTheList(withContainers);

    await user.click(document.querySelector('.ui-modal-overlay') as HTMLElement);

    expect(detailDialog()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('.ui-grid--cards')));
  });

  it('is dismissed from the end state by the resolving action the statement offers', async () => {
    const user = userEvent.setup();
    const { withContainers } = renderScreen([web, cache]);
    await openDetail(user, 'web-nginx');
    await removeFromTheList(withContainers);

    const emptyState = detailDialog()!.querySelector('.ui-empty-state') as HTMLElement;
    await user.click(within(emptyState).getAllByRole('button')[0]);

    expect(detailDialog(), 'the statement’s own action did not resolve it').toBeNull();
  });
});

// containers-screen.md — "a recreate is not a disappearance": the dialog follows the container onto
// its replacement, and draws no end state in the window before the list carries it
// (detail_modal/REQ-35).
describe('ContainersScreen — a recreate is not a disappearance (REQ-35)', () => {
  const web = makeContainer({ id: 'container-1', shortId: 'container1', name: 'web-nginx', image: 'nginx:1.27', state: 'running' });
  const cache = makeContainer({ id: 'container-2', shortId: 'container2', name: 'cache-redis', image: 'redis:7', state: 'running' });
  const recreated = makeContainer({ id: 'container-9', shortId: 'container9', name: 'web-nginx', image: 'nginx:1.27', state: 'running' });

  class FakeEventSource {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }

  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    fetchMock.mockImplementation((url: string) => {
      const target = String(url);
      if (target.includes('/config')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ path: 'recreate', container: recreated }) });
      }
      const id = /\/containers\/([^/]+)\/inspect/.exec(target)?.[1];
      return Promise.resolve(
        id
          ? { ok: true, status: 200, json: () => Promise.resolve({ ...inspectFor(id), env: ['FOO=bar'] }) }
          : { ok: true, status: 204, json: () => Promise.resolve({}) },
      );
    });
  });

  function detailDialog(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.ui-modal--size-large');
  }

  function endStateTitle(): HTMLElement | null {
    return (
      Array.from(document.querySelectorAll<HTMLElement>('.ui-modal--size-large .ui-empty-state__title')).find((title) =>
        /no longer exists/i.test(title.textContent ?? ''),
      ) ?? null
    );
  }

  /** The Config tab's edit, saved and confirmed: the change the daemon can only apply by recreating. */
  async function recreateThroughConfig(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(within(cardFor('web-nginx')).getByRole('button', { name: 'Open web-nginx details' }));
    await user.click(await within(detailDialog()!).findByRole('button', { name: 'Edit configuration' }));

    const value = within(detailDialog()!).getByRole('textbox', { name: 'Environment Value 1' });
    await user.clear(value);
    await user.type(value, 'baz');
    await user.click(within(detailDialog()!).getByRole('button', { name: 'Save changes' }));

    const heading = await screen.findByRole('heading', { name: 'Confirm: web-nginx' });
    await user.click(within(heading.closest('.ui-modal') as HTMLElement).getByRole('button', { name: 'Recreate container' }));
    await waitFor(() => expect(document.querySelector('.ui-toast-viewport')?.textContent).toMatch(/Container recreated/));
  }

  it('leaves the dialog open on the recreated container, drawing no end state while the list catches up', async () => {
    const user = userEvent.setup();
    const { withContainers } = renderScreen([web]);

    await recreateThroughConfig(user);

    expect(detailDialog(), 'the recreate closed the dialog').not.toBeNull();
    expect(endStateTitle(), 'the recreate was read as a disappearance').toBeNull();

    // The list re-reads on the removal before it carries the replacement: still not a disappearance.
    withContainers([cache]);
    expect(detailDialog(), 'the re-read behind the recreate closed the dialog').not.toBeNull();
    expect(endStateTitle(), 'the dialog stated a disappearance while the recreate was still landing').toBeNull();

    // …and then it carries it, and the dialog is showing the new container.
    withContainers([cache, recreated]);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([called]) => String(called).includes(`/containers/${recreated.id}/inspect`)),
        'the dialog never read the recreated container',
      ).toBe(true),
    );
    expect(detailDialog()).not.toBeNull();
    expect(endStateTitle()).toBeNull();
    // The dialog is re-pointed onto the recreated container, so the header states the new
    // container's own short id under the name it kept (containers-screen.md).
    expect(detailIdentity()).toEqual({ dot: 'success', name: 'web-nginx', state: 'RUNNING', health: null, shortId: 'container9' });
    expect(within(detailDialog()!).queryAllByRole('tab').length).toBeGreaterThan(0);
  });
});

// Exec and attach are reached through the panel's tabs, covered by container-detail-panel.test.tsx.

// containers-screen.md — one card per container in the table's place
// (plan-docker_management_app-containers_card_view/REQ-1, REQ-23).
describe('ContainersScreen — the list is a stack of cards (REQ-1)', () => {
  const three = [
    makeContainer({ id: 'a', name: 'alpha', state: 'running' }),
    makeContainer({ id: 'b', name: 'bravo', state: 'paused' }),
    makeContainer({ id: 'c', name: 'charlie', state: 'exited' }),
  ];

  it('draws one card per container and no table at all', () => {
    renderScreen(three);

    expect(cards()).toHaveLength(3);
    expect(document.querySelector('.ui-data-table')).toBeNull();
    expect(document.querySelector('.ui-data-table__header')).toBeNull();
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
  });

  // containers-screen.md — the arrangement owns the tracks and the gap, so the screen states neither (REQ-1, REQ-31).
  it('lays the cards as siblings of one cards grid, with no surface enclosing the list', () => {
    renderScreen(three);

    const list = cards()[0].parentElement as HTMLElement;
    expect(cards().every((card) => card.parentElement === list)).toBe(true);
    expect(list).toHaveClass('ui-grid');
    expect(list).toHaveClass('ui-grid--cards');
    expect(list.style.gap, 'the screen states a gap the arrangement owns').toBe('');
    expect(list.style.gridTemplateColumns, 'the screen states a template the arrangement owns').toBe('');
    expect(list.classList.contains('ui-surface'), 'a surface encloses the list of cards').toBe(false);
  });


  it('renders the containers in the order it was given them, and offers no sort control', () => {
    // The server's order, handed over unchanged: a client-side sort would show these three
    // alphabetically (REQ-24).
    renderScreen([three[2], three[0], three[1]]);

    const names = cards().map((card) => card.querySelector('.ui-section-header__title')?.textContent ?? '');
    expect(names).toEqual(['charlie', 'alpha', 'bravo']);
    for (const control of screen.getAllByRole('button')) {
      expect(control).not.toHaveAccessibleName(/sort/i);
    }
  });

  it('offers no selection and no bulk actions', () => {
    renderScreen(three);

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(document.querySelector('.ui-bulk-action-bar')).toBeNull();
  });

  it('shows the empty state in the list\'s place when nothing matches, and the cards again when it does', async () => {
    const user = userEvent.setup();
    renderScreen(three);

    await user.type(screen.getByPlaceholderText('Search name, image or state…'), 'no-such-container');

    expect(screen.getByText('No containers match')).toBeInTheDocument();
    expect(cards()).toHaveLength(0);

    await user.clear(screen.getByPlaceholderText('Search name, image or state…'));

    expect(screen.queryByText('No containers match')).not.toBeInTheDocument();
    expect(cards()).toHaveLength(3);
  });

  it('keeps the relative order of the cards a filter leaves standing', async () => {
    const user = userEvent.setup();
    renderScreen([
      makeContainer({ id: 'a', name: 'zulu', state: 'running' }),
      makeContainer({ id: 'b', name: 'mike', state: 'exited' }),
      makeContainer({ id: 'c', name: 'alpha', state: 'running' }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Running' }));

    const names = cards().map((card) => card.querySelector('.ui-section-header__title')?.textContent ?? '');
    expect(names).toEqual(['zulu', 'alpha']);
  });
});
