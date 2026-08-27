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

/**
 * **The Inspect tab, recomposed into two questions** —
 * `…-tabs_composition_refactor/REQ-34` … REQ-37, read off
 * `containers/specs/container-detail-panel.md`.
 *
 * The ten properties are two headed groups now, `State` is the pill every other
 * surface draws, a non-zero exit code carries the danger tone, and the raw
 * payload is a collapsible section closed on arrival. What the tab holds is read
 * through the headings an operator reads; the **column counts** each group shows
 * are geometry and belong to `container-detail-property-columns.spec.ts`, jsdom
 * laying nothing out.
 */
describe('ContainerDetailPanel — Inspect tab (REQ-26, REQ-34, REQ-35, REQ-36, REQ-37)', () => {
  function withInspect(overrides: Partial<ContainerInspect>): void {
    fetchMock.mockImplementation((url: string) =>
      url.includes('/inspect')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...baseInspect(), ...overrides }) })
        : Promise.resolve({ ok: configResponse.ok, status: configResponse.status, json: () => Promise.resolve(configResponse.body) }),
    );
  }

  /** Opens the tab and waits for the inspect data, on the first group's heading rather than on the payload. */
  async function openInspect(): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('tab', { name: 'Inspect' }));
    await screen.findByText('Identity');
    return user;
  }

  interface Group {
    title: string;
    bands: { label: string; value: string }[];
  }

  /** The tab's property groups: each `SectionHeader` and the definition list it heads. */
  function propertyGroups(): Group[] {
    return Array.from(document.querySelectorAll('.ui-section-header')).map((header) => {
      const list = header.parentElement?.querySelector(':scope > .ui-definition-list');
      return {
        title: header.querySelector('.ui-section-header__title')?.textContent ?? '',
        bands: Array.from(list?.children ?? []).map((row) => ({
          label: row.querySelector('.ui-definition-list__label')?.textContent ?? '',
          value: row.querySelector('.ui-definition-list__value')?.textContent ?? '',
        })),
      };
    });
  }

  function group(title: string): Group {
    const groups = propertyGroups();
    const found = groups.find((candidate) => candidate.title === title);
    expect(found, `no "${title}" group is drawn; the tab heads ${groups.map((one) => one.title).join(', ') || 'nothing'}`).toBeDefined();
    return found!;
  }

  /** The `Raw payload` section, whichever state it is in. */
  function payloadSection(): HTMLElement {
    const section = Array.from(document.querySelectorAll<HTMLElement>('.ui-collapsible-section')).find(
      (candidate) => candidate.querySelector('.ui-collapsible-section__title')?.textContent === 'Raw payload',
    );
    expect(section, 'the Inspect tab draws no `Raw payload` section').toBeDefined();
    return section!;
  }

  // REQ-34 — what the container **is** and how it **has gone** are two headed groups, not ten rows
  // presented as one list; each of the ten properties keeps the group its question belongs to.
  it('splits the ten properties into Identity and Lifecycle, each under its own heading', async () => {
    await openInspect();

    expect(propertyGroups().map((one) => one.title)).toEqual(['Identity', 'Lifecycle']);
    expect(group('Identity').bands.map((band) => band.label)).toEqual(['Id', 'Name', 'Image', 'Command', 'Entrypoint', 'Created']);
    expect(group('Lifecycle').bands.map((band) => band.label)).toEqual(['State', 'Started at', 'Finished at', 'Exit code']);
  });

  // REQ-35 — `State` reads as the pill, in the tone the module's one state→tone reading gives it
  // (`containers/specs/container-status.md`), and not as a word among the other values.
  it.each([
    ['running', 'success'],
    ['exited', 'neutral'],
    ['paused', 'warning'],
    ['dead', 'danger'],
  ])('draws the state of a %s container as a pill in that state’s own tone', async (status, tone) => {
    withInspect({ state: { status } });

    await openInspect();

    const stateBand = Array.from(document.querySelectorAll('.ui-definition-list__row')).find(
      (row) => row.querySelector('.ui-definition-list__label')?.textContent === 'State',
    );
    const pill = stateBand?.querySelector('.ui-badge');
    expect(pill, 'the state is drawn as a plain value rather than as a pill').not.toBeNull();
    expect(pill!.textContent).toBe(status.toUpperCase());
    // The badge encodes `neutral` as the absence of a tone modifier (`ui-library/specs/badge.md`),
    // so the tone is read the way the component writes it rather than by naming a class it never emits.
    const drawn = pill!.className.split(' ').find((name) => name.startsWith('ui-badge--tone-'))?.replace('ui-badge--tone-', '') ?? 'neutral';
    expect(drawn, `the state pill of a ${status} container is drawn ${drawn}, not in the ${tone} tone the module’s one reading gives it`).toBe(tone);
  });

  /** The tone class the `Exit code` value carries, or `null` when it carries none. */
  function exitCodeToneClass(): string | null {
    const band = Array.from(document.querySelectorAll('.ui-definition-list__row')).find(
      (row) => row.querySelector('.ui-definition-list__label')?.textContent === 'Exit code',
    );
    const value = band?.querySelector('.ui-definition-list__value');
    expect(value, 'the Lifecycle group draws no `Exit code` band').not.toBeNull();
    return value!.className.split(' ').find((name) => name.startsWith('ui-definition-list__value--tone-')) ?? null;
  }

  // REQ-36 — a non-zero exit code reads as bad news, in the application's own danger tone.
  it('draws a non-zero exit code in the danger tone', async () => {
    withInspect({ state: { status: 'exited', finishedAt: '2026-01-02T00:00:00Z', exitCode: 137 } });

    await openInspect();

    expect(group('Lifecycle').bands).toContainEqual({ label: 'Exit code', value: '137' });
    expect(exitCodeToneClass()).toBe('ui-definition-list__value--tone-danger');
  });

  // REQ-36 — and a zero one carries no tone at all: it is drawn like every other value.
  it('draws a zero exit code like any other value, with no tone of its own', async () => {
    withInspect({ state: { status: 'exited', finishedAt: '2026-01-02T00:00:00Z', exitCode: 0 } });

    await openInspect();

    expect(group('Lifecycle').bands).toContainEqual({ label: 'Exit code', value: '0' });
    expect(exitCodeToneClass(), 'a container that exited cleanly is drawn as bad news').toBeNull();
  });

  // REQ-36 — neither does a container that has not exited at all.
  it('gives the exit code of a running container no tone either', async () => {
    await openInspect();

    expect(exitCodeToneClass(), 'a running container’s absent exit code is drawn as bad news').toBeNull();
  });

  // REQ-41 — the signal name the mock draws beside the code ("137 · SIGKILL") is content the panel
  // does not have and does not acquire: the value is the daemon's own number and nothing else.
  it('adds no signal name beside the code it was given', async () => {
    withInspect({ state: { status: 'exited', finishedAt: '2026-01-02T00:00:00Z', exitCode: 137 } });

    await openInspect();

    expect(group('Lifecycle').bands.find((band) => band.label === 'Exit code')!.value).toBe('137');
  });

  // REQ-37 — the payload is a section like the tab's others and is **closed when the tab opens**:
  // nothing of it is on screen until its own header is pressed.
  it('draws the raw payload as a section closed when the tab opens', async () => {
    await openInspect();

    const header = payloadSection().querySelector('.ui-collapsible-section__header')!;
    expect(header.getAttribute('aria-expanded'), 'the raw payload section is open when the tab opens').toBe('false');
    expect(payloadSection().querySelector('.ui-collapsible-section__summary')?.textContent).toBe('JSON');
    expect(document.querySelectorAll('.ui-code-viewer'), 'the payload is drawn before its section has been opened').toHaveLength(0);
  });

  /**
   * plan-docker_management_app/REQ-26, **narrowed on 2026-08-14** to *viewable
   * and selectable* as-is (plan-docker_management_app-remove_copy_controls/REQ-23),
   * and re-asserted **through the now-collapsed section**
   * (`…-tabs_composition_refactor/REQ-37`, REQ-43): the payload's completeness is
   * the whole serialised payload, character for character, once the section is
   * open — `plan-ui-coherence-optimisation/REQ-65` names it among the three things
   * this panel must not lose, and one press before it is on screen is not a loss.
   */
  it('shows the raw inspect payload verbatim once its section is opened, exactly as the Engine returned it', async () => {
    const user = await openInspect();

    await user.click(within(payloadSection()).getByRole('button'));

    expect(await screen.findByText(/raw-container-1-id/)).toBeInTheDocument();
    const blocks = Array.from(document.querySelectorAll('.ui-code-viewer__code'));
    expect(blocks.at(-1)).toHaveTextContent(JSON.stringify(baseInspect().raw, null, 2), { normalizeWhitespace: false });
  });

  // container-detail-panel.md — the block offers no action of its own, in either state: obtaining
  // the full id from it is a hand-selection inside it
  // (`plan-docker_management_app-remove_copy_controls/REQ-19`), and what the header adds is one
  // press and nothing else.
  it('offers no action of its own inside the payload block once it is open', async () => {
    const user = await openInspect();

    await user.click(within(payloadSection()).getByRole('button'));

    const block = document.querySelector('.ui-code-viewer')!;
    expect(block.querySelectorAll('button, a, [role="button"]'), 'the payload block carries a control of its own').toHaveLength(0);
    expect(block.querySelectorAll('.ui-code-viewer__actions'), 'the action row survived the control it held').toHaveLength(0);
  });
});

// container-detail-panel.md — "A collapsible section with nothing in it is not drawn", one rule
// shared with the image panel: `Networks` and `Labels` appear only when they hold at least one
// entry, so a section headed with a count of `0` cannot occur. `Raw payload` is unconditional and
// stands among them in every case (`…-tabs_composition_refactor/REQ-37`).
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
    // The tab's first heading, not the payload: the payload's section is closed on arrival now.
    await screen.findByText('Identity');
    return Array.from(document.querySelectorAll('.ui-collapsible-section')).map((section) => ({
      title: section.querySelector('.ui-collapsible-section__title')?.textContent ?? '',
      summary: section.querySelector('.ui-collapsible-section__summary')?.textContent ?? '',
    }));
  }

  it('draws no section at all for a container attached to no network and declaring no label, beyond the payload', async () => {
    withInspect({ networks: [], labels: {} });

    expect(await inspectTabSections()).toEqual([{ title: 'Raw payload', summary: 'JSON' }]);
  });

  it('draws no Labels section for a container declaring none, while Networks keeps its own', async () => {
    withInspect({ networks: [{ name: 'bridge' }], labels: {} });

    expect(await inspectTabSections()).toEqual([
      { title: 'Networks', summary: '1' },
      { title: 'Raw payload', summary: 'JSON' },
    ]);
  });

  it('draws both sections, each headed with its own count, when both have content', async () => {
    withInspect({ networks: [{ name: 'bridge' }], labels: { 'com.docker.compose.project': 'shop', team: 'platform' } });

    expect(await inspectTabSections()).toEqual([
      { title: 'Networks', summary: '1' },
      { title: 'Labels', summary: '2' },
      { title: 'Raw payload', summary: 'JSON' },
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
