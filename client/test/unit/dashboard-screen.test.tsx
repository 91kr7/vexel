import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContainerSummary, ContainerState } from '../../src/data/containers-client';
import type { DaemonEvent } from '../../src/data/live-channel';
import type { SystemOverview } from '../../src/data/system-client';

// The Dashboard composes the operator's reading of the host out of two live
// sources it does not own (dashboard-screen.md): the server-side overview and
// the shell's container list. The overview hook and the application-wide event
// stream are mocked; the cross-navigation service is the real one, since where
// a tile leads is part of the contract under test (REQ-18).
const refreshOverview = vi.fn();
const refreshContainers = vi.fn();
let overviewState: { overview?: SystemOverview; loaded: boolean; error?: string } = { loaded: true };
let daemonEvents: DaemonEvent[] = [];

vi.mock('../../src/data/use-system-overview', () => ({
  useSystemOverview: () => ({ ...overviewState, refresh: refreshOverview }),
}));
vi.mock('../../src/shell/services/EventStreamService', () => ({
  useDaemonEventStream: () => ({ events: daemonEvents }),
}));

const { DashboardScreen } = await import('../../src/dashboard/DashboardScreen');
const { CrossNavigationProvider, useCrossNavigation } = await import('../../src/shell/services/CrossNavigationService');

/** An em dash: the reading a tile shows while it has no figure yet. */
const NO_READING = '—';
/** An en dash: the reading a table cell shows for a value the daemon does not provide. */
const NO_VALUE = '–';

const SIZE = /^\d+(\.\d+)?(B|KB|MB|GB|TB)$/;

function overviewWith(overrides: Partial<SystemOverview> = {}): SystemOverview {
  return {
    containers: { total: 5, running: 2, paused: 1, stopped: 2 },
    images: { count: 12, sizeBytes: 3_145_728 },
    volumes: { count: 4, sizeBytes: 1_048_576 },
    stacks: { compose: 2, total: 2 },
    buildCache: { sizeBytes: 524_288, activeBuilder: 'multiarch' },
    diskUsage: {
      categories: [
        { id: 'images', sizeBytes: 3_145_728, itemCount: 12 },
        { id: 'containers', sizeBytes: 1_048_576, itemCount: 5 },
        { id: 'volumes', sizeBytes: 1_048_576, itemCount: 4 },
        { id: 'build-cache', sizeBytes: 524_288, itemCount: 7 },
      ],
      totalBytes: 5_767_168,
    },
    ...overrides,
  };
}

function container(name: string, state: ContainerState, overrides: Partial<ContainerSummary> = {}): ContainerSummary {
  return {
    id: `id-${name}`,
    shortId: `id-${name}`.slice(0, 12),
    name,
    image: 'alpine:3.20',
    state,
    status: state === 'running' ? 'Up 3 days' : 'Exited (0) 2 hours ago',
    ports: [],
    ...overrides,
  };
}

/** Harness: makes the pending cross-navigation request observable beside the screen. */
function NavigationProbe() {
  const { request } = useCrossNavigation();
  return <output data-testid="navigation">{request ? request.screenId : ''}</output>;
}

function renderScreen(
  props: { containers?: ContainerSummary[]; containersLoaded?: boolean; containersError?: string } = {},
) {
  render(
    <CrossNavigationProvider>
      <DashboardScreen
        containers={props.containers ?? []}
        containersLoaded={props.containersLoaded ?? true}
        containersError={props.containersError}
        onRefreshContainers={refreshContainers}
      />
      <NavigationProbe />
    </CrossNavigationProvider>,
  );
}

function navigatedTo(): string {
  return screen.getByTestId('navigation').textContent ?? '';
}

/** The tiles, in the order they are drawn, as `{ label, value, subLabel }`. */
function tiles(): { label: string; value: string; subLabel: string }[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-metric-tile')).map((tile) => ({
    label: tile.querySelector('.ui-metric-tile__label')?.textContent ?? '',
    value: tile.querySelector('.ui-metric-tile__value')?.textContent ?? '',
    subLabel: tile.querySelector('.ui-metric-tile__sub-label')?.textContent ?? '',
  }));
}

function tile(label: string): { label: string; value: string; subLabel: string } {
  const found = tiles().find((candidate) => candidate.label === label);
  if (!found) throw new Error(`no tile labelled ${label} among ${tiles().map((candidate) => candidate.label).join(', ')}`);
  return found;
}

/** The disk-usage rows, in the order they are drawn, as `{ label, value }`. */
function usageRows(): { label: string; value: string }[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-usage-breakdown__row')).map((row) => ({
    label: row.querySelector('.ui-usage-breakdown__label')?.textContent ?? '',
    value: row.querySelector('.ui-usage-breakdown__value')?.textContent ?? '',
  }));
}

/** One disk-usage row's bar, which is the element exposing that category's share as a meter. */
function usageTrack(label: string): HTMLElement {
  const row = Array.from(document.querySelectorAll<HTMLElement>('.ui-usage-breakdown__row')).find(
    (candidate) => candidate.querySelector('.ui-usage-breakdown__label')?.textContent === label,
  );
  if (!row) throw new Error(`no disk-usage row labelled ${label}`);
  return within(row).getByRole('meter');
}

/** What that row draws on its track: a bar, a zero mark, or — where nothing was measured — nothing. */
function trackMark(label: string): HTMLElement | null {
  return usageTrack(label).firstElementChild as HTMLElement | null;
}

/** The legend's entries, in the order they are drawn. */
function legendLabels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-usage-breakdown__legend-item')).map(
    (entry) => entry.querySelector('.ui-usage-breakdown__legend-label')?.textContent ?? '',
  );
}

/**
 * A reading in which one category holds nothing and another could not be read
 * at all: the two states `plan-ui-coherence-optimisation/REQ-68` requires the
 * screen to keep apart.
 */
function mixedDiskUsage(): SystemOverview['diskUsage'] {
  return {
    categories: [
      { id: 'images', sizeBytes: 1_024, itemCount: 1 },
      { id: 'containers', sizeBytes: 512, itemCount: 2 },
      { id: 'volumes', sizeBytes: 0, itemCount: 0 },
      { id: 'build-cache', sizeBytes: 0, itemCount: 0, unavailableDetail: 'buildx is not installed' },
    ],
    totalBytes: 1_536,
  };
}

/** The container-activity rows, in the order they are drawn, as their four cells. */
function activityRows(): string[][] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-data-table__row')).map((row) =>
    Array.from(row.querySelectorAll<HTMLElement>('.ui-data-table__cell')).map((cell) => cell.textContent ?? ''),
  );
}

function panelDescription(title: string): string {
  const header = Array.from(document.querySelectorAll<HTMLElement>('.ui-section-header')).find(
    (candidate) => candidate.querySelector('.ui-section-header__title')?.textContent === title,
  );
  if (!header) throw new Error(`no panel titled ${title}`);
  return header.querySelector('.ui-section-header__description')?.textContent ?? '';
}

function banner(title: string): HTMLElement {
  const found = Array.from(document.querySelectorAll<HTMLElement>('.ui-error-banner')).find(
    (candidate) => candidate.querySelector('.ui-error-banner__title')?.textContent === title,
  );
  if (!found) throw new Error(`no error banner titled ${title}`);
  return found;
}

beforeEach(() => {
  refreshOverview.mockReset();
  refreshContainers.mockReset();
  overviewState = { overview: overviewWith(), loaded: true };
  daemonEvents = [];
});

afterEach(cleanup);

describe('DashboardScreen — the summary tiles (plan-docker_management_app/REQ-14)', () => {
  // dashboard-screen.md — "five tiles, in this order, each with a label, a value and a sub-label"
  it('shows the five tiles in order, each carrying the figure its label names', () => {
    renderScreen();

    expect(tiles().map((entry) => entry.label)).toEqual(['Running', 'Images', 'Volumes', 'Stacks', 'Build cache']);

    // "Running -> the number of running containers; sub-label "<n> stopped / paused", n being every
    // container that is neither running nor paused plus the paused ones."
    expect(tile('Running').value).toBe('2');
    expect(tile('Running').subLabel).toBe('3 stopped / paused');

    // "Images -> the number of images; sub-label "<size> on disk"."
    expect(tile('Images').value).toBe('12');
    expect(tile('Images').subLabel).toMatch(/^\d+(\.\d+)?(B|KB|MB|GB|TB) on disk$/);

    // "Volumes -> the number of volumes; sub-label "<size> on disk"."
    expect(tile('Volumes').value).toBe('4');
    expect(tile('Volumes').subLabel).toMatch(/^\d+(\.\d+)?(B|KB|MB|GB|TB) on disk$/);

    // "Stacks -> the compose projects; sub-label "<c> compose"."
    expect(tile('Stacks').value).toBe('2');
    expect(tile('Stacks').subLabel).toBe('2 compose');

    // "Build cache -> the build cache's size; sub-label "buildx: <active builder>"."
    expect(tile('Build cache').value).toMatch(SIZE);
    expect(tile('Build cache').subLabel).toBe('buildx: multiarch');
  });

  // dashboard-screen.md — "before the first reading settles every tile shows "—" over "reading…"."
  it('shows no reading on any tile before the first overview settles', () => {
    overviewState = { loaded: false };

    renderScreen();

    expect(tiles()).toHaveLength(5);
    for (const entry of tiles()) {
      expect(entry.value).toBe(NO_READING);
      expect(entry.subLabel).toBe('reading…');
    }
  });

  // dashboard-screen.md — "Stacks → the compose projects; sub-label `"<c> compose"`": the tile
  // states nothing about a cluster, on any host
  // (plan-docker_management_app-swarm_removal/REQ-6).
  it('names no cluster on the stacks tile, whatever the host is', () => {
    overviewState = { loaded: true, overview: overviewWith({ stacks: { compose: 0, total: 0 } }) };

    renderScreen();

    expect(tile('Stacks').value).toBe('0');
    expect(tile('Stacks').subLabel).toBe('0 compose');
  });

  // dashboard-screen.md — ""buildx: no active builder" when none is marked active"
  it('says no builder is active when the overview names none', () => {
    overviewState = { loaded: true, overview: overviewWith({ buildCache: { sizeBytes: 1_024 } }) };

    renderScreen();

    expect(tile('Build cache').subLabel).toBe('buildx: no active builder');
    expect(tile('Build cache').value).toMatch(SIZE);
  });

  // dashboard-screen.md — ""buildx unavailable" (with "—" for the value) when buildx could not be read"
  it('shows no size and says buildx is unavailable when it could not be read', () => {
    overviewState = {
      loaded: true,
      overview: overviewWith({ buildCache: { sizeBytes: 0, unavailableDetail: 'buildx is not installed' } }),
    };

    renderScreen();

    expect(tile('Build cache').value).toBe(NO_READING);
    expect(tile('Build cache').subLabel).toBe('buildx unavailable');
  });
});

describe('DashboardScreen — the container activity (plan-docker_management_app/REQ-15)', () => {
  // dashboard-screen.md — "one row per container, running first, then paused, restarting, created,
  // removing, exited, dead, and alphabetically by name within each state"
  it('lists the containers by state, running first, alphabetically within each state', () => {
    renderScreen({
      containers: [
        container('zeta', 'dead'),
        container('beta', 'running'),
        container('delta', 'restarting'),
        container('alpha', 'running'),
        container('gamma', 'paused'),
        container('epsilon', 'exited'),
      ],
    });

    expect(activityRows().map((cells) => cells[0])).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']);
  });

  // dashboard-screen.md — the same ordering across the states a stopped container can be in
  it('orders created before removing before exited', () => {
    renderScreen({
      containers: [container('c-exited', 'exited'), container('a-created', 'created'), container('b-removing', 'removing')],
    });

    expect(activityRows().map((cells) => cells[0])).toEqual(['a-created', 'b-removing', 'c-exited']);
  });

  // dashboard-screen.md — "the container's name, its state in words, its CPU as "<n>% cpu" and its
  // uptime" / "uptime -> the daemon's own uptime text with the leading "Up " dropped"
  it('shows the name, the state in words, the CPU reading and the daemon uptime text', () => {
    renderScreen({ containers: [container('web', 'running', { status: 'Up 3 days', cpuPercent: 12.4 })] });

    expect(activityRows()).toEqual([['web', 'running', '12% cpu', '3 days']]);
  });

  // dashboard-screen.md — "a container that is not running has none and shows "–"" / "a CPU reading
  // the daemon has not sampled shows "—", stated as an absent sample rather than drawn as a zero or
  // left blank" (plan-docker_management_app-containers_card_view/REQ-45, REQ-52)
  it('shows no uptime for a container that is not running and states the absent CPU sample', () => {
    renderScreen({ containers: [container('stopped-one', 'exited', { status: 'Exited (0) 2 hours ago' })] });

    expect(activityRows()).toEqual([['stopped-one', 'exited', NO_READING, NO_VALUE]]);
  });

  // The same absent reading for a running container the gate left unsampled: a withheld figure is
  // never drawn as a measured zero (plan-docker_management_app-containers_card_view/REQ-52)
  it('states an absent CPU sample for a running container the sampler has not read', () => {
    renderScreen({ containers: [container('running-unsampled', 'running', { status: 'Up 10 minutes' })] });

    expect(activityRows()).toEqual([['running-unsampled', 'running', NO_READING, '10 minutes']]);
  });

  // A measured zero keeps its number: "no measurement" and "measured zero" are never rendered alike
  // (plan-docker_management_app-containers_card_view/REQ-16, REQ-52)
  it('draws a measured zero as its number, told apart from an absent sample', () => {
    renderScreen({ containers: [container('idle-one', 'running', { status: 'Up 10 minutes', cpuPercent: 0 })] });

    expect(activityRows()).toEqual([['idle-one', 'running', '0% cpu', '10 minutes']]);
  });

  // dashboard-screen.md — "a status dot coloured by state (running green, paused/restarting amber,
  // dead red, the rest grey)"
  it('colours the status dot of each row by the container state', () => {
    renderScreen({
      containers: [
        container('a-run', 'running'),
        container('b-paused', 'paused'),
        container('c-restart', 'restarting'),
        container('d-created', 'created'),
        container('e-dead', 'dead'),
      ],
    });

    const tones = Array.from(document.querySelectorAll<HTMLElement>('.ui-table-status-dot')).map((dot) =>
      Array.from(dot.classList).find((name) => name.startsWith('ui-table-status-dot--tone-')),
    );
    const [running, paused, restarting, created, dead] = tones;
    expect(running).toBe('ui-table-status-dot--tone-success');
    expect(paused).toBe('ui-table-status-dot--tone-warning');
    expect(restarting).toBe(paused);
    expect(dead).toBe('ui-table-status-dot--tone-danger');
    expect(created).toBe('ui-table-status-dot--tone-neutral');
  });

  // dashboard-screen.md — "no container on the daemon → "No container on this daemon"; before the
  // list settles, "Reading the containers…""
  it('says the daemon has no container, and says so only once the list has settled', () => {
    renderScreen({ containers: [], containersLoaded: false });
    expect(screen.getByText('Reading the containers…')).toBeInTheDocument();
    cleanup();

    renderScreen({ containers: [], containersLoaded: true });
    expect(screen.getByText('No container on this daemon')).toBeInTheDocument();
  });
});

describe('DashboardScreen — the disk usage (plan-docker_management_app/REQ-16)', () => {
  // dashboard-screen.md — "one row per category, in the order images, containers, volumes, build
  // cache, each with its absolute size and a bar as long as its share of the total; the panel's
  // description is the total"
  it('breaks the occupied space down by category, each with its size and its share of the total', () => {
    renderScreen();

    expect(usageRows().map((row) => row.label)).toEqual(['Images', 'Containers', 'Volumes', 'Build cache']);
    for (const row of usageRows()) {
      expect(row.value).toMatch(SIZE);
    }

    // 3145728 / 5767168 is 54.5%, 1048576 / 5767168 is 18.2%, 524288 / 5767168 is 9.1%.
    const shares = screen.getAllByRole('meter').map((meter) => Number(meter.getAttribute('aria-valuenow')));
    expect(shares).toEqual([55, 18, 18, 9]);
    // The panel's description is the whole the shares are drawn against: 5767168 bytes.
    expect(panelDescription('Disk usage')).toMatch(/5\.5MB/);
  });

  // dashboard-screen.md — "A category that could not be read reads "unavailable" in place of its size."
  it('says a category is unavailable in place of its size', () => {
    overviewState = { loaded: true, overview: overviewWith({ diskUsage: mixedDiskUsage() }) };

    renderScreen();

    expect(usageRows().find((row) => row.label === 'Build cache')?.value).toBe('unavailable');
  });

  // dashboard-screen.md — "a category holding nothing reads 0B and still draws a bar — the
  // zero-length one — so that it is told apart from a category that could not be read, which …
  // draws the unmeasured track instead of a bar" (plan-ui-coherence-optimisation/REQ-68)
  it('tells a category holding nothing apart from one that could not be read', () => {
    overviewState = { loaded: true, overview: overviewWith({ diskUsage: mixedDiskUsage() }) };

    renderScreen();

    // The category holding nothing: 0B, and a mark still drawn on its track.
    expect(usageRows().find((row) => row.label === 'Volumes')?.value).toBe('0B');
    expect(trackMark('Volumes'), 'the 0B category draws nothing on its track').not.toBeNull();

    // The category that could not be read: no mark at all, and a track of its own.
    expect(trackMark('Build cache'), 'the unreadable category draws a mark on its track').toBeNull();
    expect(usageTrack('Build cache').className).not.toBe(usageTrack('Volumes').className);

    // …and the caller's own word is what its meter announces (usage-breakdown.md).
    expect(usageTrack('Build cache')).toHaveAttribute('aria-valuetext', 'unavailable');
    expect(usageTrack('Build cache')).toHaveAttribute('aria-valuenow', '0');
    expect(usageTrack('Volumes')).not.toHaveAttribute('aria-valuetext');
  });

  // dashboard-screen.md — "a legend under the rows names what each of the chart's colours means"
  // (plan-ui-coherence-optimisation/REQ-67)
  it('names every colour of the chart in a legend, one entry per category', () => {
    renderScreen();

    expect(legendLabels()).toEqual(['Images', 'Containers', 'Volumes', 'Build cache']);
    expect(legendLabels()).toEqual(usageRows().map((row) => row.label));
  });
});

describe('DashboardScreen — the daemon events (plan-docker_management_app/REQ-17)', () => {
  // dashboard-screen.md — "the most recent daemon events, newest first, timestamped in local time"
  it('shows the most recent daemon events newest first, timestamped in local time', () => {
    const newest = '2026-08-09T10:30:00.000Z';
    daemonEvents = [
      { id: 'evt-2', timestamp: newest, type: 'container', action: 'start', actor: 'web' },
      { id: 'evt-1', timestamp: '2026-08-09T10:00:00.000Z', type: 'volume', action: 'create', actor: 'data' },
    ];

    renderScreen();

    const lines = Array.from(document.querySelectorAll<HTMLElement>('.ui-event-stream__line'));
    expect(lines.map((line) => line.querySelector('.ui-event-stream__summary')?.textContent)).toEqual(['web', 'data']);
    expect(within(lines[0]).getByText('container')).toBeInTheDocument();
    expect(within(lines[0]).getByText('start')).toBeInTheDocument();

    const shown = lines[0].querySelector('.ui-event-stream__timestamp')?.textContent ?? '';
    expect(shown).toMatch(/^\d{1,2}:\d{2}:\d{2}$/);
    // Local time, not the daemon's UTC wording: the hour is this machine's own reading of the instant.
    expect(Number(shown.split(':')[0])).toBe(new Date(newest).getHours());
  });

  // dashboard-screen.md — "with none yet, "No daemon events yet.""
  it('says no daemon event has arrived yet', () => {
    renderScreen();

    expect(screen.getByText('No daemon events yet.')).toBeInTheDocument();
  });
});

describe('DashboardScreen — where a tile or a row leads (plan-docker_management_app/REQ-18)', () => {
  // dashboard-screen.md, "Navigation" — each tile names the screen that owns what it counts
  it.each([
    ['Running containers — open the Containers screen', 'containers'],
    ['Images — open the Images & layers screen', 'images-layers'],
    ['Volumes — open the Volumes & networks screen', 'volumes-networks'],
    ['Stacks — open the Compose screen', 'compose'],
    ['Build cache — open the Builders & cache screen', 'builders-cache'],
  ])('activating the tile named %s navigates to its screen', async (name, screenId) => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name }));

    expect(navigatedTo()).toBe(screenId);
  });

  // dashboard-screen.md, "Navigation" — a disk-usage row leads to the screen owning that category
  it.each([
    ['Images', 'images-layers'],
    ['Containers', 'containers'],
    ['Volumes', 'volumes-networks'],
    ['Build cache', 'builders-cache'],
  ])('activating the %s disk-usage row navigates to its screen', async (label, screenId) => {
    const user = userEvent.setup();
    renderScreen();

    const row = Array.from(document.querySelectorAll<HTMLElement>('.ui-usage-breakdown__row')).find(
      (candidate) => candidate.querySelector('.ui-usage-breakdown__label')?.textContent === label,
    )!;
    await user.click(row);

    expect(navigatedTo()).toBe(screenId);
  });

  // dashboard-screen.md — "activating a container-activity row → navigates to the Containers screen"
  it('activating a container-activity row navigates to the Containers screen', async () => {
    const user = userEvent.setup();
    renderScreen({ containers: [container('web', 'running')] });

    await user.click(document.querySelector<HTMLElement>('.ui-data-table__row')!);

    expect(navigatedTo()).toBe('containers');
  });
});

describe('DashboardScreen — the readings that failed', () => {
  // dashboard-screen.md — "a failed overview reading, and a failed container reading, each show
  // their own error banner with the message verbatim and a retry"
  it('reports a failed overview reading verbatim and retries it on demand', async () => {
    const user = userEvent.setup();
    overviewState = { loaded: true, error: 'daemon unreachable: connection refused' };

    renderScreen();

    const failed = banner('Could not read the daemon overview');
    expect(within(failed).getByText('daemon unreachable: connection refused')).toBeInTheDocument();
    await user.click(within(failed).getByRole('button', { name: 'Retry' }));
    expect(refreshOverview).toHaveBeenCalledTimes(1);
  });

  it('reports a failed container reading verbatim and retries it on demand', async () => {
    const user = userEvent.setup();

    renderScreen({ containersError: 'the container listing failed' });

    const failed = banner('Could not read the container list');
    expect(within(failed).getByText('the container listing failed')).toBeInTheDocument();
    await user.click(within(failed).getByRole('button', { name: 'Retry' }));
    expect(refreshContainers).toHaveBeenCalledTimes(1);
  });
});
