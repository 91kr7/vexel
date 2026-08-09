import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerLogsView } from '../../src/containers/ContainerLogsView';
import type { ContainerSummary } from '../../src/data/containers-client';

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
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// userEvent.setup() installs its own navigator.clipboard stub, so the test's
// stub must be defined after setup() to take precedence over it.
function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

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

  // plan-docker_management_app/REQ-31 — the buffered log can be copied as text
  it('copies the buffered log lines as text', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(<ContainerLogsView container={container} />);
    emit([{ text: 'first' }, { text: 'second' }]);
    await screen.findByText('first');

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('first\nsecond');
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

  // container-logs-view.md — a stream failure is shown verbatim with a retry that reopens the stream
  it('shows the stream failure verbatim and reopens the stream on retry', async () => {
    const user = userEvent.setup();
    render(<ContainerLogsView container={container} />);

    act(() => latest().emit('error', JSON.stringify({ message: 'No such container: container-1' })));

    expect(await screen.findByText('No such container: container-1')).toBeInTheDocument();
    const openedStreams = FakeEventSource.instances.length;

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(FakeEventSource.instances.length).toBe(openedStreams + 1));
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
