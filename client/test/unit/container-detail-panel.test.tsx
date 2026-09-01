import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    if (url.includes('/processes')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ titles: ['PID', 'USER', 'CMD'], processes: [{ pid: 1, user: 'root', command: 'nginx -g daemon off;' }] }),
      });
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

/**
 * The Config tab's edit form, recomposed into groups
 * (`…-tabs_composition_refactor/REQ-23`, `REQ-24`, `REQ-25`, `REQ-26`).
 *
 * REQ-23 and REQ-24 are claims about what is drawn where, and jsdom draws nothing: what is settled
 * here is the **structure** the geometry rests on — which element holds which group, and which two
 * groups share a pair. The boxes are measured in `e2e/container-detail-config-editing.spec.ts`, and
 * the health-check reveal's effect on the dialog's own box in
 * `e2e/container-detail-switch-surface.spec.ts` (REQ-2).
 *
 * **REQ-26 is a certified behaviour this batch must not have moved**, and it is not restated in new
 * tests: the four tests of the describe above — the restart-policy-only save that asks nothing, the
 * environment change that asks and recreates, the decline that abandons the save, and the failure
 * that leaves the form open — are the ones that certify it, and they run unchanged. What is added
 * here is the one path the rearrangement touched and none of them drives: a mount added in the
 * recomposed `Mounts` group still asks before the container is stopped, removed and recreated.
 */
describe('ContainerDetailPanel — the Config edit form in groups (REQ-23, REQ-24, REQ-25, REQ-26)', () => {
  /** The five groups the form is composed of, each with a control that belongs to it and no other. */
  const GROUPS: { title: string; own: () => HTMLElement }[] = [
    { title: 'Runtime', own: () => screen.getByRole('combobox', { name: 'Restart policy' }) },
    { title: 'Health check', own: () => screen.getByRole('checkbox', { name: 'Enabled' }) },
    { title: 'Environment variables', own: () => screen.getByRole('textbox', { name: 'Environment Key 1' }) },
    { title: 'Port mappings', own: () => screen.getByRole('button', { name: 'Add port' }) },
    { title: 'Mounts', own: () => screen.getByRole('button', { name: 'Add mount' }) },
  ];

  function groupHeading(title: string): HTMLElement {
    const heading = [...document.querySelectorAll('.ui-section-header__title')].find((node) => node.textContent === title);
    expect(heading, `the edit form draws no \`${title}\` heading`).toBeDefined();
    return heading as HTMLElement;
  }

  /** The footer's leading side: what the form states beside its save and cancel (`form-footer.md`). */
  function footerLeadingSide(): HTMLElement {
    const save = screen.getByRole('button', { name: /^(Save changes|Saving…)$/ });
    const leading = save.closest('.ui-row')?.parentElement?.firstElementChild;
    expect(leading, 'the form draws no footer of the library’s own').toBeDefined();
    return leading as HTMLElement;
  }

  async function openEditForm() {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Edit configuration' }));
    return user;
  }

  // REQ-23 — each group sits inside a container of its own rather than being a heading on one
  // continuous ground: five distinct bounded surfaces, each holding one heading and its own fields.
  it('draws each of its five groups inside a container of its own', async () => {
    await openEditForm();

    const containers = GROUPS.map(({ title, own }) => {
      const container = groupHeading(title).closest('.ui-surface');
      expect(container, `the \`${title}\` group has no container of its own: its heading sits on the form’s ground`).not.toBeNull();
      expect(container!.contains(own()), `the \`${title}\` group’s own fields are drawn outside its container`).toBe(true);
      const headings = [...container!.querySelectorAll('.ui-section-header__title')].map((node) => node.textContent);
      expect(headings, `the container holding \`${title}\` also holds ${JSON.stringify(headings)}, so it is not that group’s own`).toEqual([title]);
      return container as HTMLElement;
    });

    expect(new Set(containers).size, 'the five groups share fewer than five containers between them').toBe(5);
  });

  // REQ-24 — the two small groups share the library's named `pair`, which is what makes them stack
  // at full width when the dialog cannot carry both; the other three are full-width rows of their own.
  it('sits Runtime and Health check in one pair, and the other three outside it', async () => {
    await openEditForm();

    const pairs = [...document.querySelectorAll('.ui-grid--pair')];
    expect(pairs, 'the edit form draws no two-column pair at all').toHaveLength(1);
    const inThePair = [...pairs[0].querySelectorAll('.ui-section-header__title')].map((node) => node.textContent);
    expect(inThePair, 'the pair does not hold exactly the two small groups').toEqual(['Runtime', 'Health check']);

    for (const title of ['Environment variables', 'Port mappings', 'Mounts']) {
      expect(pairs[0].contains(groupHeading(title)), `the \`${title}\` group is drawn inside the two-column pair`).toBe(false);
    }
  });

  // REQ-25 — the footer states what a save would cost from the moment the form opens, before the
  // operator has touched anything, and beside the dirty indicator rather than instead of it.
  it('states the recreate cost in its footer from the moment the form opens', async () => {
    await openEditForm();

    const leading = footerLeadingSide();
    const stated = leading.textContent ?? '';
    expect(stated, 'the footer says nothing about the environment').toMatch(/environment/i);
    expect(stated, 'the footer says nothing about the mounts').toMatch(/mounts/i);
    expect(stated, 'the footer never states that a recreate is what those changes cost').toMatch(/recreat/i);
    // Nothing has been touched: the statement above is standing, not a response to an edit.
    expect(stated, 'the dirty indicator was replaced by the statement').toMatch(/No changes/);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  // REQ-25 — and it goes on stating it, whatever has been edited: it says what *would* require a
  // recreate, so it is not conditional on environment or mounts having been touched.
  it('goes on stating it once a change the recreate does not concern has been made', async () => {
    const user = await openEditForm();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Restart policy' }), 'always');

    const stated = footerLeadingSide().textContent ?? '';
    expect(stated, 'the statement disappeared as soon as a field was edited').toMatch(/recreat/i);
    expect(stated, 'the dirty indicator no longer reads the edit that was just made').toMatch(/Unsaved changes/);
  });

  // REQ-26 — the standing statement replaces no confirmation: a mount added in the recomposed
  // `Mounts` group still asks explicitly, and declining still abandons the save.
  it('still asks before recreating when a mount is added, and declining abandons the save', async () => {
    const user = await openEditForm();

    await user.click(screen.getByRole('button', { name: 'Add mount' }));
    await user.type(screen.getByRole('textbox', { name: 'Source 1' }), '/tmp/source');
    await user.type(screen.getByRole('textbox', { name: 'Destination 1' }), '/mnt/target');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const dialogHeading = await screen.findByRole('heading', { name: 'Confirm: web-nginx' });
    const dialog = dialogHeading.closest('.ui-modal') as HTMLElement;
    // Scoped: the form's own footer carries a `Cancel` too, and an unscoped one would find it.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(fetchMock.mock.calls.some(([url]) => (url as string).includes('/config'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Save changes' }), 'declining left the edit form').toBeInTheDocument();
  });
});

describe('ContainerDetailPanel — the Processes tab (tabs_composition_refactor/REQ-32)', () => {
  /**
   * container-detail-panel.md — Processes is shown "handed the region itself rather than a document
   * scroller inside it", because a table asked to take the height its tab offers is offered no
   * definite height at all inside a scroller whose content box is `auto`. So the check is on what
   * stands *between* the tab's region and the table: nothing that scrolls.
   *
   * The height the table then takes is a measurement, and every box is zero in jsdom:
   * `e2e/container-stats-processes.spec.ts` is where it is measured.
   */
  it('draws the process table inside the tab’s own region, with no document scroller around it', async () => {
    const user = userEvent.setup();
    const { view } = renderPanel();
    await screen.findByRole('button', { name: 'Edit configuration' });

    await user.click(screen.getByRole('tab', { name: 'Processes' }));
    const table = await waitFor(() => {
      const found = view.container.querySelector<HTMLElement>('.ui-data-table');
      expect(found, 'the Processes tab drew no table at all').not.toBeNull();
      return found!;
    });

    const scrollersAbove: string[] = [];
    for (let ancestor = table.parentElement; ancestor !== null && view.container.contains(ancestor); ancestor = ancestor.parentElement) {
      if (ancestor.classList.contains('ui-scroll-area')) scrollersAbove.push(ancestor.className);
    }
    expect(
      scrollersAbove,
      'the process table is wrapped in a scroller, which offers it no definite height to take',
    ).toEqual([]);
  });
});

describe('ContainerDetailPanel — the tab row (REQ-11, REQ-12)', () => {
  /**
   * container-detail-panel.md — Config is both the first tab of the row and the tab selected when
   * the detail opens, Inspect immediately after it and the remaining five in their present relative
   * order (`…-inspect_full_payload/REQ-1`, REQ-2). Read by position, at the new position.
   */
  it('draws Config first, opens on that same first tab, and offers Exec/Attach for a running container', async () => {
    renderPanel();

    await screen.findByRole('button', { name: 'Edit configuration' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Config', 'Inspect', 'Logs', 'Stats', 'Processes', 'Exec', 'Attach']);
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
    expect(inactive.map((tab) => tab.textContent)).toEqual(['Inspect', 'Logs', 'Stats', 'Processes', 'Exec', 'Attach']);
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

/**
 * **The Inspect tab as the whole payload** — `…-inspect_full_payload/REQ-3` … REQ-20, read off
 * `containers/specs/container-detail-panel.md`. Completeness against the response itself lives in
 * `container-inspect-completeness.test.tsx`; geometry lives in the e2e specs, jsdom laying nothing out.
 */
describe('ContainerDetailPanel — Inspect tab (…-inspect_full_payload/REQ-3 … REQ-20)', () => {
  function rawPayload(): Record<string, unknown> {
    return {
      Id: 'a1b2c3d4e5f6a1b2c3d4e5f6',
      Created: '2026-01-01T00:00:00Z',
      Path: 'sleep',
      Args: ['300'],
      State: {
        Status: 'exited',
        Running: false,
        ExitCode: 137,
        StartedAt: '2026-01-01T00:00:01Z',
        FinishedAt: '0001-01-01T00:00:00Z',
        Health: { Status: 'unhealthy', FailingStreak: 2, Log: [{ Output: 'connection refused' }] },
      },
      Name: '/web-nginx',
      RestartCount: 0,
      Image: 'sha256:deadbeef',
      HostConfig: { Memory: 536870912, ShmSize: 0, Privileged: false, Dns: [], PortBindings: {} },
      Config: { Image: 'nginx:1.27', Cmd: ['nginx', '-g', 'daemon off;'], Entrypoint: null, Env: ['TOKEN=s3cr3t'], Labels: {} },
      NetworkSettings: { Ports: { '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] }, SandboxID: null },
    };
  }

  function withRaw(raw: unknown = rawPayload()): void {
    fetchMock.mockImplementation((url: string) =>
      url.includes('/inspect')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...baseInspect(), raw }) })
        : Promise.resolve({ ok: configResponse.ok, status: configResponse.status, json: () => Promise.resolve(configResponse.body) }),
    );
  }

  async function openInspect(): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('tab', { name: 'Inspect' }));
    await screen.findByLabelText('Find in payload');
    return user;
  }

  interface DrawnSection {
    title: string;
    summary: string;
    open: boolean;
  }

  function sections(): DrawnSection[] {
    return Array.from(document.querySelectorAll('.ui-payload-explorer .ui-collapsible-section')).map((section) => ({
      title: section.querySelector('.ui-collapsible-section__title')?.textContent ?? '',
      summary: section.querySelector('.ui-collapsible-section__summary')?.textContent ?? '',
      open: section.querySelector('.ui-collapsible-section__header')?.getAttribute('aria-expanded') === 'true',
    }));
  }

  function sectionNamed(title: string): HTMLElement {
    const found = Array.from(document.querySelectorAll<HTMLElement>('.ui-payload-explorer .ui-collapsible-section')).find(
      (section) => section.querySelector('.ui-collapsible-section__title')?.textContent === title,
    );
    expect(found, `no "${title}" section is drawn; the tab draws ${sections().map((one) => one.title).join(', ') || 'nothing'}`).toBeDefined();
    return found!;
  }

  interface DrawnBand {
    label: string;
    value: string;
    reading: string | null;
    empty: boolean;
    danger: boolean;
  }

  function bands(root: ParentNode = document): DrawnBand[] {
    return Array.from(root.querySelectorAll('.ui-payload-band')).map((band) => {
      const value = band.querySelector('.ui-payload-band__value');
      return {
        label: band.querySelector('.ui-payload-band__label')?.textContent ?? '',
        value: value?.textContent ?? '',
        reading: band.querySelector('.ui-payload-band__reading')?.textContent ?? null,
        empty: value?.classList.contains('ui-payload-band__value--empty') ?? false,
        danger: value?.classList.contains('ui-payload-band__value--tone-danger') ?? false,
      };
    });
  }

  function bandNamed(label: string, root: ParentNode = document): DrawnBand {
    const found = bands(root).find((band) => band.label === label);
    expect(found, `no band labelled "${label}" is drawn under this section`).toBeDefined();
    return found!;
  }

  async function openEverySection(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    for (const title of sections().filter((section) => !section.open).map((section) => section.title)) {
      await user.click(sectionNamed(title).querySelector<HTMLElement>('.ui-collapsible-section__header')!);
    }
  }

  // REQ-8, REQ-10 — the sections are the response's own top-level keys, scalars gathered first, in the payload's order
  it('divides the tab into the payload’s own top-level keys, gathered scalars first', async () => {
    withRaw();

    await openInspect();

    expect(sections().map((section) => section.title)).toEqual([
      'Fields',
      'Args',
      'State',
      'HostConfig',
      'Config',
      'NetworkSettings',
      'Raw payload',
    ]);
  });

  // REQ-11 — exactly two sections are open on entry: the gathered scalars and `State`
  it('opens exactly the gathered scalars and State when the tab is entered', async () => {
    withRaw();

    await openInspect();

    expect(sections().filter((section) => section.open).map((section) => section.title)).toEqual(['Fields', 'State']);
  });

  // REQ-9 — a closed section still states how much it holds
  it('states how much each section holds while it is still closed', async () => {
    withRaw();

    await openInspect();

    expect(sections().map((section) => ({ title: section.title, summary: section.summary }))).toEqual([
      { title: 'Fields', summary: '6 fields' },
      { title: 'Args', summary: '1 item' },
      { title: 'State', summary: '6 fields' },
      { title: 'HostConfig', summary: '5 fields' },
      { title: 'Config', summary: '5 fields' },
      { title: 'NetworkSettings', summary: '2 fields' },
      { title: 'Raw payload', summary: 'JSON' },
    ]);
  });

  // REQ-12 — the raw payload is the last section of the tab and is closed on entry
  it('pins the raw payload last, closed', async () => {
    withRaw();

    await openInspect();

    const drawn = sections();
    expect(drawn.at(-1)).toMatchObject({ title: 'Raw payload', open: false });
    expect(document.querySelectorAll('.ui-code-viewer'), 'the payload is drawn before its section has been opened').toHaveLength(0);
  });

  // REQ-12 — opened, it holds the response unaltered as real text
  it('holds the whole response unaltered once the raw payload section is opened', async () => {
    withRaw();
    const user = await openInspect();

    await user.click(sectionNamed('Raw payload').querySelector<HTMLElement>('.ui-collapsible-section__header')!);

    const block = document.querySelector('.ui-code-viewer__code')!;
    expect(block).toHaveTextContent(JSON.stringify(rawPayload(), null, 2), { normalizeWhitespace: false });
  });

  // REQ-5 — no summary block heads the tab: the find control is what the tab opens with
  it('heads the tab with the find control and no summary block of curated properties', async () => {
    withRaw();

    await openInspect();

    expect(screen.queryByText('Identity')).toBeNull();
    expect(screen.queryByText('Lifecycle')).toBeNull();
    expect(document.querySelectorAll('.ui-payload-explorer .ui-definition-list'), 'the tab still lays a curated list at its head').toHaveLength(0);
    const explorer = document.querySelector('.ui-payload-explorer')!;
    expect(explorer.firstElementChild!.classList.contains('ui-payload-explorer__find')).toBe(true);
  });

  // REQ-5 — the ten former properties survive as fields of the payload, each in the section its key belongs to, none twice
  it('renders each of the ten former properties in the section its own key belongs to, exactly once', async () => {
    withRaw();
    const user = await openInspect();
    await openEverySection(user);

    const scalars = sectionNamed('Fields');
    expect(bandNamed('Id', scalars).value).toBe('a1b2c3d4e5f6a1b2c3d4e5f6');
    expect(bandNamed('Name', scalars).value).toBe('/web-nginx');
    expect(bandNamed('Image', scalars).value).toBe('sha256:deadbeef');
    expect(bandNamed('Created', scalars).value).toBe('2026-01-01T00:00:00Z');
    expect(bandNamed('Path', scalars).value).toBe('sleep');

    const state = sectionNamed('State');
    expect(bandNamed('Status', state).value).toBe('exited');
    expect(bandNamed('StartedAt', state).value).toBe('2026-01-01T00:00:01Z');
    expect(bandNamed('FinishedAt', state).value).toBe('0001-01-01T00:00:00Z');
    expect(bandNamed('ExitCode', state).value).toBe('137');

    const config = sectionNamed('Config');
    expect(bands(config).map((band) => band.label)).toContain('Entrypoint');
    expect(bands(config).map((band) => band.label)).toContain('Image');

    expect(bands().filter((band) => band.label === 'ExitCode'), 'the exit code is drawn twice').toHaveLength(1);
  });

  // REQ-16 — the state reads as a pill, in the tone the module's one state reading gives it
  it('draws the payload’s own state as a pill beside the literal it read', async () => {
    withRaw();

    await openInspect();

    const stateBand = Array.from(document.querySelectorAll('.ui-payload-band')).find(
      (band) => band.querySelector('.ui-payload-band__label')?.textContent === 'Status',
    )!;
    const pill = stateBand.querySelector('.ui-badge');
    expect(pill, 'the state is drawn as a plain value rather than as a pill').not.toBeNull();
    expect(pill!.textContent).toBe('EXITED');
    expect(stateBand.querySelector('.ui-payload-band__value')!.textContent, 'the pill replaced the daemon’s literal').toBe('exited');
  });

  // REQ-16 — the health outcome reads as a pill too, wherever the payload puts it
  it('draws the health outcome as a pill beside its own literal', async () => {
    withRaw();
    const user = await openInspect();
    await openEverySection(user);

    const healthBand = Array.from(document.querySelectorAll('.ui-payload-band')).find(
      (band) =>
        band.querySelector('.ui-payload-band__label')?.textContent === 'Status' &&
        band.querySelector('.ui-payload-band__value')?.textContent === 'unhealthy',
    );
    expect(healthBand, 'the health outcome is nowhere in the tab').toBeDefined();
    expect(healthBand!.querySelector('.ui-badge')?.textContent).toBe('UNHEALTHY');
  });

  // REQ-16, REQ-18 — a non-zero exit code is toned as bad news; a zero one is drawn like any other value
  it('tones a non-zero exit code and leaves a zero one untoned', async () => {
    withRaw();
    await openInspect();
    expect(bandNamed('ExitCode', sectionNamed('State'))).toMatchObject({ value: '137', danger: true });

    cleanup();
    withRaw({ ...rawPayload(), State: { Status: 'exited', ExitCode: 0 } });
    await openInspect();

    expect(bandNamed('ExitCode', sectionNamed('State'))).toMatchObject({ value: '0', danger: false, empty: false });
  });

  // REQ-17 — a formatted reading is drawn beside the daemon's literal, never in place of it
  it('draws the readable date, the byte unit and the yes/no beside the literal the daemon sent', async () => {
    withRaw();
    const user = await openInspect();
    await openEverySection(user);

    expect(bandNamed('FinishedAt', sectionNamed('State'))).toMatchObject({ value: '0001-01-01T00:00:00Z', reading: 'never' });
    const memory = bandNamed('Memory', sectionNamed('HostConfig'));
    expect(memory.value).toBe('536870912');
    expect(memory.reading).toMatch(/^[\d.]+ (B|KB|MB|GB|TB)$/);
    expect(bandNamed('Privileged', sectionNamed('HostConfig'))).toMatchObject({ value: 'false', reading: 'no', empty: false });
  });

  // REQ-6, REQ-7 — an empty field is marked empty in its own place, and a zero is not empty
  it('marks the payload’s empty fields as empty and leaves its zeros alone', async () => {
    withRaw();
    const user = await openInspect();
    await openEverySection(user);

    expect(bandNamed('Dns', sectionNamed('HostConfig'))).toMatchObject({ value: 'empty (list)', empty: true });
    expect(bandNamed('Labels', sectionNamed('Config'))).toMatchObject({ value: 'empty (object)', empty: true });
    expect(bandNamed('Entrypoint', sectionNamed('Config'))).toMatchObject({ value: 'empty (null)', empty: true });
    expect(bandNamed('SandboxID', sectionNamed('NetworkSettings'))).toMatchObject({ value: 'empty (null)', empty: true });
    expect(bandNamed('ShmSize', sectionNamed('HostConfig'))).toMatchObject({ value: '0', empty: false });
    expect(bandNamed('RestartCount', sectionNamed('Fields'))).toMatchObject({ value: '0', empty: false, reading: null });
  });

  // REQ-35 — a value carrying a token is drawn in full, like any other
  it('draws an environment variable carrying a token in full', async () => {
    withRaw();
    const user = await openInspect();
    await openEverySection(user);

    expect(bands(sectionNamed('Config')).map((band) => band.value)).toContain('TOKEN=s3cr3t');
  });

  // REQ-19, REQ-20 — the find filters the whole payload, opening the sections holding matches
  it('filters the whole payload from the find control and states how many fields matched', async () => {
    withRaw();
    const user = await openInspect();

    await user.type(screen.getByLabelText('Find in payload'), 'HostPort');

    expect(sections().map((section) => section.title)).toEqual(['NetworkSettings']);
    expect(bands().map((band) => band.label)).toEqual(['HostPort']);
    expect(document.querySelector('.ui-payload-explorer__matches')?.textContent).toBe('1 matching field');
  });

  // REQ-20 — clearing the find puts the tab back the way it opened
  it('puts the tab back the way it opened when the find is cleared', async () => {
    withRaw();
    const user = await openInspect();
    const control = screen.getByLabelText('Find in payload');

    await user.type(control, 'HostPort');
    await user.keyboard('{Backspace>8/}');

    expect(control).toHaveValue('');
    expect(sections().map((section) => section.title)).toEqual(['Fields', 'Args', 'State', 'HostConfig', 'Config', 'NetworkSettings', 'Raw payload']);
    expect(sections().filter((section) => section.open).map((section) => section.title)).toEqual(['Fields', 'State']);
  });

  // REQ-24 — the rebuilt tab introduces no copy affordance: only the find and the section headers are controls
  it('offers no copy affordance anywhere in the tab', async () => {
    withRaw();
    const user = await openInspect();
    await openEverySection(user);

    const explorer = document.querySelector('.ui-payload-explorer')!;
    const controls = Array.from(explorer.querySelectorAll('button, a, [role="button"]'));
    expect(controls.every((control) => control.classList.contains('ui-collapsible-section__header'))).toBe(true);
    expect(document.querySelector('.ui-code-viewer__actions'), 'the payload block carries an action row').toBeNull();
    expect(explorer.textContent?.toLowerCase()).not.toContain('copy');
  });

  // REQ-25 — the rebuilt tab asks the daemon for nothing it did not ask for before
  it('asks for the container’s inspect data and nothing else', async () => {
    withRaw();
    const user = await openInspect();
    await openEverySection(user);
    await user.click(sectionNamed('Raw payload').querySelector<HTMLElement>('.ui-collapsible-section__header')!);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.filter((url) => url.includes('/inspect'))).toHaveLength(1);
    expect(urls.every((url) => url.includes('/inspect') || url.includes('/config'))).toBe(true);
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
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Config', 'Inspect', 'Logs', 'Stats', 'Processes']);
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
 * The Config tab **in reading** — the five groups it draws, what each heading claims, what each
 * entry reads and where the action that opens the form sits
 * (`…-tabs_composition_refactor/REQ-19`, REQ-20, REQ-21, REQ-48, REQ-50, REQ-51, REQ-54, REQ-55,
 * REQ-56, REQ-59).
 *
 * **The expectations below reverse the ones this block held**, and the reversal is the contract's:
 * REQ-51 amends REQ-49, so the three collection groups are drawn whether or not they hold anything;
 * REQ-50 amends REQ-22, so `Edit configuration` closes the tab instead of heading it. The checks
 * that named the old arrangement are rewritten against the new one rather than deleted (REQ-43).
 *
 * What is asserted here is what jsdom can answer: which groups are drawn, what each heading claims,
 * how an entry is split, what each field is called, and in which order the tab draws them. The
 * **geometry** — one entry per row at the group's full width, a value beginning at its own field, no
 * field wider than half its row, and the action's box against the tab's trailing and bottom edges —
 * is measured in `client/e2e/container-detail-config-reading.spec.ts`.
 */
describe('ContainerDetailPanel — Config tab in reading (REQ-48, REQ-50, REQ-51, REQ-54, REQ-55, REQ-56, REQ-59)', () => {
  function withInspect(overrides: Partial<ContainerInspect>): void {
    fetchMock.mockImplementation((url: string) =>
      url.includes('/inspect')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...baseInspect(), ...overrides }) })
        : Promise.resolve({ ok: configResponse.ok, status: configResponse.status, json: () => Promise.resolve(configResponse.body) }),
    );
  }

  /** One field of an entry: what it is called, what it reads, and the chips its value carries. */
  interface ReadField {
    caption: string;
    value: string;
    chips: string[];
  }

  interface ReadGroup {
    title: string;
    /**
     * What the heading claims it holds. Read from the badge in the header's trailing slot — the
     * same reading the Inspect tab's collapsible sections use — and not from the title, which
     * carries the group's name and nothing else.
     */
    count: string;
    /** The entries of a field list: one per row, each holding its own fields in the declared order. */
    entries: ReadField[][];
    /** The bands of a property list, for the two groups that are still one (`Runtime`, `Health check`). */
    bands: { label: string; value: string }[];
    /** The title of the placeholder a group with nothing in it draws where its list would be. */
    placeholder: string | null;
  }

  /** Every group of the read view, in the order the tab draws them. */
  async function configGroups(): Promise<ReadGroup[]> {
    renderPanel();
    await screen.findByRole('button', { name: 'Edit configuration' });
    return Array.from(document.querySelectorAll('.ui-section-header')).map((header) => {
      const body = header.parentElement;
      const fieldList = body?.querySelector(':scope > .ui-field-list');
      const definitionList = body?.querySelector(':scope > .ui-definition-list');
      return {
        title: header.querySelector('.ui-section-header__title')?.textContent ?? '',
        count: header.querySelector('.ui-badge')?.textContent ?? '',
        entries: Array.from(fieldList?.children ?? []).map((entry) =>
          Array.from(entry.querySelectorAll('.ui-field-list__field')).map((field) => ({
            caption: field.querySelector('.ui-field-list__caption')?.textContent ?? '',
            value: field.querySelector('.ui-field-list__value')?.textContent ?? '',
            chips: Array.from(field.querySelectorAll('.ui-chip')).map((chip) => chip.textContent ?? ''),
          })),
        ),
        bands: Array.from(definitionList?.children ?? []).map((row) => ({
          label: row.querySelector('.ui-definition-list__label')?.textContent ?? '',
          value: row.querySelector('.ui-definition-list__value')?.textContent ?? '',
        })),
        placeholder: body?.querySelector(':scope > .ui-empty-state .ui-empty-state__title')?.textContent ?? null,
      };
    });
  }

  function group(groups: ReadGroup[], title: string): ReadGroup {
    const found = groups.find((candidate) => candidate.title === title);
    expect(found, `no "${title}" group is drawn; the tab shows ${groups.map((one) => one.title).join(', ') || 'nothing'}`).toBeDefined();
    return found!;
  }

  /** The values of an entry, in the declared order — for the group whose fields are uncaptioned. */
  function valuesOf(entries: ReadField[][]): string[][] {
    return entries.map((entry) => entry.map((field) => field.value));
  }

  /** What an entry is called and what it reads, keyed by caption — for the two captioned groups. */
  function byCaption(entries: ReadField[][]): Record<string, string>[] {
    return entries.map((entry) => Object.fromEntries(entry.map((field) => [field.caption, field.value])));
  }

  // REQ-51 — the three collection groups are drawn whether or not they hold anything, each with its
  // count, and a group with nothing in it says so in the library's placeholder rather than being
  // absent. **This reverses what this block asserted for REQ-49**: an absent group is
  // indistinguishable from a group that was never designed, which is not the answer the operator
  // came for. `Runtime` and `Health check` were always drawn already.
  it('draws all five groups for a container that states nothing, the three collections counting zero', async () => {
    withInspect({ env: [], ports: [], mounts: [] });

    const groups = await configGroups();
    expect(groups.map((one) => one.title)).toEqual(['Runtime', 'Health check', 'Environment variables', 'Port mappings', 'Mounts']);
    for (const title of ['Environment variables', 'Port mappings', 'Mounts']) {
      const empty = group(groups, title);
      expect(empty.count, `the ${title} heading states "${empty.count}" instead of the number of entries it holds`).toBe('0');
      expect(empty.entries, `the ${title} group draws entries for a container that has none`).toEqual([]);
      expect(empty.placeholder, `the ${title} group is drawn empty, with nothing where its list would be`).not.toBeNull();
    }
  });

  // REQ-51, again on the half that is not the empty one: a group that holds something is unchanged
  // by the amendment, and the two beside it are still drawn.
  it('draws the three collection groups together when only one of them holds anything', async () => {
    withInspect({ env: ['FOO=bar'], ports: [], mounts: [] });

    const groups = await configGroups();
    expect(groups.map((one) => one.title)).toEqual(['Runtime', 'Health check', 'Environment variables', 'Port mappings', 'Mounts']);
    expect(group(groups, 'Environment variables').entries).toHaveLength(1);
    expect(group(groups, 'Port mappings').placeholder, 'the empty Port mappings group draws no placeholder').not.toBeNull();
    expect(group(groups, 'Mounts').placeholder, 'the empty Mounts group draws no placeholder').not.toBeNull();
  });

  // REQ-54 — one variable per entry, the key and the value each in a field of its own; and REQ-18's
  // split, which the recomposition carries over: the daemon's string is split on its **first** `=`
  // only, so a value that itself contains one arrives whole, and an entry with no `=` is the key
  // with an empty value.
  it('gives each environment variable a key field and a value field, splitting on the first = only', async () => {
    withInspect({
      env: ['PATH=/usr/local/sbin:/usr/local/bin:/bin', 'DATABASE_URL=postgres://u:p@host:5432/db?sslmode=require&retry=1', 'FLAG'],
      mounts: [],
    });

    expect(valuesOf(group(await configGroups(), 'Environment variables').entries)).toEqual([
      ['PATH', '/usr/local/sbin:/usr/local/bin:/bin'],
      ['DATABASE_URL', 'postgres://u:p@host:5432/db?sslmode=require&retry=1'],
      ['FLAG', ''],
    ]);
  });

  // REQ-19 — the heading carries the number of variables, and the number it claims is the number
  // drawn under it.
  it('heads the environment group with the number of variables it draws', async () => {
    withInspect({ env: ['A=1', 'B=2', 'C=3', 'D=4'], mounts: [] });

    const environment = group(await configGroups(), 'Environment variables');
    expect(environment.count, `the Environment variables heading states "${environment.count}" instead of a count`).toBe(String(environment.entries.length));
    expect(environment.entries).toHaveLength(4);
  });

  // REQ-48, REQ-55 — the ports are a counted group of their own, one entry per port, and each entry
  // **names** its two numbers instead of leaving which is which to the order they are written in.
  // A port the daemon publishes nowhere says so rather than reading as an empty value.
  it('names the container port and the host port of every port entry, and says when one is published nowhere', async () => {
    withInspect({
      env: [],
      mounts: [],
      ports: [
        { containerPort: 443, protocol: 'tcp', hostPort: 8443 },
        { containerPort: 5000, protocol: 'tcp' },
      ],
    });

    const ports = group(await configGroups(), 'Port mappings');
    expect(ports.count, `the Port mappings heading states "${ports.count}" instead of a count`).toBe('2');
    expect(byCaption(ports.entries)).toEqual([
      { 'Container port': '443/tcp', 'Host port': '8443' },
      { 'Container port': '5000/tcp', 'Host port': 'not published' },
    ]);
  });

  // REQ-48, on the client's half of it: an entry the service hands over with no host port is drawn
  // as a mapping saying so, not as an absent group.
  //
  // **Its premise reversed on 2026-08-27, and the check moved with it.** It used to name an
  // exposed-but-unpublished port, which REQ-59 stops carrying this far at all — the reading is the
  // container's publications and only those. What still arrives without a host port is a container
  // that has never run: the operator asked for the publication, the daemon has bound nothing yet.
  it('draws a binding the daemon has published nowhere as a port mapping, not as an empty group', async () => {
    withInspect({ env: [], mounts: [], ports: [{ containerPort: 5000, protocol: 'tcp' }] });

    const ports = group(await configGroups(), 'Port mappings');
    expect(ports.placeholder, 'the tab says the container has no port mapping while it states one').toBeNull();
    expect(byCaption(ports.entries)).toEqual([{ 'Container port': '5000/tcp', 'Host port': 'not published' }]);
  });

  // REQ-20, REQ-21, REQ-56 — mounts are a counted group of their own, each entry naming its source
  // and its destination and carrying the `ro` / `rw` chip beside the destination. The word `mount:`
  // is the heading rather than a prefix repeated on every row.
  it('gives mounts their own counted group, each entry naming its source, its destination and the write mode', async () => {
    withInspect({
      env: [],
      mounts: [
        { type: 'bind', source: '/srv/config', destination: '/etc/app', readOnly: true },
        { type: 'volume', source: 'app-data', destination: '/var/lib/app', readOnly: false },
      ],
    });

    const groups = await configGroups();
    const mounts = group(groups, 'Mounts');
    expect(mounts.count, `the Mounts heading states "${mounts.count}" instead of a count`).toBe(String(mounts.entries.length));
    expect(byCaption(mounts.entries)).toEqual([
      { Source: '/srv/config', Destination: '/etc/appro' },
      { Source: 'app-data', Destination: '/var/lib/apprw' },
    ]);
    expect(
      mounts.entries.map((entry) => entry.map((field) => field.chips)),
      'the write mode is not the chip beside the destination',
    ).toEqual([
      [[], ['ro']],
      [[], ['rw']],
    ]);
    expect(document.body.textContent, 'an entry still carries the literal `mount:` prefix').not.toMatch(/mount:/i);
  });

  // REQ-47 — the health check is a group of its own in reading, saying whether the container defines
  // one at all and, when it does, stating it **as the edit form states it**: the command without the
  // `CMD` / `CMD-SHELL` token the daemon prefixes it with, and the durations in seconds rather than
  // in the nanoseconds the daemon reports. An operator answers "is this container watched?" without
  // reading a raw array and without pressing `Edit configuration`.
  it('states the health check as the form states it: no CMD token, and durations in seconds', async () => {
    withInspect({
      env: [],
      ports: [],
      mounts: [],
      healthCheck: {
        test: ['CMD-SHELL', 'curl -f http://localhost/health || exit 1'],
        intervalNanos: 30_000_000_000,
        timeoutNanos: 5_000_000_000,
        retries: 3,
        startPeriodNanos: 10_000_000_000,
      },
    });

    const health = group(await configGroups(), 'Health check');
    expect(health.count, `the heading states "${health.count}" for a container that defines a probe`).toBe('enabled');
    expect(health.placeholder, 'a container that defines a probe is shown the "no probe" placeholder').toBeNull();

    const stated = Object.fromEntries(health.bands.map((band) => [band.label, band.value]));
    expect(Object.keys(stated), 'the group does not state the probe’s command and its four timings').toEqual([
      'Command',
      'Interval',
      'Timeout',
      'Retries',
      'Start period',
    ]);
    expect(stated.Command, 'the command still carries the token the daemon prefixes it with').toBe('curl -f http://localhost/health || exit 1');
    for (const [label, seconds] of [
      ['Interval', 30],
      ['Timeout', 5],
      ['Start period', 10],
    ] as const) {
      expect(Number.parseFloat(stated[label]), `${label} reads "${stated[label]}" rather than ${seconds} seconds`).toBe(seconds);
      expect(stated[label], `${label} reads "${stated[label]}", which is the nanosecond figure the daemon reports`).not.toMatch(/000000/);
    }
    expect(stated.Retries).toBe('3');
  });

  it('says a container that defines no probe defines none, rather than leaving the group blank', async () => {
    withInspect({ env: [], ports: [], mounts: [] });

    const health = group(await configGroups(), 'Health check');
    expect(health.count, `the heading states "${health.count}" for a container that defines no probe`).toBe('disabled');
    expect(health.bands, 'a container with no probe is shown timings anyway').toEqual([]);
    expect(health.placeholder, 'the group is drawn blank instead of saying the container defines no probe').not.toBeNull();
  });

  // REQ-50 — `Edit configuration` closes the tab: below every group and inside none of them, where
  // the edit form's own footer sits. **This reverses REQ-22's placement**, which this block and the
  // e2e spec both asserted at the head. Its box against the tab's trailing and bottom edges is
  // measured in the e2e spec; what jsdom answers is the order and the containment.
  it('closes the tab with Edit configuration, after every group and inside none of them', async () => {
    withInspect({ env: ['FOO=bar'], ports: [{ containerPort: 80, protocol: 'tcp' }], mounts: [] });

    const user = userEvent.setup();
    renderPanel();
    const action = await screen.findByRole('button', { name: 'Edit configuration' });
    const headings = Array.from(document.querySelectorAll('.ui-section-header'));
    expect(headings.map((header) => header.querySelector('.ui-section-header__title')?.textContent)).toEqual([
      'Runtime',
      'Health check',
      'Environment variables',
      'Port mappings',
      'Mounts',
    ]);
    for (const header of headings) {
      const position = action.compareDocumentPosition(header);
      expect(
        Boolean(position & Node.DOCUMENT_POSITION_PRECEDING),
        `the "${header.querySelector('.ui-section-header__title')?.textContent}" heading is drawn after the action, so the action does not close the tab`,
      ).toBe(true);
    }
    // Belonging to no group: not inside a card of the tab's, and not inside the pair either.
    expect(action.closest('.ui-surface'), 'the action is drawn inside one of the tab’s cards').toBeNull();
    expect(action.closest('.ui-grid'), 'the action is drawn inside the two-column pair, so it belongs to one of its columns').toBeNull();

    // What it does is unchanged.
    await user.click(action);
    expect(await screen.findByRole('combobox', { name: 'Restart policy' })).toBeInTheDocument();
  });
});

describe('ContainerDetailPanel — the inspect clock is scoped to the tab showing it (container-detail-panel.md)', () => {
  /**
   * The period container-detail-panel.md declares for the inspect data, in the
   * unscaled form a unit run uses: the timing scale is left at 1 here, so
   * `cadence(3000)` is 3 000 ms.
   */
  const DECLARED_PERIOD_MS = 3_000;

  function inspectReads(): number {
    return fetchMock.mock.calls.filter((call) => String(call[0]).includes('/inspect')).length;
  }

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  /** A tab switch under a fake clock, where userEvent's own timers cannot run. */
  async function openTab(name: string): Promise<void> {
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name }));
    });
  }

  // plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-26, REQ-28 — "the panel
  // tells useContainerDetail whether the active tab is Config or Inspect", and the detail opens on
  // Config, so the reading is taken from the moment it opens.
  it('follows the container while Config, the tab it opens on, is the active one', async () => {
    vi.useFakeTimers();
    try {
      renderPanel();
      await advance(0);
      expect(inspectReads()).toBe(1);

      await advance(DECLARED_PERIOD_MS);
      expect(inspectReads()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // …/REQ-28 — "on any other tab the reading is not taken at all"
  it('takes no reading at all while a tab that does not show it is the active one', async () => {
    vi.useFakeTimers();
    try {
      renderPanel();
      await advance(0);
      const whenOpened = inspectReads();

      await openTab('Logs');
      await advance(DECLARED_PERIOD_MS * 10);

      expect(inspectReads()).toBe(whenOpened);
    } finally {
      vi.useRealTimers();
    }
  });

  // …/REQ-28 — "Switching to either of the two reads at once, so the tab opens on what is true now
  // instead of on what was true when the detail was opened"
  it.each(['Config', 'Inspect'])('reads at once when %s becomes the active tab, without waiting for a period', async (tab) => {
    vi.useFakeTimers();
    try {
      renderPanel();
      await advance(0);
      await openTab('Logs');
      await advance(DECLARED_PERIOD_MS * 2);
      const whileAway = inspectReads();

      await openTab(tab);
      await advance(0);

      expect(inspectReads()).toBe(whileAway + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  // …/REQ-35 — "Nothing on the detail says its data is on a clock: no indicator, no 'last updated',
  // no control and no setting"
  it('says nothing anywhere about the data being on a clock', async () => {
    vi.useFakeTimers();
    try {
      renderPanel();
      await advance(0);

      for (const tab of ['Config', 'Inspect']) {
        await openTab(tab);
        await advance(DECLARED_PERIOD_MS);
        expect(screen.queryByText(/last updated|auto-refresh|refreshing every|every \d+ ?s/i)).not.toBeInTheDocument();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
