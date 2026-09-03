import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LOAD_ATTENTION_PERCENT } from '../../src/ui';
import { ContainerProcessesView } from '../../src/containers/ContainerProcessesView';
import type { ContainerSummary } from '../../src/data/containers-client';
import type { ContainerProcessList } from '../../src/data/container-stats-client';

const container: ContainerSummary = {
  id: 'container-1',
  shortId: 'container1',
  name: 'web-nginx',
  image: 'nginx:1.27',
  state: 'running',
  status: 'Up 3 days',
  ports: [],
};

const threeProcesses: ContainerProcessList = {
  titles: ['PID', 'USER', 'CMD'],
  processes: [
    { pid: 1, user: 'root', command: 'postgres -c shared_buffers=1MB' },
    { pid: 42, user: 'postgres', command: 'postgres: checkpointer' },
    { pid: 77, user: 'postgres', command: 'postgres: walwriter' },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;
let nextResult: { ok: boolean; status: number; body: unknown };
/** Holds the read in flight so the "refreshing" state is observable. */
let pending: Array<() => void>;
let holdResponses: boolean;

/**
 * The period container-processes-view.md declares, in the unscaled form a unit
 * run uses: the timing scale is left at 1 here, so `cadence(3000)` is 3 000 ms.
 */
const DECLARED_PERIOD_MS = 3_000;

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function releasePending() {
  const waiting = pending;
  pending = [];
  waiting.forEach((deliver) => deliver());
}

beforeEach(() => {
  nextResult = { ok: true, status: 200, body: threeProcesses };
  pending = [];
  holdResponses = false;
  fetchMock = vi.fn(
    () =>
      new Promise((resolve) => {
        const deliver = () => resolve({ ok: nextResult.ok, status: nextResult.status, json: () => Promise.resolve(nextResult.body) });
        if (holdResponses) pending.push(deliver);
        else deliver();
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ContainerProcessesView (REQ-33)', () => {
  // plan-docker_management_app/REQ-33 — the processes are listed with pid, user and command
  it('lists one row per process with its pid, user and command', async () => {
    render(<ContainerProcessesView container={container} />);

    expect(await screen.findByText('postgres -c shared_buffers=1MB')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('postgres: checkpointer')).toBeInTheDocument();
    expect(screen.getAllByText('postgres').length).toBeGreaterThan(0);
    expect(screen.getByText('root')).toBeInTheDocument();
    for (const heading of ['PID', 'User', 'Command']) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
  });

  // data-table.md — the command column used to declare `minmax(240px, 3fr)` itself, which the
  // closed `DataTableColumnWidth` no longer admits; stated as a flexible width with a floor, "the
  // component writes the `minmax()` itself". The claim is that the track is the same one, so it is
  // compared against the string this view declared before the rewrite
  // (`ContainerProcessesView.tsx` at 6b90bcb^), header and row alike.
  it('lays its columns out on the track it declared before the minmax was rewritten', async () => {
    const { container: dom } = render(<ContainerProcessesView container={container} />);
    await screen.findByText('postgres: walwriter');

    const delivered = '80px 140px minmax(240px, 3fr) 90px 90px';
    const row = dom.querySelector<HTMLElement>('.ui-data-table__row');
    const header = dom.querySelector<HTMLElement>('.ui-data-table__header');

    expect(row?.style.gridTemplateColumns, 'the command column no longer resolves to the track it was delivered with').toBe(delivered);
    expect(header?.style.gridTemplateColumns, 'the header is laid out on a different track from the rows').toBe(delivered);
  });

  // container-processes-view.md — the number of processes is reported once a listing was read
  it('reports how many processes are running', async () => {
    const { container: dom } = render(<ContainerProcessesView container={container} />);

    await screen.findByText('postgres: walwriter');
    expect(dom.textContent).toMatch(/3\s*process/i);
  });

  // container-processes-view.md — %CPU and %MEM are shown when reported, and '–' when the daemon does not report them
  it('shows the %CPU and %MEM readings, and a dash where the daemon reports none', async () => {
    nextResult = {
      ok: true,
      status: 200,
      body: {
        titles: ['PID', 'USER', '%CPU', 'CMD'],
        processes: [
          { pid: 1, user: 'root', command: 'with-readings', cpuPercent: 3.5, memoryPercent: 0.4 },
          { pid: 2, user: 'root', command: 'without-readings' },
        ],
      } satisfies ContainerProcessList,
    };
    const { container: dom } = render(<ContainerProcessesView container={container} />);

    await screen.findByText('with-readings');
    expect(dom.textContent).toContain('3.5');
    expect(dom.textContent).toContain('0.4');
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(2);
  });

  /*
    tabs_composition_refactor/REQ-33 — "a `%CPU` value above a threshold is distinguished from the
    others in its column, so the consuming process is found without reading every row".

    The threshold is named, never restated: overruling the figure must move these fixtures with it
    rather than leaving a check that passes on the old boundary. The distinction itself is a
    treatment, and jsdom loads no stylesheet, so it is read as the class the cell takes on top of the
    one the rest of its column takes — what that class then draws is `table-cells.test.tsx`'s.
  */
  describe('the %CPU column (tabs_composition_refactor/REQ-33)', () => {
    const readings: ContainerProcessList = {
      titles: ['PID', 'USER', '%CPU', '%MEM', 'CMD'],
      // Every value distinct, so a cell is found by what it reads and no assertion lands on the
      // wrong row's.
      processes: [
        { pid: 1, user: 'first', command: 'at-the-threshold', cpuPercent: LOAD_ATTENTION_PERCENT, memoryPercent: 0.1 },
        { pid: 2, user: 'second', command: 'above-the-threshold', cpuPercent: LOAD_ATTENTION_PERCENT + 12.5, memoryPercent: 0.2 },
        { pid: 3, user: 'third', command: 'below-the-threshold', cpuPercent: LOAD_ATTENTION_PERCENT - 0.5, memoryPercent: 0.3 },
        { pid: 4, user: 'fourth', command: 'no-reading-at-all', memoryPercent: LOAD_ATTENTION_PERCENT + 18.25 },
      ],
    };

    /** The cell drawn for one value, wherever in the table it sits. */
    function cell(dom: HTMLElement, text: string): HTMLElement {
      const found = [...dom.querySelectorAll<HTMLElement>('.ui-data-table__cell span')].filter((node) => node.textContent === text);
      expect(found.length, `the table draws ${found.length} cells reading "${text}"`).toBe(1);
      return found[0]!;
    }

    function classesOf(node: HTMLElement): string[] {
      return node.className.split(' ').filter((name) => name !== '');
    }

    async function renderReadings() {
      nextResult = { ok: true, status: 200, body: readings };
      const { container: dom } = render(<ContainerProcessesView container={container} />);
      await screen.findByText('below-the-threshold');
      return dom;
    }

    it('draws a reading at or above the threshold distinguished from one below it', async () => {
      const dom = await renderReadings();

      const below = classesOf(cell(dom, `${LOAD_ATTENTION_PERCENT - 0.5}%`));
      for (const value of [LOAD_ATTENTION_PERCENT, LOAD_ATTENTION_PERCENT + 12.5]) {
        expect(
          classesOf(cell(dom, `${value}%`)),
          `${value}% is drawn exactly as ${LOAD_ATTENTION_PERCENT - 0.5}% is, so the consuming process is found only by reading every row`,
        ).not.toEqual(below);
      }
    });

    it('leaves the readings below the threshold, and the dash, exactly as they were', async () => {
      const dom = await renderReadings();

      const plain = classesOf(cell(dom, '0.3%'));
      expect(classesOf(cell(dom, `${LOAD_ATTENTION_PERCENT - 0.5}%`)), 'a reading below the threshold is distinguished too').toEqual(plain);
      expect(classesOf(cell(dom, '–')), 'the dash is toned, and there is no reading there to distinguish').toEqual(plain);
    });

    it('tones that column and no other', async () => {
      const dom = await renderReadings();

      // The fourth process reports no %CPU at all and a %MEM well above the threshold: the tone
      // belongs to the %CPU column, not to a load reading wherever it appears in the row.
      const plain = classesOf(cell(dom, '0.3%'));
      expect(classesOf(cell(dom, `${LOAD_ATTENTION_PERCENT + 18.25}%`)), 'the %MEM column is toned as well').toEqual(plain);
      for (const text of ['no-reading-at-all', 'fourth', '4']) {
        expect(classesOf(cell(dom, text)), `the ${text} cell is toned, and the tone belongs to the %CPU column`).toEqual(plain);
      }
    });
  });

  // container-processes-view.md — a placeholder stands in until the first read completes
  it('says the process list is being read until the first read completes', async () => {
    holdResponses = true;
    render(<ContainerProcessesView container={container} />);

    expect(screen.getByText(/Reading the process list/i)).toBeInTheDocument();

    await act(async () => releasePending());
    expect(screen.queryByText(/Reading the process list/i)).not.toBeInTheDocument();
  });

  // container-processes-view.md — an empty listing is reported as such
  it('says no process is running when the listing came back empty', async () => {
    nextResult = { ok: true, status: 200, body: { titles: ['PID', 'USER', 'CMD'], processes: [] } };
    render(<ContainerProcessesView container={container} />);

    expect(await screen.findByText(/No process is running in this container/i)).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-33 — the listing is refreshed on demand
  it('re-reads the listing when Refresh is used', async () => {
    const user = userEvent.setup();
    render(<ContainerProcessesView container={container} />);
    await screen.findByText('postgres: walwriter');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    nextResult = { ok: true, status: 200, body: { titles: ['PID', 'USER', 'CMD'], processes: [{ pid: 9, user: 'root', command: 'sleep 42' }] } };
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('sleep 42')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // container-processes-view.md — the refresh action is disabled and labelled "Refreshing…" while a read is in flight
  it('disables the refresh action and labels it Refreshing… while a read is in flight', async () => {
    const user = userEvent.setup();
    render(<ContainerProcessesView container={container} />);
    await screen.findByText('postgres: walwriter');

    holdResponses = true;
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    const refreshing = await screen.findByRole('button', { name: 'Refreshing…' });
    expect(refreshing).toBeDisabled();

    await act(async () => releasePending());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  });

  // container-processes-view.md — "The listing is read when the view opens and again every 3 000 ms
  // while it is on screen … This replaces the earlier rule that the listing never polls"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27, REQ-28)
  it('follows what runs inside the container on its own, at the declared period', async () => {
    vi.useFakeTimers();
    render(<ContainerProcessesView container={container} />);
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(DECLARED_PERIOD_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    nextResult = {
      ok: true,
      status: 200,
      body: { titles: ['PID', 'USER', 'CMD'], processes: [{ pid: 9, user: 'root', command: 'sleep 42' }] },
    };
    await advance(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('sleep 42')).toBeInTheDocument();
  });

  // container-processes-view.md — "A container that is not running is asked for nothing at all …
  // no read is taken and the tab states that no process is running"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27). The daemon's own
  // running set is `running`, `paused`, `restarting`.
  it.each(['exited', 'created', 'dead'] as const)('asks for nothing at all while the container is %s', async (state) => {
    vi.useFakeTimers();
    render(<ContainerProcessesView container={{ ...container, state }} />);
    await advance(0);

    expect(screen.getByText(/No process is running in this container/i)).toBeInTheDocument();

    await advance(DECLARED_PERIOD_MS * 10);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // container-processes-view.md — "a paused container's processes exist, frozen, and the daemon
  // lists them", so the running set the clock follows is the statistics stream's own
  it.each(['running', 'paused', 'restarting'] as const)('follows a container that is %s', async (state) => {
    vi.useFakeTimers();
    render(<ContainerProcessesView container={{ ...container, state }} />);
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(DECLARED_PERIOD_MS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // container-processes-view.md — "The tab gained nothing the operator can see: no indicator, no
  // 'last updated', no setting — the count band and the refresh control are the ones it already
  // had" (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-35)
  it('says nothing about being on a clock', async () => {
    render(<ContainerProcessesView container={container} />);
    await screen.findByText('postgres: walwriter');

    expect(screen.queryByText(/last updated|auto-refresh|live|every \d+ ?s/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((control) => control.textContent)).toEqual(['Refresh']);
  });

  // container-processes-view.md — a failure is shown verbatim, instead of the table, with a retry that re-reads
  it('shows the failure verbatim instead of the table and re-reads on retry', async () => {
    const user = userEvent.setup();
    nextResult = { ok: false, status: 409, body: { error: 'Container container-1 is not running' } };
    render(<ContainerProcessesView container={container} />);

    expect(await screen.findByText('Container container-1 is not running')).toBeInTheDocument();
    expect(screen.queryByText('postgres: walwriter')).not.toBeInTheDocument();

    nextResult = { ok: true, status: 200, body: threeProcesses };
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('postgres: walwriter')).toBeInTheDocument();
    expect(screen.queryByText('Container container-1 is not running')).not.toBeInTheDocument();
  });
});
