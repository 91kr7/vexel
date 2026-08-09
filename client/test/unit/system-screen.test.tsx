import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiskUsageBreakdown, DiskUsageCategory, DiskUsageCategoryId, PruneRunResult } from '../../src/data/system-client';
import type { DaemonInfo } from '../../src/data/contexts-client';

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
const { ErrorReportingProvider, useErrorReporter } = await import('../../src/shell/services/ErrorReportingService');
const { ProgressProvider } = await import('../../src/shell/services/ProgressService');
const { ToastProvider } = await import('../../src/ui');

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

/** Test harness: makes the errors the screen reports to the application observable, apart from the screen's own content. */
function ReportedErrors() {
  const { errors } = useErrorReporter();
  return (
    <section aria-label="reported errors">
      {errors.map((error) => (
        <p key={error.id}>{`${error.title}${error.detail ? `: ${error.detail}` : ''}`}</p>
      ))}
    </section>
  );
}

function renderScreen() {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <SystemScreen />
            <ReportedErrors />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
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

    const reported = await within(screen.getByRole('region', { name: 'reported errors' })).findByText(/buildx is not installed/);
    expect(reported.textContent).toMatch(/build cache/i);
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
