import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerLogsView } from '../../src/containers/ContainerLogsView';
import type { ContainerSummary } from '../../src/data/containers-client';
import { forgetReportedFailures, reportedText } from '../support/error-reporting-mock';
import { errorPanels } from '../support/failed-read';

// What a view owes on a failure is the report itself; what becomes of it is the reporting
// service's own contract (app-shell/specs/error-reporting-service.md).
vi.mock('../../src/shell/services/ErrorReportingService', () => import('../support/error-reporting-mock'));

const container: ContainerSummary = {
  id: 'container-1',
  shortId: 'container1',
  name: 'web-nginx',
  image: 'nginx:1.27',
  state: 'running',
  status: 'Up 3 days',
  ports: [],
};

// The view's log subscription reaches the server through EventSource, which
// jsdom does not provide; the fake lets the test play the server's part.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private listeners = new Map<string, Array<(event: unknown) => void>>();
  closed = false;

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

function latest(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1];
}

function emit(lines: Array<{ text: string; stream?: 'stdout' | 'stderr'; timestamp?: string }>) {
  const source = latest();
  act(() => {
    lines.forEach((line, index) => {
      source.emit('line', JSON.stringify({ seq: index + 1, stream: line.stream ?? 'stdout', text: line.text, timestamp: line.timestamp }));
    });
  });
}

beforeEach(() => {
  forgetReportedFailures();
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ContainerLogsView (REQ-30, REQ-31)', () => {
  // plan-docker_management_app/REQ-30 — the container's log lines are shown as they arrive
  it('shows the log lines arriving on the stream', async () => {
    render(<ContainerLogsView container={container} />);
    emit([{ text: 'server started' }, { text: 'boom', stream: 'stderr' }]);

    expect(await screen.findByText('server started')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-30 — timestamps can be turned on; the stream is reopened so the daemon actually sends them
  it('reopens the stream asking the daemon for timestamps and shows the timestamp column', async () => {
    const user = userEvent.setup();
    render(<ContainerLogsView container={container} />);
    emit([{ text: 'before', timestamp: '2026-08-06T10:00:00Z' }]);
    await screen.findByText('before');
    expect(screen.queryByText('2026-08-06T10:00:00Z')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Timestamps' }));

    await waitFor(() => expect(latest().url).toContain('timestamps=true'));
    // Re-querying the daemon starts the buffer from scratch.
    expect(screen.queryByText('before')).not.toBeInTheDocument();

    emit([{ text: 'after', timestamp: '2026-08-06T10:00:01Z' }]);
    expect(await screen.findByText('2026-08-06T10:00:01Z')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-30 — the streams shown are selectable and the last one cannot be turned off
  it('reopens the stream with only the selected stream, and refuses to turn the last one off', async () => {
    const user = userEvent.setup();
    render(<ContainerLogsView container={container} />);

    await user.click(screen.getByRole('button', { name: 'stderr' }));
    await waitFor(() => expect(latest().url).toContain('stderr=false'));

    await user.click(screen.getByRole('button', { name: 'stdout' }));
    const openedStreams = FakeEventSource.instances.length;
    expect(latest().url).not.toContain('stdout=false');
    expect(FakeEventSource.instances).toHaveLength(openedStreams);
  });

  // plan-docker_management_app/REQ-30 — the tail size reopens the stream reading that many trailing lines
  it('reopens the stream with the chosen tail size', async () => {
    const user = userEvent.setup();
    render(<ContainerLogsView container={container} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Tail size' }), 'last 100 lines');

    await waitFor(() => expect(latest().url).toContain('tail=100'));
  });

  // plan-docker_management_app/REQ-30 — the since/until filter reopens the stream bounded to that range
  it('reopens the stream bounded by the since/until range', async () => {
    const user = userEvent.setup();
    render(<ContainerLogsView container={container} />);

    await user.type(screen.getByRole('textbox', { name: 'Since' }), '10m');

    await waitFor(() => expect(latest().url).toContain('since=10m'));
  });

  // plan-docker_management_app/REQ-31 — the displayed logs are text-searched with every match highlighted and counted
  it('highlights every match of the searched text and reports the match count', async () => {
    const user = userEvent.setup();
    const { container: dom } = render(<ContainerLogsView container={container} />);
    emit([{ text: 'connection error on 8080' }, { text: 'all good' }, { text: 'ERROR: retrying' }]);
    await screen.findByText(/all good/);

    await user.type(screen.getByRole('textbox', { name: 'Search the stream' }), 'error');

    await waitFor(() => expect(dom.querySelectorAll('mark')).toHaveLength(2));
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-31 — next/previous move the current match
  it('moves the current match with next and previous', async () => {
    const user = userEvent.setup();
    render(<ContainerLogsView container={container} />);
    emit([{ text: 'error one' }, { text: 'error two' }]);
    await screen.findByText('error one');

    await user.type(screen.getByRole('textbox', { name: 'Search the stream' }), 'error');
    await screen.findByText('1/2');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('2/2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('1/2')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-31 — a search with no match reports it instead of a position
  it('reports that nothing matches when the search finds no line', async () => {
    const user = userEvent.setup();
    render(<ContainerLogsView container={container} />);
    emit([{ text: 'nothing of interest' }]);
    await screen.findByText('nothing of interest');

    await user.type(screen.getByRole('textbox', { name: 'Search the stream' }), 'zzz');

    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-31 — the buffered log can be downloaded as <container name>-logs.txt
  it('downloads the buffered log as <container name>-logs.txt', async () => {
    const user = userEvent.setup();
    const created: Blob[] = [];
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      value: (blob: Blob) => {
        created.push(blob);
        return 'blob:log';
      },
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
    const downloadNames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadNames.push(this.download);
    });

    try {
      render(<ContainerLogsView container={container} />);
      emit([{ text: 'downloadable line' }]);
      await screen.findByText('downloadable line');

      await user.click(screen.getByRole('button', { name: 'Download' }));

      expect(downloadNames).toEqual(['web-nginx-logs.txt']);
      await expect(created[0].text()).resolves.toBe('downloadable line');
    } finally {
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    }
  });

  // container-logs-view.md — "The controls form **two labelled groups**, on the log region's own
  // action row: `Fetch` … the stream selection, the tail size, the since/until range; `Read` … the
  // search box with its match count and previous/next, the timestamps control, and `Download`"
  // (REQ-27). No row holds a single button, and the view draws none of its own
  // (plan-ui-coherence-optimisation/REQ-62).
  it('groups the controls as Fetch and Read on the log region\'s one action row', async () => {
    const { container: dom } = render(<ContainerLogsView container={container} />);
    emit([{ text: 'a line to search' }]);
    await screen.findByText('a line to search');

    const actionRows = dom.querySelectorAll('.ui-log-stream__actions');
    expect(actionRows, 'the stream draws no action row, or more than one').toHaveLength(1);
    const row = actionRows[0]!;

    const groups = new Map(
      [...dom.querySelectorAll('.ui-control-group')].map((group) => [
        group.querySelector('.ui-control-group__label')?.textContent ?? '',
        group,
      ]),
    );
    expect([...groups.keys()].sort(), 'the controls are not presented as the two labelled groups').toEqual(['Fetch', 'Read']);

    const membership: [string, HTMLElement][] = [
      ['Fetch', screen.getByRole('button', { name: 'stdout' })],
      ['Fetch', screen.getByRole('button', { name: 'stderr' })],
      ['Fetch', screen.getByRole('combobox', { name: 'Tail size' })],
      ['Fetch', screen.getByRole('textbox', { name: 'Since' })],
      ['Fetch', screen.getByRole('textbox', { name: 'Until' })],
      ['Read', screen.getByRole('textbox', { name: 'Search the stream' })],
      ['Read', screen.getByRole('button', { name: 'Previous' })],
      ['Read', screen.getByRole('button', { name: 'Next' })],
      ['Read', screen.getByRole('checkbox', { name: 'Timestamps' })],
      ['Read', screen.getByRole('button', { name: 'Download' })],
    ];
    for (const [label, control] of membership) {
      const name = control.getAttribute('aria-label') ?? control.textContent;
      expect(row.contains(control), `${name} is not on the stream's action row`).toBe(true);
      expect(groups.get(label)!.contains(control), `${name} is not in the ${label} group`).toBe(true);
    }

    // Every control is on that one row: the view keeps no control row of its own above it.
    const stream = dom.querySelector('.ui-log-stream')!;
    const outside = [...dom.querySelectorAll('button, input, select')].filter((control) => !stream.contains(control));
    expect(outside.map((control) => control.getAttribute('aria-label') ?? control.textContent)).toEqual([]);
  });

  // container-logs-view.md — "each line distinguished by the level its own text states, read by
  // `log-level.md` … **A line stating no recognised marker is left neutral**, which is the reading
  // being conservative and not a gap in it" (REQ-29), and the line's text unchanged (REQ-31).
  it('distinguishes a line by the level its text states and leaves an unmarked line neutral', async () => {
    const neutralTexts = [
      'GET /api/error-report 200',
      'LOG_LEVEL=ERROR',
      'no errors found',
      'POST /v1/payments 500 42ms',
    ];
    const { container: dom } = render(<ContainerLogsView container={container} />);
    emit([
      { text: 'ordinary line' },
      { text: 'ERROR: cannot connect' },
      { text: 'WARN retrying in 3s' },
      ...neutralTexts.map((text) => ({ text })),
    ]);
    await screen.findByText('ordinary line');

    const classesOf = (text: string) => {
      const line = [...dom.querySelectorAll('.ui-log-stream__line')].find(
        (row) => row.querySelector('.ui-log-stream__text')?.textContent === text,
      );
      if (!line) throw new Error(`no line is drawn for "${text}"`);
      return [...line.classList].sort();
    };

    const ordinary = classesOf('ordinary line');
    expect(classesOf('ERROR: cannot connect'), 'the error line is drawn like an ordinary one').not.toEqual(ordinary);
    expect(classesOf('WARN retrying in 3s'), 'the warned line is drawn like an ordinary one').not.toEqual(ordinary);
    expect(classesOf('WARN retrying in 3s'), 'the two levels are drawn alike').not.toEqual(classesOf('ERROR: cannot connect'));

    // The conservative half: a line that merely mentions an error is left exactly as an ordinary one.
    for (const text of neutralTexts) {
      expect(classesOf(text), `"${text}" was coloured although it states no level marker`).toEqual(ordinary);
    }
    // And nothing rewrote a line to say it: each is drawn exactly as it arrived.
    for (const text of ['ERROR: cannot connect', ...neutralTexts]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  // container-logs-view.md — "the stream a line came from is a separate distinction the library
  // draws on a channel of its own: a stderr line stays told from a stdout line whether or not it
  // states a level, and an error line on stdout is not mistaken for a stderr one" (REQ-30)
  it('keeps the stderr distinction independent of the level it reads', async () => {
    const { container: dom } = render(<ContainerLogsView container={container} />);
    emit([
      { text: 'ordinary on stdout' },
      { text: 'ERROR: on stdout', stream: 'stdout' },
      { text: 'ordinary on stderr', stream: 'stderr' },
      { text: 'ERROR: on stderr', stream: 'stderr' },
    ]);
    await screen.findByText('ordinary on stdout');

    const classesOf = (text: string) => {
      const line = [...dom.querySelectorAll('.ui-log-stream__line')].find(
        (row) => row.querySelector('.ui-log-stream__text')?.textContent === text,
      );
      if (!line) throw new Error(`no line is drawn for "${text}"`);
      return [...line.classList].sort();
    };

    const ordinary = classesOf('ordinary on stdout');
    const levelMark = classesOf('ERROR: on stdout').filter((name) => !ordinary.includes(name));
    const streamMark = classesOf('ordinary on stderr').filter((name) => !ordinary.includes(name));

    expect(levelMark, 'nothing distinguishes an error line from an ordinary one').not.toHaveLength(0);
    expect(streamMark, 'nothing distinguishes an stderr line from a stdout one').not.toHaveLength(0);
    expect(streamMark, 'the stream and the level are marked the same way, so one hides the other').not.toEqual(levelMark);
    expect(
      classesOf('ERROR: on stderr'),
      'the line that is both an stderr line and an error line does not show both',
    ).toEqual(expect.arrayContaining([...levelMark, ...streamMark]));
  });

  // container-logs-view.md — a failed stream "is reported as one toast", and the view draws no
  // failure of its own (…-inline_error_panels/REQ-1, /REQ-5)
  it('reports a stream failure and draws none of it', async () => {
    render(<ContainerLogsView container={container} />);

    act(() => latest().emit('error', JSON.stringify({ message: 'No such container: container-1' })));

    await waitFor(() => expect(reportedText(), 'the stream failure was not reported').toMatch('No such container: container-1'));
    expect(screen.queryByText('No such container: container-1'), 'the view stated the failure itself').not.toBeInTheDocument();
    expect(errorPanels(), 'the view drew a failure panel').toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Retry' }), 'the view offered a retry of its own').not.toBeInTheDocument();
  });

  // container-logs-view.md — the end of the stream is indicated when lines had been received
  it('indicates that the stream ended once the daemon closed the output', async () => {
    render(<ContainerLogsView container={container} />);
    emit([{ text: 'the only line' }]);
    await screen.findByText('the only line');

    act(() => latest().emit('end'));

    expect(await screen.findByText('Stream ended.')).toBeInTheDocument();
  });

  // container-logs-view.md — when no line was ever received, the empty state says so instead of "Stream ended."
  it('says the container produced no output when the stream ended empty', async () => {
    const { container: dom } = render(<ContainerLogsView container={container} />);
    const waitingLabel = dom.querySelector('.ui-empty-state__title')?.textContent;

    act(() => latest().emit('end'));

    await waitFor(() => expect(dom.querySelector('.ui-empty-state__title')?.textContent).not.toBe(waitingLabel));
    expect(screen.queryByText('Stream ended.')).not.toBeInTheDocument();
  });
});
