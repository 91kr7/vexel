import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiskUsageBreakdown, DiskUsageCategory, DiskUsageCategoryId, PruneRunResult } from '../../src/data/system-client';
import type { DaemonInfo } from '../../src/data/contexts-client';
import { ReportingServices } from '../support/reporting-services';
import { forgetReportedFailures, reportedText } from '../support/error-reporting-mock';

// What a screen owes on a failure is the report itself; what becomes of it is the reporting
// service's own contract (app-shell/specs/error-reporting-service.md).
vi.mock('../../src/shell/services/ErrorReportingService', () => import('../support/error-reporting-mock'));

// The screen composes what the operator reads out of the server's facts and
// decides what can be pruned (system-screen.md): the breakdown hook and the
// daemon-information hook are mocked, while the confirmation, progress, error
// and toast services are the real ones — the confirmation is part of the
// contract under test (REQ-6, REQ-97).
const prune = vi.fn();
const refresh = vi.fn();
const daemonRefresh = vi.fn();
let diskUsageState: { breakdown?: DiskUsageBreakdown; loaded: boolean; error?: string } = { loaded: true };
let daemonState: { info?: DaemonInfo; loaded: boolean; error?: string } = { loaded: true };

vi.mock('../../src/data/use-disk-usage', () => ({
  useDiskUsage: () => ({ ...diskUsageState, refresh, prune }),
}));
vi.mock('../../src/data/use-daemon-info', () => ({
  useDaemonInfo: () => ({ ...daemonState, refresh: daemonRefresh }),
}));

const { SystemScreen } = await import('../../src/system/SystemScreen');
const { ConfirmationProvider } = await import('../../src/shell/services/ConfirmationService');
const { ProgressProvider } = await import('../../src/shell/services/ProgressService');

function category(id: DiskUsageCategoryId, overrides: Partial<DiskUsageCategory> = {}): DiskUsageCategory {
  return { id, sizeBytes: 0, itemCount: 0, items: [], ...overrides };
}

function breakdownOf(categories: DiskUsageCategory[]): DiskUsageBreakdown {
  return { categories, totalReclaimableBytes: categories.reduce((total, entry) => total + entry.sizeBytes, 0) };
}

/** Every category empty: the starting point each test overrides for the ones it is about. */
function emptyBreakdown(): DiskUsageBreakdown {
  return breakdownOf([
    category('stopped-containers'),
    category('dangling-images'),
    category('unused-volumes'),
    category('unused-networks'),
    category('build-cache'),
  ]);
}

function populatedBreakdown(): DiskUsageBreakdown {
  return breakdownOf([
    category('stopped-containers', { sizeBytes: 2_000, itemCount: 2, items: ['one', 'two'] }),
    category('dangling-images', { sizeBytes: 3_000, itemCount: 3, items: ['aaa', 'bbb', 'ccc'] }),
    category('unused-volumes', { sizeBytes: 4_000, itemCount: 4, items: ['v1', 'v2', 'v3', 'v4'] }),
    category('unused-networks', { sizeBytes: 0, itemCount: 5, items: ['n1'] }),
    category('build-cache', { sizeBytes: 6_000, itemCount: 6, items: ['rec-1'] }),
  ]);
}

/**
 * A daemon that answered every one of the eight properties the screen keeps
 * (system-screen.md, plan-ui-coherence-optimisation/REQ-75). Each test that is
 * about one of them overrides that one.
 */
function daemonInfo(overrides: Partial<DaemonInfo> = {}): DaemonInfo {
  return {
    version: '27.4.0',
    apiVersion: '1.47',
    buildkitVersion: '0.19.0',
    storageDriver: 'overlay2',
    cgroupDriver: 'systemd',
    cgroupVersion: '2',
    operatingSystem: 'Docker Desktop',
    osType: 'linux',
    kernelVersion: '6.10.14-linuxkit',
    architecture: 'aarch64',
    rootDirectory: '/var/lib/docker',
    containers: { total: 12, running: 5, paused: 0, stopped: 7 },
    ...overrides,
  };
}

/** The label → value bands the screen draws, in the order it draws them. */
function propertyBands(): { label: string; value: string }[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-definition-list__row')).map((band) => ({
    label: band.querySelector('.ui-definition-list__label')?.textContent ?? '',
    value: band.querySelector('.ui-definition-list__value')?.textContent ?? '',
  }));
}

function renderScreen() {
  render(
    <ReportingServices>
      <ProgressProvider>
        <ConfirmationProvider>
          <SystemScreen />
        </ConfirmationProvider>
      </ProgressProvider>
    </ReportingServices>,
  );
}

/** The row of a category, located by the title the screen gives it. */
function row(title: string): HTMLElement {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.ui-storage-usage-row'));
  const found = rows.find((candidate) => candidate.textContent?.startsWith(title));
  if (!found) throw new Error(`no row titled ${title} among ${rows.map((candidate) => candidate.textContent).join(' | ')}`);
  return found;
}

function dialog(): HTMLElement {
  return document.querySelector<HTMLElement>('.ui-modal')!;
}

beforeEach(() => {
  forgetReportedFailures();
  prune.mockReset();
  refresh.mockReset();
  daemonRefresh.mockReset();
  diskUsageState = { breakdown: populatedBreakdown(), loaded: true };
  daemonState = { loaded: true, info: undefined };
});

afterEach(cleanup);

describe('SystemScreen — the breakdown it shows (plan-docker_management_app/REQ-95)', () => {
  // system-screen.md — one row per category, with the titles the spec fixes
  it('shows one row per category, in the order the breakdown states them', () => {
    renderScreen();

    const titles = Array.from(document.querySelectorAll<HTMLElement>('.ui-storage-usage-row')).map(
      (candidate) => candidate.querySelector('.ui-storage-usage-row__label')?.textContent,
    );
    expect(titles).toEqual(['Stopped containers', 'Dangling images', 'Unused volumes', 'Unused networks', 'Build cache']);
  });

  // system-screen.md — the "what it holds" line of each populated category
  it('says what each populated category holds', () => {
    renderScreen();

    expect(within(row('Stopped containers')).getByText('2 containers not running')).toBeInTheDocument();
    expect(within(row('Dangling images')).getByText('3 images untagged and unreferenced')).toBeInTheDocument();
    expect(within(row('Unused volumes')).getByText('4 volumes unattached')).toBeInTheDocument();
    expect(within(row('Unused networks')).getByText('5 networks with no attached endpoint')).toBeInTheDocument();
    expect(within(row('Build cache')).getByText('6 records of BuildKit cache from past builds')).toBeInTheDocument();
  });

  // system-screen.md — the "what it holds" line of each empty category
  it('says so when a category holds nothing', () => {
    diskUsageState = { breakdown: emptyBreakdown(), loaded: true };
    renderScreen();

    expect(within(row('Stopped containers')).getByText('No container is stopped')).toBeInTheDocument();
    expect(within(row('Dangling images')).getByText('No untagged, unreferenced image')).toBeInTheDocument();
    expect(within(row('Unused volumes')).getByText('Every volume is attached to a container')).toBeInTheDocument();
    expect(within(row('Unused networks')).getByText('Every network has an attached container')).toBeInTheDocument();
    expect(within(row('Build cache')).getByText('No reclaimable BuildKit record')).toBeInTheDocument();
  });

  // system-screen.md — "unused-volumes -> '<name> is unattached' (exactly one)"
  it('names the volume itself when exactly one is unattached', () => {
    diskUsageState = {
      breakdown: breakdownOf([category('unused-volumes', { sizeBytes: 10, itemCount: 1, items: ['pgdata'] })]),
      loaded: true,
    };
    renderScreen();

    expect(within(row('Unused volumes')).getByText('pgdata is unattached')).toBeInTheDocument();
  });

  // system-screen.md — "a category that could not be read -> the reason, in place of the line, and a
  // size of '—'", and its action is disabled
  it('puts the reason in place of the line and a dash in place of the size of a category it could not read', () => {
    diskUsageState = {
      breakdown: breakdownOf([category('build-cache', { unavailableDetail: 'buildx is not installed' })]),
      loaded: true,
    };
    renderScreen();

    const buildCache = row('Build cache');
    expect(within(buildCache).getByText('buildx is not installed')).toBeInTheDocument();
    expect(buildCache.querySelector('.ui-storage-usage-row__size')?.textContent).toBe('—');
    expect(within(buildCache).getByRole('button', { name: 'Prune' })).toBeDisabled();
  });

  // system-screen.md — "The row's action is disabled while the category is empty"
  it('disables the action of an empty category and leaves it enabled on a populated one', () => {
    diskUsageState = {
      breakdown: breakdownOf([
        category('stopped-containers', { sizeBytes: 2_000, itemCount: 2, items: ['one', 'two'] }),
        category('dangling-images'),
      ]),
      loaded: true,
    };
    renderScreen();

    expect(within(row('Stopped containers')).getByRole('button', { name: 'Prune' })).toBeEnabled();
    expect(within(row('Dangling images')).getByRole('button', { name: 'Prune' })).toBeDisabled();
  });

  // system-screen.md — "'System prune…' is disabled while there is nothing prunable at all"
  it('disables the system prune while nothing at all is prunable', () => {
    diskUsageState = { breakdown: emptyBreakdown(), loaded: true };
    renderScreen();

    expect(screen.getByRole('button', { name: 'System prune…' })).toBeDisabled();
  });

  // system-screen.md — "When the reading fails: the failure with a retry; the rest of the screen
  // stays usable."
  it('reports a failed reading with a retry', async () => {
    const user = userEvent.setup();
    diskUsageState = { loaded: true, error: 'daemon unreachable' };
    renderScreen();

    expect(screen.getByText('daemon unreachable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(refresh).toHaveBeenCalled();
  });

  // system-screen.md — "A standing warning under the rows: destructive actions are always confirmed
  // and marked in red, and other tools sharing this daemon are affected (REQ-97)."
  it('states on the screen itself that other tools sharing the daemon are affected', () => {
    renderScreen();

    expect(document.body.textContent).toMatch(/other tools sharing this daemon are affected/i);
  });
});

describe('SystemScreen — pruning one category (REQ-96, REQ-97)', () => {
  // system-screen.md — the confirmation names the category, what it holds and its size, states the
  // irreversibility and that the daemon is shared (REQ-97)
  it('confirms first, naming the category and warning that the daemon is shared', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(row('Stopped containers')).getByRole('button', { name: 'Prune' }));

    const text = dialog().textContent ?? '';
    expect(text).toContain('Stopped containers');
    expect(text).toContain('2 containers not running');
    expect(text).toMatch(/cannot be brought back/i);
    expect(text).toMatch(/shared/i);
    expect(prune).not.toHaveBeenCalled();
  });

  // system-screen.md — "No prune ever runs without passing through the application's confirmation
  // service first (REQ-6)": cancelling prunes nothing
  it('prunes nothing when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(row('Stopped containers')).getByRole('button', { name: 'Prune' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    expect(prune).not.toHaveBeenCalled();
  });

  // system-screen.md — "Once confirmed, that one category is pruned" / "the summary and a toast
  // report the space actually reclaimed"
  it('prunes exactly that category once confirmed and reports the space the run reclaimed', async () => {
    const user = userEvent.setup();
    prune.mockResolvedValue({
      categories: [{ categoryId: 'stopped-containers', removed: ['one', 'two'], removedCount: 2, reclaimedBytes: 512 }],
      reclaimedBytes: 512,
    } satisfies PruneRunResult);
    renderScreen();

    await user.click(within(row('Stopped containers')).getByRole('button', { name: 'Prune' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Prune' }));

    await waitFor(() => expect(prune).toHaveBeenCalledWith(['stopped-containers']));
    const summary = await waitFor(() => document.querySelector<HTMLElement>('.ui-result-summary')!);
    // The figure reported is the run's own (512), never the estimate the breakdown showed (2000).
    expect(summary.textContent).toMatch(/512/);
    expect(summary.textContent).not.toMatch(/2000|2,000/);
    expect(document.querySelector('.ui-toast-viewport')?.textContent ?? document.body.textContent).toMatch(/512/);
  });

  // system-screen.md — "A category that failed inside a run is reported as an application error
  // naming it, alongside the summary of what the rest of the run did."
  it('reports a category that failed inside the run beside the summary of the rest', async () => {
    const user = userEvent.setup();
    prune.mockResolvedValue({
      categories: [
        { categoryId: 'stopped-containers', removed: ['one'], removedCount: 1, reclaimedBytes: 128 },
        { categoryId: 'build-cache', removed: [], removedCount: 0, reclaimedBytes: 0, error: 'buildx is not installed' },
      ],
      reclaimedBytes: 128,
    } satisfies PruneRunResult);
    renderScreen();

    await user.click(within(row('Stopped containers')).getByRole('button', { name: 'Prune' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Prune' }));

    await waitFor(() => expect(reportedText()).toMatch(/buildx is not installed/));
    expect(reportedText()).toMatch(/build cache/i);
    const summary = document.querySelector<HTMLElement>('.ui-result-summary')!;
    expect(summary.textContent).toMatch(/128/);
    expect(summary.textContent).toMatch(/Build cache/);
  });

  // system-screen.md — "It stays until the next prune replaces it."
  it("keeps the last prune's summary until the next prune replaces it", async () => {
    const user = userEvent.setup();
    prune.mockResolvedValueOnce({
      categories: [{ categoryId: 'stopped-containers', removed: ['one'], removedCount: 1, reclaimedBytes: 128 }],
      reclaimedBytes: 128,
    } satisfies PruneRunResult);
    renderScreen();

    await user.click(within(row('Stopped containers')).getByRole('button', { name: 'Prune' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Prune' }));
    await waitFor(() => expect(document.querySelector('.ui-result-summary')?.textContent).toMatch(/128/));

    prune.mockResolvedValueOnce({
      categories: [{ categoryId: 'unused-volumes', removed: ['v1'], removedCount: 1, reclaimedBytes: 999 }],
      reclaimedBytes: 999,
    } satisfies PruneRunResult);
    await user.click(within(row('Unused volumes')).getByRole('button', { name: 'Prune' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Prune' }));

    await waitFor(() => expect(document.querySelector('.ui-result-summary')?.textContent).toMatch(/999/));
    expect(document.querySelector('.ui-result-summary')?.textContent).not.toMatch(/128/);
  });
});

describe('SystemScreen — the scoped system prune (REQ-96, REQ-97)', () => {
  // system-screen.md — "confirms with the scope: one checkbox per category, each with what it holds
  // and its size, every non-empty category pre-selected and a category that could not be read not
  // selectable. The same shared-daemon statement is made."
  it('offers a checkbox per category, pre-selecting the non-empty ones and refusing the unreadable one', async () => {
    const user = userEvent.setup();
    diskUsageState = {
      breakdown: breakdownOf([
        category('stopped-containers', { sizeBytes: 2_000, itemCount: 2, items: ['one', 'two'] }),
        category('dangling-images'),
        category('build-cache', { unavailableDetail: 'buildx is not installed' }),
      ]),
      loaded: true,
    };
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'System prune…' }));

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: 'Stopped containers' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Dangling images' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Build cache' })).toBeDisabled();
    expect(dialog().textContent).toMatch(/shared/i);
    expect(within(dialog()).getByText('2 containers not running')).toBeInTheDocument();
  });

  // system-screen.md — "Confirming prunes exactly the selected categories in one run"
  it('prunes exactly the selected categories in one run', async () => {
    const user = userEvent.setup();
    prune.mockResolvedValue({ categories: [], reclaimedBytes: 0 } satisfies PruneRunResult);
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'System prune…' }));
    await user.click(screen.getByRole('checkbox', { name: 'Dangling images' }));
    await user.click(screen.getByRole('checkbox', { name: 'Build cache' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Prune selected' }));

    await waitFor(() => expect(prune).toHaveBeenCalledTimes(1));
    expect(prune).toHaveBeenCalledWith(['stopped-containers', 'unused-volumes', 'unused-networks']);
  });

  // system-screen.md — "cancelling, or confirming with nothing selected, prunes nothing"
  it('prunes nothing when the scope confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'System prune…' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    expect(prune).not.toHaveBeenCalled();
  });

  // system-screen.md — "or confirming with nothing selected, prunes nothing"
  it('cannot be confirmed once every category has been unselected', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'System prune…' }));
    for (const title of ['Stopped containers', 'Dangling images', 'Unused volumes', 'Unused networks', 'Build cache']) {
      await user.click(screen.getByRole('checkbox', { name: title }));
    }

    expect(within(dialog()).getByRole('button', { name: 'Prune selected' })).toBeDisabled();
    expect(prune).not.toHaveBeenCalled();
  });
});

describe('SystemScreen — the daemon properties this screen keeps (plan-ui-coherence-optimisation/REQ-45, REQ-75)', () => {
  // system-screen.md — "the eight properties this screen keeps … in the product's property grid:
  // label → value bands". The labels are the delivered ones and are not this screen's to revise
  // (REQ-75), so they are pinned here, in the order the spec lists them.
  it('states the eight properties as label → value bands, in the words and the order the spec fixes', () => {
    daemonState = { loaded: true, info: daemonInfo() };
    renderScreen();

    expect(document.querySelectorAll('.ui-definition-list')).toHaveLength(1);
    expect(propertyBands().map((band) => band.label)).toEqual([
      'Docker version',
      'Engine API',
      'BuildKit',
      'Storage driver',
      'Cgroup driver',
      'OS / Arch',
      'Root directory',
      'Containers (running)',
    ]);
  });

  // system-screen.md — each band states the daemon's own answer: the version, the API version, the
  // storage driver, the cgroup driver **with its version**, OS / kernel / architecture, the root
  // directory and the container count **with how many are running**.
  it('states the daemon’s own answer in each band', () => {
    daemonState = { loaded: true, info: daemonInfo() };
    renderScreen();

    const bands = new Map(propertyBands().map((band) => [band.label, band.value]));
    expect(bands.get('Docker version')).toBe('27.4.0');
    expect(bands.get('Engine API')).toBe('1.47');
    expect(bands.get('BuildKit')).toBe('0.19.0');
    expect(bands.get('Storage driver')).toBe('overlay2');
    expect(bands.get('Cgroup driver')).toMatch(/systemd/);
    expect(bands.get('Cgroup driver')).toMatch(/2/);
    for (const fact of ['linux', '6.10.14-linuxkit', 'aarch64']) expect(bands.get('OS / Arch')).toContain(fact);
    expect(bands.get('Root directory')).toBe('/var/lib/docker');
    expect(bands.get('Containers (running)')).toMatch(/12/);
    expect(bands.get('Containers (running)')).toMatch(/5/);
  });

  // system-screen.md — "BuildKit version (or 'not reported')": never a blank band.
  it('says the BuildKit version is not reported rather than drawing a blank band', () => {
    daemonState = { loaded: true, info: daemonInfo({ buildkitVersion: undefined }) };
    renderScreen();

    expect(new Map(propertyBands().map((band) => [band.label, band.value])).get('BuildKit')).toBe('not reported');
  });

  // system-screen.md — "While it is being read: a placeholder". A reading in flight is not a result
  // the operator can resolve, so the placeholder offers nothing to click.
  it('draws a placeholder while the daemon is being read, with nothing to act on', () => {
    daemonState = { loaded: false, info: undefined };
    renderScreen();

    const placeholder = document.querySelector<HTMLElement>('.ui-empty-state')!;
    expect(placeholder).toBeInTheDocument();
    expect(placeholder.querySelector('.ui-definition-list')).toBeNull();
    expect(within(placeholder).queryByRole('button')).toBeNull();
    expect(daemonRefresh).not.toHaveBeenCalled();
  });

  // system-screen.md — "when the daemon answered but stated none of them: that, with a way to read
  // it again", and "'Read again' … asks the daemon for that reading once more; nothing on the daemon
  // is touched".
  it('states an answer holding none of the properties, explains it, and reads the daemon again on request', async () => {
    const user = userEvent.setup();
    daemonState = { loaded: true, info: undefined };
    renderScreen();

    const empty = document.querySelector<HTMLElement>('.ui-empty-state')!;
    expect(empty.querySelector('.ui-empty-state__title')?.textContent ?? '').not.toBe('');
    expect((empty.querySelector('.ui-empty-state__description')?.textContent ?? '').length).toBeGreaterThan(20);

    await user.click(within(empty).getByRole('button', { name: 'Read again' }));

    expect(daemonRefresh).toHaveBeenCalledTimes(1);
    expect(prune).not.toHaveBeenCalled();
  });
});

describe('SystemScreen — the empty and in-flight readings of the breakdown (plan-ui-coherence-optimisation/REQ-75)', () => {
  // system-screen.md — "When it succeeds and reports no category at all: that, with a way to read it
  // again."
  it('states a reading that reported no category, explains it, and reads it again on request', async () => {
    const user = userEvent.setup();
    diskUsageState = { breakdown: breakdownOf([]), loaded: true };
    daemonState = { loaded: true, info: daemonInfo() };
    renderScreen();

    const empty = document.querySelector<HTMLElement>('.ui-empty-state')!;
    expect(empty).toBeInTheDocument();
    expect((empty.querySelector('.ui-empty-state__description')?.textContent ?? '').length).toBeGreaterThan(20);

    await user.click(within(empty).getByRole('button', { name: 'Read again' }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(prune).not.toHaveBeenCalled();
  });

  // system-screen.md — the reading in flight is a placeholder, and a placeholder is not an empty
  // result the operator can resolve.
  it('draws a placeholder while the breakdown is being read, with nothing to act on', () => {
    diskUsageState = { loaded: false };
    daemonState = { loaded: true, info: daemonInfo() };
    renderScreen();

    const placeholder = document.querySelector<HTMLElement>('.ui-empty-state')!;
    expect(placeholder).toBeInTheDocument();
    expect(within(placeholder).queryByRole('button')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('SystemScreen — where the actions and the standing warning live (REQ-73, REQ-74, REQ-75)', () => {
  // system-screen.md — "'System prune…' (red, in the action bar under the panel's header)": the
  // screen's own action is a control of the action bar, not of the section header above it.
  it('carries the system prune in the action bar under the header, in the destructive variant', () => {
    renderScreen();

    const action = screen.getByRole('button', { name: 'System prune…' });
    expect(action.closest('.ui-screen-toolbar')).not.toBeNull();
    expect(action.closest('.ui-section-header')).toBeNull();
    expect(action.className).toContain('ui-button--destructive');
  });

  // REQ-73 — "their destructive actions are correctly red-tinted": every prune row's action keeps
  // the destructive variant, whatever else the presentation does.
  it('keeps every row’s Prune action in the destructive variant', () => {
    renderScreen();

    const actions = Array.from(document.querySelectorAll<HTMLElement>('.ui-storage-usage-row')).map((candidate) =>
      within(candidate).getByRole('button', { name: 'Prune' }),
    );
    expect(actions).toHaveLength(5);
    for (const action of actions) expect(action.className).toContain('ui-button--destructive');
  });

  // REQ-74 — the standing warning "is not restyled, not replaced by the empty-state primitive and
  // not absorbed into the section header": it is the callout, and it is still the callout.
  it('states the standing warning in the callout, neither absorbed into a header nor turned into an empty result', () => {
    renderScreen();

    const callout = document.querySelector<HTMLElement>('.ui-callout');
    expect(callout).not.toBeNull();
    expect(callout!.textContent).toMatch(/other tools sharing this daemon are affected/i);
    expect(callout!.textContent).toMatch(/confirmed and marked in red/i);
    expect(callout!.closest('.ui-section-header')).toBeNull();
    expect(callout!.closest('.ui-empty-state')).toBeNull();
    for (const empty of Array.from(document.querySelectorAll<HTMLElement>('.ui-empty-state'))) {
      expect(empty.textContent).not.toMatch(/other tools sharing this daemon are affected/i);
    }
  });
});
