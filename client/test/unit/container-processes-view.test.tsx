import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  // container-processes-view.md — the listing is never polled: it is read once and then only on demand
  it('never re-reads the listing on its own', async () => {
    render(<ContainerProcessesView container={container} />);
    await screen.findByText('postgres: walwriter');

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
