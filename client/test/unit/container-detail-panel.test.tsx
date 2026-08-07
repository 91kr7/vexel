import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerDetailPanel } from '../../src/containers/ContainerDetailPanel';
import type { ContainerInspect, ContainerSummary } from '../../src/data/containers-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

const container: ContainerSummary = {
  id: 'container-1',
  shortId: 'container1',
  name: 'web-nginx',
  image: 'nginx:1.27',
  state: 'running',
  status: 'Up 3 days',
  ports: [],
};

function baseInspect(): ContainerInspect {
  return {
    id: 'container-1',
    name: 'web-nginx',
    image: 'nginx:1.27',
    command: ['nginx'],
    entrypoint: [],
    createdAt: '2026-01-01T00:00:00Z',
    state: { status: 'running', startedAt: '2026-01-01T00:00:01Z' },
    restartPolicy: { name: 'no' },
    resourceLimits: {},
    env: ['FOO=bar'],
    ports: [],
    mounts: [],
    networks: [{ name: 'bridge' }],
    labels: {},
    raw: { Id: 'raw-container-1-id', Name: '/web-nginx' },
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

function renderPanel(onContainerReplaced = vi.fn(), onClose = vi.fn()) {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <ContainerDetailPanel container={container} onClose={onClose} onContainerReplaced={onContainerReplaced} />
            <ReportedErrors />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
  return { onContainerReplaced, onClose };
}

// The panel's read hook subscribes to daemon events via a module-level
// EventSource (client/src/data/event-stream.ts), and the Logs tab subscribes to
// the log stream the same way; neither is available in jsdom.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  private listeners = new Map<string, Array<(event: unknown) => void>>();
  closed = false;

  constructor(public url: string) {
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

function logStreamSource(): FakeEventSource | undefined {
  return FakeEventSource.instances.findLast((instance) => instance.url.includes('/logs/stream'));
}

let fetchMock: ReturnType<typeof vi.fn>;
let configResponse: { ok: boolean; status: number; body: unknown };

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  configResponse = { ok: true, status: 200, body: { path: 'in-place', container } };
  fetchMock = vi.fn((url: string) => {
    if (url.includes('/inspect')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(baseInspect()) });
    }
    if (url.includes('/config')) {
      return Promise.resolve({ ok: configResponse.ok, status: configResponse.status, json: () => Promise.resolve(configResponse.body) });
    }
    return Promise.reject(new Error(`Unexpected fetch url: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// userEvent.setup() installs its own navigator.clipboard stub, so the test's
// stub must be defined after setup() to take precedence over it.
function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('ContainerDetailPanel — Config tab (REQ-24, REQ-25)', () => {
  // container-detail-panel.md — edit mode is seeded from the current inspect data; save is disabled while nothing changed
  it('seeds the edit form with the current restart policy and disables Save until something changes', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Edit configuration' }));

    expect(screen.getByRole('combobox', { name: 'Restart policy' })).toHaveValue('no');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  // plan-docker_management_app/REQ-25 — restart policy and/or resource limits alone are applied in place, no warning
  it('applies a restart-policy-only change in place, without asking for confirmation', async () => {
    const user = userEvent.setup();
    const { onContainerReplaced } = renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Edit configuration' }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Restart policy' }), 'always');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.queryByRole('heading', { name: /^Confirm:/ })).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.ui-toast-viewport')?.textContent).toMatch(/Configuration updated/));
    const configCall = fetchMock.mock.calls.find(([url]) => (url as string).includes('/config'));
    const [, init] = configCall as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ restartPolicy: { name: 'always' } });
    expect(onContainerReplaced).not.toHaveBeenCalled();
  });

  // plan-docker_management_app/REQ-25 — an environment change asks for confirmation before a recreate, and reports it on confirm
  it('asks for confirmation before recreating when an environment variable changes, and recreates on confirm', async () => {
    configResponse = { ok: true, status: 200, body: { path: 'recreate', container: { ...container, id: 'container-2' } } };
    const user = userEvent.setup();
    const { onContainerReplaced } = renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Edit configuration' }));

    await user.clear(screen.getByRole('textbox', { name: 'Value 1' }));
    await user.type(screen.getByRole('textbox', { name: 'Value 1' }), 'baz');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialogHeading = await screen.findByRole('heading', { name: 'Confirm: web-nginx' });
    const dialog = dialogHeading.closest('.ui-modal') as HTMLElement;
    await user.click(within(dialog).getByRole('button', { name: 'Recreate container' }));

    await waitFor(() => expect(document.querySelector('.ui-toast-viewport')?.textContent).toMatch(/Container recreated/));
    const configCall = fetchMock.mock.calls.find(([url]) => (url as string).includes('/config'));
    const [, init] = configCall as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ env: ['FOO=baz'] });
    expect(onContainerReplaced).toHaveBeenCalledWith('container-2');
  });

  // plan-docker_management_app/REQ-25 — declining the recreate confirmation leaves the container and its configuration unchanged
  it('declining the recreate confirmation leaves the container unchanged', async () => {
    const user = userEvent.setup();
    const { onContainerReplaced } = renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Edit configuration' }));

    await user.clear(screen.getByRole('textbox', { name: 'Value 1' }));
    await user.type(screen.getByRole('textbox', { name: 'Value 1' }), 'baz');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialogHeading = await screen.findByRole('heading', { name: 'Confirm: web-nginx' });
    const dialog = dialogHeading.closest('.ui-modal') as HTMLElement;
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(fetchMock.mock.calls.some(([url]) => (url as string).includes('/config'))).toBe(false);
    expect(onContainerReplaced).not.toHaveBeenCalled();
  });

  // container-detail-panel.md — a failure reports the daemon's own message and leaves edit mode open with the input intact
  it("reports the daemon's own message on failure and keeps the edited input intact", async () => {
    configResponse = { ok: false, status: 409, body: { error: 'container is not running' } };
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Edit configuration' }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Restart policy' }), 'always');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/container is not running/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Restart policy' })).toHaveValue('always');
  });

  // container-detail-panel.md — "Cancel" discards the in-progress edit without contacting the server
  it('cancel discards the edit without contacting the server', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Edit configuration' }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Restart policy' }), 'always');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit configuration' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => (url as string).includes('/config'))).toBe(false);
  });
});

describe('ContainerDetailPanel — Logs tab (REQ-30)', () => {
  // container-detail-panel.md — the tab row is Logs, Stats, Config, Processes, Inspect and (for a running container) Exec, Attach; Config is the tab selected on open
  it('offers a Logs tab first, Exec/Attach for a running container, and opens on the Config tab', async () => {
    renderPanel();

    await screen.findByRole('button', { name: 'Edit configuration' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Logs', 'Stats', 'Config', 'Processes', 'Inspect', 'Exec', 'Attach']);
    expect(screen.getByRole('tab', { name: 'Config' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'false');
  });

  // container-detail-panel.md — the Logs tab shows the container's logs, neither needing nor awaiting the inspect data
  it("shows the container's log stream without waiting for the inspect data", async () => {
    // The inspect request never settles here: the Logs tab must not depend on it.
    fetchMock.mockImplementation((url: string) =>
      url.includes('/inspect') ? new Promise(() => {}) : Promise.reject(new Error(`Unexpected fetch url: ${url}`)),
    );
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('tab', { name: 'Logs' }));

    await waitFor(() => expect(logStreamSource()).toBeDefined());
    expect(logStreamSource()!.url).toContain('/api/containers/container-1/logs/stream');

    act(() => logStreamSource()!.emit('line', JSON.stringify({ seq: 1, stream: 'stdout', text: 'log line from the daemon' })));

    expect(await screen.findByText('log line from the daemon')).toBeInTheDocument();
  });
});

describe('ContainerDetailPanel — Inspect tab (REQ-26)', () => {
  // plan-docker_management_app/REQ-26 — the raw inspect payload is viewable and copyable as-is
  it('shows the raw inspect payload verbatim and copies it exactly on request', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    renderPanel();

    await user.click(await screen.findByRole('tab', { name: 'Inspect' }));

    expect(await screen.findByText(/raw-container-1-id/)).toBeInTheDocument();
    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    await user.click(copyButtons[copyButtons.length - 1]);

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(baseInspect().raw, null, 2));
  });
});

// Stands in for the browser's WebSocket underneath useContainerSession, so the
// Exec/Attach tabs' session lifecycle is driven directly from the test.
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  binaryType = '';
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send() {}

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch('close', {});
  }

  emitOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch('open', {});
  }

  private dispatch(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function latestSocket(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
}

describe('ContainerDetailPanel — Exec/Attach tabs (REQ-34, REQ-35, REQ-36)', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    // The real Terminal (xterm.js) needs browser APIs jsdom does not provide;
    // these no-op stand-ins let it mount so the tab's own tests can run.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }),
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  // container-detail-panel.md — the Exec and Attach tabs are only offered for a running container
  it('offers no Exec/Attach tabs for a container that is not running', async () => {
    render(
      <ErrorReportingProvider>
        <ProgressProvider>
          <ConfirmationProvider>
            <ToastProvider>
              <ContainerDetailPanel container={{ ...container, state: 'exited' }} onClose={vi.fn()} onContainerReplaced={vi.fn()} />
            </ToastProvider>
          </ConfirmationProvider>
        </ProgressProvider>
      </ErrorReportingProvider>,
    );

    await screen.findByRole('button', { name: 'Edit configuration' });
    expect(screen.queryByRole('tab', { name: 'Exec' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Attach' })).not.toBeInTheDocument();
  });

  // container-detail-panel.md — the Exec and Attach tabs reach their session for a running container
  it('reaches the Exec launch form and the Attach action through their tabs', async () => {
    const user = userEvent.setup();
    render(
      <ErrorReportingProvider>
        <ProgressProvider>
          <ConfirmationProvider>
            <ToastProvider>
              <ContainerDetailPanel container={container} onClose={vi.fn()} onContainerReplaced={vi.fn()} />
            </ToastProvider>
          </ConfirmationProvider>
        </ProgressProvider>
      </ErrorReportingProvider>,
    );

    await user.click(await screen.findByRole('tab', { name: 'Exec' }));
    expect(screen.getByRole('tab', { name: 'Exec' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Launch session' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Attach' }));
    expect(screen.getByRole('tab', { name: 'Attach' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Attach' })).toBeInTheDocument();
  });

  // container-detail-panel.md — leaving the Exec tab closes the interactive session (REQ-36)
  it('closes the active exec session when leaving the Exec tab', async () => {
    const user = userEvent.setup();
    render(
      <ErrorReportingProvider>
        <ProgressProvider>
          <ConfirmationProvider>
            <ToastProvider>
              <ContainerDetailPanel container={container} onClose={vi.fn()} onContainerReplaced={vi.fn()} />
            </ToastProvider>
          </ConfirmationProvider>
        </ProgressProvider>
      </ErrorReportingProvider>,
    );

    await user.click(await screen.findByRole('tab', { name: 'Exec' }));
    await user.click(await screen.findByRole('button', { name: 'Launch session' }));
    await act(async () => latestSocket().emitOpen());

    await user.click(screen.getByRole('tab', { name: 'Config' }));

    expect(latestSocket().readyState).toBe(FakeWebSocket.CLOSED);
  });
});

// container-detail-panel.md — "Export filesystem…" immediately triggers a browser download of the
// container's current filesystem, named "<container name>.tar", with no dialog opened first (REQ-43).
describe('ContainerDetailPanel — export filesystem (plan-docker_management_app/REQ-43)', () => {
  it('downloads the container filesystem as <name>.tar with no dialog opened first, and reports a toast', async () => {
    const user = userEvent.setup();
    const downloadedHrefs: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedHrefs.push(this.href);
      });

    try {
      renderPanel();

      await user.click(await screen.findByRole('button', { name: 'Export filesystem…' }));

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
