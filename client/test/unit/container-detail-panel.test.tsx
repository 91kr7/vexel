import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerDetailPanel } from '../../src/containers/ContainerDetailPanel';
import type { ContainerInspect, ContainerSummary } from '../../src/data/containers-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { DetailPanel, ToastProvider } from '../../src/ui';

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

function renderPanel(onContainerReplaced = vi.fn()) {
  const view = render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <ContainerDetailPanel container={container} onContainerReplaced={onContainerReplaced} />
            <ReportedErrors />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
  return { onContainerReplaced, view };
}

// The panel's read hook subscribes to daemon events via a module-level
// EventSource (client/src/data/event-stream.ts), and the Logs tab subscribes to
// the log stream the same way; neither is available in jsdom.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
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

    await user.clear(screen.getByRole('textbox', { name: 'Environment Value 1' }));
    await user.type(screen.getByRole('textbox', { name: 'Environment Value 1' }), 'baz');
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

    await user.clear(screen.getByRole('textbox', { name: 'Environment Value 1' }));
    await user.type(screen.getByRole('textbox', { name: 'Environment Value 1' }), 'baz');
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

describe('ContainerDetailPanel — the tab row (REQ-11, REQ-12)', () => {
  /**
   * container-detail-panel.md — Config is both the first tab of the row and the tab selected when
   * the detail opens, the others following it as Logs, Stats, Processes, Inspect and, for a running
   * container, Exec and Attach (REQ-11). This restates the check that named the old order
   * (Logs first) rather than dropping it: the row is still read by position, at the new position.
   */
  it('draws Config first, opens on that same first tab, and offers Exec/Attach for a running container', async () => {
    renderPanel();

    await screen.findByRole('button', { name: 'Edit configuration' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Config', 'Logs', 'Stats', 'Processes', 'Inspect', 'Exec', 'Attach']);
    // The tab drawn first and the tab opened on are one and the same, read off the row rather than
    // named twice: naming Config on both sides would still pass if the two ever drifted apart.
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs.slice(1).map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false', 'false', 'false', 'false']);
    expect(screen.getByRole('tab', { name: 'Config' })).toBe(tabs[0]);
  });

  /**
   * container-detail-panel.md, ui-library/specs/tabs.md — every tab presented carries the same
   * treatment, only the active one distinguished (REQ-12). The subject is what is *drawn*, so the
   * six inactive tabs are compared to one another as rendered: Exec and Attach must be
   * indistinguishable from Logs, Stats, Processes and Inspect, not merely present and enabled.
   */
  it('draws the seven tabs of a running container alike, with only the active one distinguished', async () => {
    renderPanel();
    await screen.findByRole('button', { name: 'Edit configuration' });

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    const treatmentOf = (tab: HTMLElement) => ({
      classes: [...tab.classList].sort(),
      style: tab.getAttribute('style'),
      disabled: (tab as HTMLButtonElement).disabled,
      ariaDisabled: tab.getAttribute('aria-disabled'),
      // Every attribute the tab carries besides the ones that must differ per tab.
      attributes: tab.getAttributeNames().filter((name) => !['class', 'aria-selected'].includes(name)).sort(),
    });

    const inactive = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'false');
    expect(inactive.map((tab) => tab.textContent)).toEqual(['Logs', 'Stats', 'Processes', 'Inspect', 'Exec', 'Attach']);
    const treatments = inactive.map((tab) => JSON.stringify(treatmentOf(tab)));
    expect(new Set(treatments), `the tabs not showing are drawn differently from one another: ${treatments.join(' | ')}`).toHaveLength(1);
    expect(tabs.some((tab) => (tab as HTMLButtonElement).disabled || tab.hasAttribute('aria-disabled'))).toBe(false);
    expect(tabs.some((tab) => tab.hasAttribute('style'))).toBe(false);

    // …and the one distinction there is, is the active one's: it adds a marker, and takes nothing away.
    const active = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')!;
    const inactiveClasses = treatmentOf(inactive[0]!).classes;
    expect(inactiveClasses.every((name) => active.classList.contains(name))).toBe(true);
    expect(active.classList.length).toBeGreaterThan(inactiveClasses.length);
  });
});

describe('ContainerDetailPanel — Logs tab (REQ-30)', () => {
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
  /**
   * plan-docker_management_app/REQ-26, **narrowed on 2026-08-14** to *viewable
   * and selectable* as-is (plan-docker_management_app-remove_copy_controls/REQ-23).
   *
   * **Restated, not deleted**: the payload's completeness used to be checked
   * through what a copy handed over, which was the strongest form available —
   * the whole serialised payload, character for character. It still is, and it is
   * still asserted; it is now read off the block that displays it rather than off
   * the clipboard, which is the only thing that changed (REQ-30).
   */
  it('shows the raw inspect payload verbatim, exactly as the Engine returned it', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('tab', { name: 'Inspect' }));

    expect(await screen.findByText(/raw-container-1-id/)).toBeInTheDocument();
    const blocks = Array.from(document.querySelectorAll('.ui-code-viewer__code'));
    expect(blocks.at(-1)).toHaveTextContent(JSON.stringify(baseInspect().raw, null, 2), { normalizeWhitespace: false });
  });
});

// container-detail-panel.md — "A collapsible section with nothing in it is not drawn", one rule
// shared with the image panel: `Networks` and `Labels` appear only when they hold at least one
// entry, so a section headed with a count of `0` cannot occur.
describe('ContainerDetailPanel — an empty section is absent (plan-ui-coherence-optimisation/REQ-60)', () => {
  function withInspect(overrides: Partial<ContainerInspect>): void {
    fetchMock.mockImplementation((url: string) =>
      url.includes('/inspect')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...baseInspect(), ...overrides }) })
        : Promise.resolve({ ok: configResponse.ok, status: configResponse.status, json: () => Promise.resolve(configResponse.body) }),
    );
  }

  async function inspectTabSections(): Promise<{ title: string; summary: string }[]> {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('tab', { name: 'Inspect' }));
    await screen.findByText(/raw-container-1-id/);
    return Array.from(document.querySelectorAll('.ui-collapsible-section')).map((section) => ({
      title: section.querySelector('.ui-collapsible-section__title')?.textContent ?? '',
      summary: section.querySelector('.ui-collapsible-section__summary')?.textContent ?? '',
    }));
  }

  it('draws no section at all for a container attached to no network and declaring no label', async () => {
    withInspect({ networks: [], labels: {} });

    expect(await inspectTabSections()).toEqual([]);
  });

  it('draws no Labels section for a container declaring none, while Networks keeps its own', async () => {
    withInspect({ networks: [{ name: 'bridge' }], labels: {} });

    expect(await inspectTabSections()).toEqual([{ title: 'Networks', summary: '1' }]);
  });

  it('draws both sections, each headed with its own count, when both have content', async () => {
    withInspect({ networks: [{ name: 'bridge' }], labels: { 'com.docker.compose.project': 'shop', team: 'platform' } });

    expect(await inspectTabSections()).toEqual([
      { title: 'Networks', summary: '1' },
      { title: 'Labels', summary: '2' },
    ]);
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

  url: string;

  constructor(url: string) {
    this.url = url;
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
              <ContainerDetailPanel container={{ ...container, state: 'exited' }} onContainerReplaced={vi.fn()} />
            </ToastProvider>
          </ConfirmationProvider>
        </ProgressProvider>
      </ErrorReportingProvider>,
    );

    await screen.findByRole('button', { name: 'Edit configuration' });
    expect(screen.queryByRole('tab', { name: 'Exec' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Attach' })).not.toBeInTheDocument();
    // Being running-only decides the pair's presence and nothing else: the five that remain keep
    // the order they have on a running container, Config still first and still the one shown (REQ-11).
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Config', 'Logs', 'Stats', 'Processes', 'Inspect']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  // container-detail-panel.md — the Exec and Attach tabs reach their session for a running container
  it('reaches the Exec launch form and the Attach action through their tabs', async () => {
    const user = userEvent.setup();
    render(
      <ErrorReportingProvider>
        <ProgressProvider>
          <ConfirmationProvider>
            <ToastProvider>
              <ContainerDetailPanel container={container} onContainerReplaced={vi.fn()} />
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
              <ContainerDetailPanel container={container} onContainerReplaced={vi.fn()} />
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

// container-detail-panel.md — "Export filesystem…" was this panel's only header action and is
// started from the row's overflow menu now; the slot is deliberately left empty rather than filled
// with a replacement (REQ-19). The download behaviour itself is asserted where the action lives now,
// in containers-screen.test.tsx.
describe('ContainerDetailPanel — no filesystem export any more (REQ-19)', () => {
  it('offers no "Export filesystem…" action', async () => {
    renderPanel();

    // Awaited on the panel's own content, so the absence is asserted on a
    // rendered panel rather than on one that has not drawn its header yet.
    expect(await screen.findByRole('tab', { name: 'Config' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export filesystem…' })).not.toBeInTheDocument();
  });

  it('puts nothing in the place the export left', async () => {
    renderPanel();
    expect(await screen.findByRole('tab', { name: 'Config' })).toBeInTheDocument();

    expect(document.querySelector('.ui-detail-panel__actions')).toBeNull();
  });

});

// container-detail-panel.md — the panel is a body and not a surface: no surface of its own, no
// header, no title, no close control and no dismissal route, all of which are the dialog's now.
// Restates the delivered "dismissal without a close control" checks, whose `Escape` half is
// superseded by detail_modal/REQ-11 rather than dropped.
describe('ContainerDetailPanel — a body, not a surface (REQ-4, REQ-11, REQ-23)', () => {
  it('wraps itself in no panel surface and declares no chrome of its own', async () => {
    renderPanel();

    // Awaited on the panel's own content, so the absence is asserted on a
    // rendered panel rather than on one that has not drawn its content yet.
    expect(await screen.findByRole('tab', { name: 'Config' })).toBeInTheDocument();
    expect(document.querySelector('.ui-detail-panel'), 'the detail still draws a surface of its own').toBeNull();
    expect(document.querySelector('.ui-detail-panel__close')).toBeNull();
    expect(document.querySelector('.ui-detail-panel__actions')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close detail' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close dialog' }), 'the body draws the dialog’s own control').not.toBeInTheDocument();
  });

  // detail_modal/REQ-11 — the key closes nothing here. This supersedes
  // plan-docker_management_app-container_detail_close/REQ-5, which had it close this panel.
  it('is dismissed by no Escape, from the outside and from a control inside its own contents', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(await screen.findByRole('tab', { name: 'Config' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('tab', { name: 'Config' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Inspect' }));
    screen.getByRole('tab', { name: 'Inspect' }).focus();
    await user.keyboard('{Escape}');

    expect(screen.getByRole('tab', { name: 'Inspect' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')).toHaveLength(7);
  });

  // container-detail-panel.md — "the panel offers none and claims no key": a dismissible surface
  // beside it still receives the key, so the panel swallows nothing on its way past.
  it('claims the key for nothing, leaving a dismissible surface beside it free to take it', async () => {
    const user = userEvent.setup();
    const claimed = vi.fn();
    render(
      <ErrorReportingProvider>
        <ProgressProvider>
          <ConfirmationProvider>
            <ToastProvider>
              <DetailPanel dismissal="opening-gesture" onClose={claimed}>
                a dismissible surface on the screen
              </DetailPanel>
              <ContainerDetailPanel container={container} onContainerReplaced={vi.fn()} />
            </ToastProvider>
          </ConfirmationProvider>
        </ProgressProvider>
      </ErrorReportingProvider>,
    );
    expect(await screen.findByRole('tab', { name: 'Config' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(claimed, 'the detail body took the key from the surface beside it').toHaveBeenCalledTimes(1);
  });
});

/**
 * The Config tab **in reading**: the two counted sections the environment and the mounts became
 * (`…-tabs_composition_refactor/REQ-18`, REQ-19, REQ-20, REQ-21), and the zero-count rule they
 * inherit from the Inspect tab above (`plan-ui-coherence-optimisation/REQ-60`).
 *
 * What is asserted here is what jsdom can answer: which sections are drawn, what each heading
 * claims, how each entry is split and what each band reads. The **alignment** REQ-18 is about, the
 * treatment that tells the `ro` chip from the `rw` one, and where `Edit configuration` sits are
 * geometry, and are measured in `client/e2e/container-detail-config-reading.spec.ts`.
 */
describe('ContainerDetailPanel — Config tab in reading (REQ-18, REQ-19, REQ-20, REQ-21)', () => {
  function withInspect(overrides: Partial<ContainerInspect>): void {
    fetchMock.mockImplementation((url: string) =>
      url.includes('/inspect')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...baseInspect(), ...overrides }) })
        : Promise.resolve({ ok: configResponse.ok, status: configResponse.status, json: () => Promise.resolve(configResponse.body) }),
    );
  }

  interface ReadSection {
    title: string;
    /**
     * What the heading claims it holds. Read from the badge in the header's trailing slot — the
     * same reading the Inspect tab's collapsible sections use — and not from the title, which
     * carries the section's name and nothing else.
     */
    count: string;
    bands: { label: string; value: string }[];
  }

  /** The sections of the read view, each with the heading's own count and the bands under it. */
  async function configSections(): Promise<ReadSection[]> {
    renderPanel();
    await screen.findByRole('button', { name: 'Edit configuration' });
    return Array.from(document.querySelectorAll('.ui-section-header')).map((header) => {
      const list = header.parentElement?.querySelector(':scope > .ui-definition-list');
      return {
        title: header.querySelector('.ui-section-header__title')?.textContent ?? '',
        count: header.querySelector('.ui-badge')?.textContent ?? '',
        bands: Array.from(list?.children ?? []).map((row) => ({
          label: row.querySelector('.ui-definition-list__label')?.textContent ?? '',
          value: row.querySelector('.ui-definition-list__value')?.textContent ?? '',
        })),
      };
    });
  }

  function section(sections: ReadSection[], title: string): ReadSection {
    const found = sections.find((candidate) => candidate.title === title);
    expect(found, `no "${title}" section is drawn; the tab shows ${sections.map((one) => one.title).join(', ') || 'nothing'}`).toBeDefined();
    return found!;
  }

  // REQ-18 — the daemon's `KEY=value` string is split on its **first** `=` only, so a value that
  // itself contains one arrives whole; an entry with no `=` is the key with an empty value.
  it('splits each environment entry on its first = only, and an entry with none is a key with no value', async () => {
    withInspect({
      env: ['PATH=/usr/local/sbin:/usr/local/bin:/bin', 'DATABASE_URL=postgres://u:p@host:5432/db?sslmode=require&retry=1', 'FLAG'],
      mounts: [],
    });

    expect(section(await configSections(), 'Environment').bands).toEqual([
      { label: 'PATH', value: '/usr/local/sbin:/usr/local/bin:/bin' },
      { label: 'DATABASE_URL', value: 'postgres://u:p@host:5432/db?sslmode=require&retry=1' },
      { label: 'FLAG', value: '' },
    ]);
  });

  // REQ-19 — the heading carries the number of variables, and the number it claims is the number
  // drawn under it.
  it('heads the environment section with the number of variables it draws', async () => {
    withInspect({ env: ['A=1', 'B=2', 'C=3', 'D=4'], mounts: [] });

    const environment = section(await configSections(), 'Environment');
    expect(/(\d+)/.exec(environment.count)?.[1], `the Environment heading states "${environment.count}" instead of a count`).toBe(
      String(environment.bands.length),
    );
    expect(environment.bands).toHaveLength(4);
  });

  // REQ-20, REQ-21 — mounts are a section of their own with its own count; each entry reads source
  // → destination with a `ro` / `rw` chip, and the word `mount:` is the heading rather than a
  // prefix repeated on every row.
  it('gives mounts their own counted section, each entry reading source, destination and a ro/rw chip', async () => {
    withInspect({
      env: [],
      mounts: [
        { type: 'bind', source: '/srv/config', destination: '/etc/app', readOnly: true },
        { type: 'volume', source: 'app-data', destination: '/var/lib/app', readOnly: false },
      ],
    });

    const sections = await configSections();
    const mounts = section(sections, 'Mounts');
    expect(/(\d+)/.exec(mounts.count)?.[1], `the Mounts heading states "${mounts.count}" instead of a count`).toBe(String(mounts.bands.length));
    expect(mounts.bands).toEqual([
      { label: '/srv/config', value: '/etc/appro' },
      { label: 'app-data', value: '/var/lib/apprw' },
    ]);
    expect(document.body.textContent, 'an entry still carries the literal `mount:` prefix').not.toMatch(/mount:/i);
  });

  // plan-ui-coherence-optimisation/REQ-60 — a section with nothing in it is not drawn at all,
  // heading included: a heading counting 0 is present-and-empty.
  it('draws neither heading for a container with no environment and no mounts', async () => {
    withInspect({ env: [], mounts: [] });

    expect((await configSections()).map((one) => one.title)).toEqual(['Runtime configuration']);
  });

  it('draws the section that has entries and omits the one that has none', async () => {
    withInspect({ env: ['FOO=bar'], mounts: [] });

    expect((await configSections()).map((one) => one.title)).toEqual(['Runtime configuration', 'Environment']);
  });
});
