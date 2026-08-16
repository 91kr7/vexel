import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComposeFileContent, ComposeProjectSummary, ComposeValidationResult } from '../../src/data/compose-client';

/**
 * F11 — the compose screen
 * (`plan-ui-coherence-optimisation/REQ-49`, `REQ-50`, `REQ-51`;
 * `compose/specs/compose-screen.md`).
 *
 * The three data hooks are mocked, so what is under test is the screen's own
 * contract: that the projects are the rows of **one** list and their services
 * the rows of a nested one, which column each value is stated in, that no
 * project is selected until one is clicked, and — the newest code in the batch —
 * that **every** route which would discard an unsaved compose edit asks first,
 * and that a refused confirmation leaves the selection and the edit exactly where
 * they were.
 *
 * What a jsdom render can say about a row is **structural**. The boxes — the
 * uniform row heights, the panel at the list's own width, the editor and the log
 * stream with it, the property grid's column count, the cluster hit-testable at
 * each control's own centre, the empty state's title on one line — are measured
 * in a browser: `e2e/compose-row-geometry.spec.ts`. Neither replaces the other.
 */

/** What the file hook is holding for each project, set per test. */
let filesByProject: Record<string, ComposeFileContent[]> = {};
let validationResult: ComposeValidationResult | undefined;

const saved: { path: string; content: string }[] = [];
const validate = vi.fn();
const up = vi.fn();
const down = vi.fn();
const restart = vi.fn();
const scale = vi.fn();
const onRefresh = vi.fn();

/**
 * A working stand-in for the file hook rather than a frozen value: the guard
 * under test is driven by the buffer becoming dirty, so the fake has to track an
 * edit exactly as the real hook does — per path, cleared by a save.
 */
vi.mock('../../src/data/use-compose-file', async () => {
  const { useCallback, useState } = await import('react');
  return {
    useComposeFile: (projectName?: string) => {
      const [edits, setEdits] = useState<Record<string, string>>({});
      const files = (projectName ? (filesByProject[projectName] ?? []) : []).map((file) => ({
        ...file,
        content: edits[file.path] ?? file.content,
      }));
      const edit = useCallback((path: string, content: string) => {
        setEdits((current) => ({ ...current, [path]: content }));
      }, []);
      const save = useCallback(async (path: string) => {
        setEdits((current) => {
          saved.push({ path, content: current[path] ?? '' });
          const { [path]: _discarded, ...rest } = current;
          return rest;
        });
        return true;
      }, []);
      return {
        files,
        loaded: true,
        dirtyPaths: Object.keys(edits),
        saving: false,
        validation: validationResult,
        validating: false,
        edit,
        save,
        validate,
      };
    },
  };
});

vi.mock('../../src/data/use-compose-lifecycle', () => ({
  useComposeLifecycle: () => ({ runningProjects: [], up, down, restart, scale }),
}));

/** The projects whose aggregated stream the screen asked for, in the order it asked. */
const subscribed: (string | undefined)[] = [];

vi.mock('../../src/data/use-compose-logs', () => ({
  useComposeLogs: (projectName?: string) => {
    subscribed.push(projectName);
    return { lines: [], connected: false, ended: false, clear: () => {}, restart: () => {} };
  },
}));

const { ComposeScreen } = await import('../../src/compose/ComposeScreen');
const { ConfirmationProvider } = await import('../../src/shell/services/ConfirmationService');
const { ErrorReportingProvider } = await import('../../src/shell/services/ErrorReportingService');
const { ProgressProvider } = await import('../../src/shell/services/ProgressService');
const { ToastProvider } = await import('../../src/ui');

function project(overrides: Partial<ComposeProjectSummary> = {}): ComposeProjectSummary {
  return {
    name: 'alpha',
    configFiles: ['/srv/alpha/docker-compose.yml'],
    state: 'running',
    services: [{ name: 'web', image: 'alpine:3.20', state: 'running', replicas: 1 }],
    ...overrides,
  };
}

function renderScreen(projects: ComposeProjectSummary[], loaded = true, error?: string) {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <ComposeScreen projects={projects} loaded={loaded} error={error} onRefresh={onRefresh} />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
}

/**
 * The screen's one list: the outer object list, the projects' own.
 *
 * Found by the table itself and not through the heading naming the screen: since
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`
 * the section header sits **above** the one unpadded card holding the list, so a
 * card can no longer be found by the heading it used to hold.
 */
function list(): HTMLElement {
  const found = document.querySelector('.ui-data-table');
  expect(found, 'the screen draws no object list').not.toBeNull();
  return found as HTMLElement;
}

/** The list's own card — the one surface on this screen, holding the table and nothing else. */
function card(): HTMLElement {
  return list().closest('.ui-surface') as HTMLElement;
}

/** A project row is a row of the outer list; a service row lives in a project row's content slot. */
function projectRows(): HTMLElement[] {
  return Array.from(list().querySelectorAll<HTMLElement>('.ui-data-table__row')).filter(
    (row) => row.closest('.ui-data-table__row-content') === null,
  );
}

function serviceRowsOf(projectName: string): HTMLElement[] {
  // The row's **own** content slot: its next sibling in the list's body. A row and
  // the content it carries are siblings there, one presentation having no carrier
  // element around them, so a probe reading the body would find the first project's
  // services whichever project it was asked about.
  const content = rowOf(projectName).nextElementSibling;
  return content?.matches('.ui-data-table__row-content') === true
    ? Array.from(content.querySelectorAll<HTMLElement>('.ui-data-table__row'))
    : [];
}

function headers(): string[] {
  return Array.from(list().querySelectorAll('.ui-data-table__header-cell')).map((cell) => (cell.textContent ?? '').trim());
}

function rowOf(name: string): HTMLElement {
  const found = projectRows().find((row) => (row.textContent ?? '').includes(name));
  expect(found, `no row of the list states ${name}`).toBeDefined();
  return found!;
}

/**
 * The cell of a row belonging to the column whose header matches `header`.
 *
 * Read through the header rather than by position, which is what `data-table.md`
 * guarantees: a value asserted this way is asserted to be **in its own column**.
 */
function cellOf(row: HTMLElement, header: RegExp): HTMLElement {
  const index = headers().findIndex((label) => header.test(label));
  expect(index, `no column is headed ${header} — headers are ${JSON.stringify(headers())}`).toBeGreaterThanOrEqual(0);
  return Array.from(row.querySelectorAll<HTMLElement>('.ui-data-table__cell')).filter(
    (cell) => cell.closest('.ui-data-table__row') === row,
  )[index];
}

function textOf(element: HTMLElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The lines a cell draws, in order. */
function linesOf(cell: HTMLElement): string[] {
  return Array.from(
    cell.querySelectorAll<HTMLElement>(
      '.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell, .ui-table-badge-list-cell',
    ),
  ).map(textOf);
}

function panel(): HTMLElement | null {
  return card().querySelector('.ui-detail-panel');
}

function editor(): HTMLTextAreaElement {
  const found = panel()?.querySelector<HTMLTextAreaElement>('.ui-code-editor__textarea');
  expect(found, 'the panel draws no compose editor').toBeTruthy();
  return found!;
}

function confirmDialog(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll('.ui-modal h2, .ui-modal h3, .ui-modal [role="heading"]')).find(
    (node) => (node.textContent ?? '').startsWith('Confirm: '),
  );
  return (heading?.closest('.ui-modal') as HTMLElement | undefined) ?? null;
}

/** Selecting a project the way the operator does: clicking the row's first cell. */
async function selectProject(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(cellOf(rowOf(name), /^PROJECT$/i));
}

/** Types into the open panel's editor, which is what makes the compose buffer dirty. */
async function editTheBuffer(user: ReturnType<typeof userEvent.setup>, marker: string): Promise<void> {
  await user.click(editor());
  await user.paste(marker);
  await waitFor(() => expect(panel()!.querySelector('.ui-code-editor__dirty'), 'the buffer does not read as dirty').not.toBeNull());
}

const TWO_FILES = [
  { path: '/srv/beta/docker-compose.yml', content: 'services:\n  cache: {}\n' },
  { path: '/srv/beta/docker-compose.override.yml', content: 'services:\n  cache:\n    environment: []\n' },
];

beforeEach(() => {
  filesByProject = { alpha: [{ path: '/srv/alpha/docker-compose.yml', content: 'services:\n  web: {}\n' }] };
  validationResult = undefined;
  saved.length = 0;
  subscribed.length = 0;
  validate.mockReset();
  up.mockReset();
  down.mockReset();
  restart.mockReset();
  scale.mockReset();
  onRefresh.mockReset();
});

afterEach(cleanup);

describe('ComposeScreen — one list, projects and their services (REQ-49)', () => {
  // REQ-49 — "Compose lists its projects with the object-list primitive … each project is a row,
  // with its actions in the cluster"; compose-screen.md — "one full-width list of projects … alone
  // in an unpadded card it fills edge to edge, and nothing beside it. Each project row carries its
  // services as a nested header-less list of the same component", which takes no surface of its own.
  //
  // **Contract and state only, and that is deliberate** (`.../classic-table/REQ-31`): every box is
  // zero in jsdom, so "the rows are flush" or "the child is indented" would pass here on any build,
  // the rejected one included. The indentation, the row heights, the one enclosing surface and the
  // group's closing hairline are measured in a browser, by
  // `e2e/classic-table-criteria-nested-lists.spec.ts`. What is asserted here is which props the call
  // site states and what the tree therefore holds.
  it('lists the projects on one object list, each row carrying its services as a nested list of the same component', () => {
    renderScreen([project({ name: 'alpha' }), project({ name: 'beta', services: [] })]);

    expect(list(), 'the screen draws no object list').not.toBeNull();
    // The retired presentation is not asked for anywhere on this screen — neither on the projects
    // list nor on the nested one — and no row of either carries a modifier of its own
    // (`.../classic-table/REQ-39`).
    expect(document.querySelectorAll('.ui-data-table--comfortable'), 'a list on this screen still asks for the retired presentation').toHaveLength(0);
    expect(
      Array.from(document.querySelectorAll('.ui-data-table__row'))
        .flatMap((row) => Array.from(row.classList))
        .filter((name) => name !== 'ui-data-table__row' && name !== 'ui-data-table__row--selected'),
      'a row of this screen states a modifier the reference row does not',
    ).toEqual([]);
    expect(projectRows()).toHaveLength(2);

    // The three components this migration refuses: the retired grouped-rows panel, the hand-built
    // card list, and the pair that used to halve the screen.
    expect(document.querySelectorAll('.ui-grouped-rows-panel'), 'the retired grouped-rows panel is still drawn').toHaveLength(0);
    expect(document.querySelectorAll('.ui-card-list'), 'the screen draws a hand-built card list').toHaveLength(0);
    expect(document.querySelectorAll('.ui-grid'), 'a Grid still lays something out beside the list').toHaveLength(0);

    // REQ-40 — the composition containers and images ship: the section header **above** the card,
    // and one card holding the table and nothing else. The header is still drawn; what changed is
    // which side of the surface it is on.
    const sectionHeader = screen.getByRole('heading', { name: 'Compose projects' });
    expect(card(), 'the list sits in no surface at all').not.toBeNull();
    expect(card().contains(sectionHeader), 'the section header is inside the list’s own card').toBe(false);
    expect(Array.from(card().children).map((child) => child.className), 'the list’s card holds something besides the table').toEqual([
      expect.stringContaining('ui-data-table'),
    ]);
    expect(
      card().parentElement?.closest('.ui-surface') ?? null,
      'the list’s card sits inside another surface, so the list has two',
    ).toBeNull();

    // REQ-7 — every project row states its services through the library's own prop: one nested list
    // per row, drawing no header, and **no wrapper of its own** between it and the row's content
    // slot. A surface anywhere inside the table would be the retired presentation under another name.
    for (const name of ['alpha', 'beta']) {
      const content = rowOf(name).nextElementSibling as HTMLElement | null;
      expect(content?.className, `the ${name} row carries no content slot below its cells`).toContain('ui-data-table__row-content');
      const nested = content!.firstElementChild as HTMLElement | null;
      expect(nested?.className, `the ${name} row's services are not stated as a nested list of the same component`).toContain(
        'ui-data-table--nested',
      );
      expect(nested!.querySelectorAll('.ui-data-table__header'), `the ${name} row's service list draws a header of its own`).toHaveLength(0);
    }
    expect(list().querySelectorAll('.ui-surface'), 'a surface is drawn inside the projects table').toHaveLength(0);
  });

  // compose-screen.md — "inside every project row, **opened or not**: one row per service (name
  // order) with its name, the daemon's own word for its state, its image and its replicas
  // `Stepper`."
  it('states every service with its own state, image and stepper without anything being selected', () => {
    renderScreen([
      project({
        name: 'alpha',
        services: [
          { name: 'api', image: 'alpine:3.20', state: 'running', replicas: 1 },
          { name: 'worker', image: 'busybox:1', state: 'exited', replicas: 0 },
        ],
      }),
    ]);

    expect(panel(), 'a project was selected before anything was clicked').toBeNull();

    const services = serviceRowsOf('alpha');
    expect(services).toHaveLength(2);
    expect(services.map((row) => textOf(row))).toEqual([
      expect.stringContaining('api'),
      expect.stringContaining('worker'),
    ]);
    // The daemon's own word for the state, not the project's.
    expect(textOf(services[0])).toContain('running');
    expect(textOf(services[1])).toContain('exited');
    expect(textOf(services[0])).toContain('alpine:3.20');
    expect(textOf(services[1])).toContain('busybox:1');
    expect(within(services[1]).getByRole('button', { name: 'Increase worker replicas' })).toBeInTheDocument();
  });

  // compose-screen.md — "one row per project … with: the project name, its state (`Up` / `Partial` /
  // `Down` / `Unknown`, in a tone and in words), how many of its services are running, its discovered
  // compose file path(s), and the daemon's own message where the project could not be read (`–`
  // where there is none)."
  it('states each value of a project in a column of its own', () => {
    renderScreen([
      project({
        name: 'alpha',
        state: 'partial',
        configFiles: ['/srv/alpha/docker-compose.yml', '/srv/alpha/docker-compose.override.yml'],
        services: [
          { name: 'api', image: 'alpine:3.20', state: 'running', replicas: 1 },
          { name: 'worker', image: 'alpine:3.20', state: 'exited', replicas: 0 },
        ],
      }),
    ]);

    const row = rowOf('alpha');
    expect(textOf(cellOf(row, /^PROJECT$/i))).toBe('alpha');
    expect(textOf(cellOf(row, /^STATE$/i))).toBe('Partial');
    expect(textOf(cellOf(row, /SERVICES UP/i))).toBe('1/2');
    expect(textOf(cellOf(row, /COMPOSE FILES/i))).toContain('/srv/alpha/docker-compose.override.yml');
    expect(textOf(cellOf(row, /DOCKER REPORTS/i)), 'a readable project explains itself anyway').toMatch(/^[-–—]$/);
  });

  // compose-screen.md — "Every cell of a project row is the same number of lines whatever the
  // project's state: the discovered file paths and the daemon's refusal to read the project are
  // columns of their own, not a shared subtitle line, so a project that carries neither costs its row
  // no height."
  it('draws the same number of lines in a column whatever the project carries', () => {
    renderScreen([
      project({ name: 'complete', configFiles: ['/srv/complete/docker-compose.yml'] }),
      project({ name: 'bare', configFiles: [], state: 'stopped' }),
      project({ name: 'unreadable', configFiles: [], state: 'unknown', error: 'no configuration file provided' }),
    ]);

    // The premise: the line probe really does see the lines of a cell.
    expect(linesOf(cellOf(rowOf('complete'), /COMPOSE FILES/i)), 'the line probe finds nothing at all').toHaveLength(1);

    for (const header of headers().filter((label) => label !== '' && !/^ACTIONS$/i.test(label))) {
      const pattern = new RegExp(`^${header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const complete = linesOf(cellOf(rowOf('complete'), pattern));
      for (const name of ['bare', 'unreadable']) {
        expect(
          linesOf(cellOf(rowOf(name), pattern)).length,
          `the ${header} cell draws ${complete.length} line(s) on the complete row and another number on ${name}`,
        ).toBe(complete.length);
      }
    }

    // …and the two values that used to share a subtitle line are each in their own column.
    expect(textOf(cellOf(rowOf('unreadable'), /DOCKER REPORTS/i))).toContain('no configuration file provided');
    expect(textOf(cellOf(rowOf('unreadable'), /COMPOSE FILES/i)), 'the daemon’s message rode into the files column').not.toContain(
      'no configuration',
    );
  });

  // compose-screen.md — "'Restart' (row) → restarts the project's stack. 'Up' (stopped/unknown
  // project) → brings the stack up; 'Down' (running/partial project) → asks for confirmation, then
  // brings it down."
  it('offers Restart on every row, and Up or Down according to the project’s state', () => {
    renderScreen([
      project({ name: 'running-one', state: 'running' }),
      project({ name: 'partial-one', state: 'partial' }),
      project({ name: 'stopped-one', state: 'stopped' }),
      project({ name: 'unknown-one', state: 'unknown' }),
    ]);

    const clusterOf = (name: string) =>
      Array.from((rowOf(name).querySelector('.ui-action-button-group') as HTMLElement).querySelectorAll('button')).map(
        (button) => (button.textContent ?? '').trim(),
      );

    expect(clusterOf('running-one')).toEqual(['Restart', 'Down']);
    expect(clusterOf('partial-one')).toEqual(['Restart', 'Down']);
    expect(clusterOf('stopped-one')).toEqual(['Restart', 'Up']);
    expect(clusterOf('unknown-one')).toEqual(['Restart', 'Up']);
  });

  // compose-screen.md — "'Down' … asks for confirmation, then brings it down", and cancelling
  // performs nothing.
  it('asks before bringing a stack down, and a cancelled confirmation brings nothing down', async () => {
    const user = userEvent.setup();
    renderScreen([project({ name: 'alpha', state: 'running' })]);

    await user.click(within(rowOf('alpha')).getByRole('button', { name: 'Down' }));
    await waitFor(() => expect(confirmDialog(), 'bringing a stack down asked nothing').not.toBeNull());
    expect(textOf(confirmDialog()!)).toContain('alpha');

    await user.click(within(confirmDialog()!).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(down, 'a cancelled confirmation brought the stack down anyway').not.toHaveBeenCalled();

    await user.click(within(rowOf('alpha')).getByRole('button', { name: 'Down' }));
    await waitFor(() => expect(confirmDialog()).not.toBeNull());
    await user.click(within(confirmDialog()!).getByRole('button', { name: 'Down' }));
    await waitFor(() => expect(down).toHaveBeenCalledWith('alpha'));

    // …and bringing one up asks nothing at all.
    expect(up).not.toHaveBeenCalled();
  });

  // compose-screen.md — "a service's replicas `Stepper` → scales that service to the chosen count,
  // **without selecting the project**."
  it('scales a service from its own row without selecting the project', async () => {
    const user = userEvent.setup();
    renderScreen([project({ name: 'alpha', services: [{ name: 'web', image: 'alpine:3.20', state: 'running', replicas: 1 }] })]);

    await user.click(within(serviceRowsOf('alpha')[0]).getByRole('button', { name: 'Increase web replicas' }));

    expect(scale).toHaveBeenCalledWith('alpha', 'web', 2);
    expect(panel(), 'scaling a service selected the project').toBeNull();
  });
});

describe('ComposeScreen — the detail panel (REQ-50)', () => {
  // compose-screen.md — "No project is selected when the screen opens" and "The aggregated log
  // stream is subscribed only while a project's panel is open."
  it('selects no project when it opens, and subscribes to no aggregated stream until one is open', async () => {
    const user = userEvent.setup();
    renderScreen([project({ name: 'alpha' })]);

    expect(panel(), 'a project’s panel was open before anything was clicked').toBeNull();
    expect(subscribed.filter((name) => name !== undefined), 'the screen subscribed to a stream nobody asked for').toEqual([]);

    await selectProject(user, 'alpha');
    await waitFor(() => expect(panel(), 'the row opened no detail panel').not.toBeNull());
    expect(subscribed.at(-1), 'opening a project’s panel subscribed to no stream').toBe('alpha');

    await selectProject(user, 'alpha');
    await waitFor(() => expect(panel(), 'the row that opened the panel did not close it').toBeNull());
    expect(subscribed.at(-1), 'the stream outlived the panel that held it').toBeUndefined();
  });

  // REQ-50 — "A project's detail is revealed by the detail-panel primitive, full width, two-column
  // grid, tabs where the screen needs them"; compose-screen.md — the properties "over two views of
  // it — `Compose file` … `Aggregated logs`".
  it('reveals the project’s properties and its two views on the detail-panel primitive', async () => {
    const user = userEvent.setup();
    renderScreen([project({ name: 'alpha', state: 'running', services: [{ name: 'web', image: 'alpine:3.20', state: 'running', replicas: 1 }] })]);

    await selectProject(user, 'alpha');
    await waitFor(() => expect(panel()).not.toBeNull());

    const bands = Array.from(panel()!.querySelectorAll('.ui-definition-list__row')).map((band) =>
      textOf(band as HTMLElement),
    );
    expect(bands, 'the panel does not state the project’s properties through the primitive').toEqual([
      'Projectalpha',
      'StateUp',
      'Services running1 of 1',
      'Compose files/srv/alpha/docker-compose.yml',
    ]);

    const tabs = Array.from(panel()!.querySelectorAll('[role="tab"]')).map((tab) => (tab.textContent ?? '').trim());
    expect(tabs, 'the panel does not offer the file and the logs as two views of one panel').toEqual([
      'Compose file',
      'Aggregated logs',
    ]);
  });

  // detail-panel.md, `opening-gesture` — "the panel presents **no** close control … `Escape` calls
  // `onClose` instead"; compose-screen.md — "The panel is dismissed exactly as every other panel in
  // the product is."
  it('presents no close control of its own', async () => {
    const user = userEvent.setup();
    renderScreen([project({ name: 'alpha' })]);

    await selectProject(user, 'alpha');
    await waitFor(() => expect(panel()).not.toBeNull());

    expect(
      within(panel()!).queryByRole('button', { name: 'Close detail' }),
      'the panel presents a close control of its own',
    ).toBeNull();
  });

  // compose-screen.md — "One project's detail is open at a time."
  it('opens one project’s detail at a time', async () => {
    const user = userEvent.setup();
    filesByProject.beta = TWO_FILES;
    renderScreen([project({ name: 'alpha' }), project({ name: 'beta' })]);

    await selectProject(user, 'alpha');
    await waitFor(() => expect(panel()).not.toBeNull());
    await selectProject(user, 'beta');

    await waitFor(() => expect(textOf(panel()!)).toContain('beta'));
    expect(card().querySelectorAll('.ui-detail-panel'), 'a second panel was opened beside the first').toHaveLength(1);
  });

  // compose-screen.md — "The row-level `Validate` is gone … Validation, its summary line and its
  // on-demand nature are unchanged in the panel."
  it('offers Validate and Save inside the panel and nowhere on the row', async () => {
    const user = userEvent.setup();
    renderScreen([project({ name: 'alpha' })]);

    expect(within(rowOf('alpha')).queryByRole('button', { name: 'Validate' }), 'a row-level Validate survives').toBeNull();

    await selectProject(user, 'alpha');
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(within(panel()!).getByRole('button', { name: 'Validate' })).toBeInTheDocument();

    await user.click(within(panel()!).getByRole('button', { name: 'Validate' }));
    expect(validate).toHaveBeenCalled();
  });
});

describe('ComposeScreen — the editable buffer is guarded on every route (REQ-50)', () => {
  /**
   * compose-screen.md — "while the buffer is dirty, **every** route that would
   * discard it (the panel's `Escape`, the row that closes it, another project's
   * row) confirms first, and a refused confirmation leaves both the panel and the
   * edit standing".
   *
   * Each route is driven separately and on purpose: a guard covering one of them
   * and not the others passes any check written against the requirement's wording
   * alone, and is exactly the defect this shape exists to prevent.
   */
  const MARKER = '# vexel-unit-dirty-marker';

  async function openAndDirty(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await selectProject(user, 'alpha');
    await waitFor(() => expect(panel()).not.toBeNull());
    await editTheBuffer(user, MARKER);
  }

  it('asks before the row that closes the open project discards the edit, and Cancel leaves both standing', async () => {
    const user = userEvent.setup();
    renderScreen([project({ name: 'alpha' }), project({ name: 'beta' })]);
    await openAndDirty(user);
    const edited = editor().value;

    await selectProject(user, 'alpha');
    await waitFor(() => expect(confirmDialog(), 'the open project’s own row discarded the edit without asking').not.toBeNull());
    expect(panel(), 'the panel closed while the confirmation was still open').not.toBeNull();

    await user.click(within(confirmDialog()!).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(panel(), 'Cancel closed the panel anyway').not.toBeNull();
    expect(editor().value, 'Cancel discarded the edit it refused to discard').toBe(edited);

    await selectProject(user, 'alpha');
    await waitFor(() => expect(confirmDialog()).not.toBeNull());
    await user.click(within(confirmDialog()!).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(panel(), 'the confirmed discard left the panel open').toBeNull());
  });

  it('asks before another project’s row discards the edit, and Cancel leaves the selection where it was', async () => {
    const user = userEvent.setup();
    filesByProject.beta = TWO_FILES;
    renderScreen([project({ name: 'alpha' }), project({ name: 'beta' })]);
    await openAndDirty(user);
    const edited = editor().value;

    await selectProject(user, 'beta');
    await waitFor(() => expect(confirmDialog(), 'another project’s row discarded the edit without asking').not.toBeNull());

    await user.click(within(confirmDialog()!).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(panel(), 'Cancel closed the panel anyway').not.toBeNull();
    expect(textOf(panel()!), 'a refused confirmation moved the selection to the other project').toContain('alpha');
    expect(editor().value, 'the refused switch discarded the edit').toBe(edited);

    // …and a confirmed switch really does move to the other project.
    await selectProject(user, 'beta');
    await waitFor(() => expect(confirmDialog()).not.toBeNull());
    await user.click(within(confirmDialog()!).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(textOf(panel()!), 'the confirmed switch did not open the row that was clicked').toContain('beta'));
  });

  // The control case the guard has to be read against: with a **clean** buffer none of the routes
  // asks anything. Without it, a screen that confirmed on every click would pass everything above.
  it('asks nothing at all while the buffer is clean', async () => {
    const user = userEvent.setup();
    filesByProject.beta = TWO_FILES;
    renderScreen([project({ name: 'alpha' }), project({ name: 'beta' })]);

    await selectProject(user, 'alpha');
    await waitFor(() => expect(panel()).not.toBeNull());
    await selectProject(user, 'beta');
    await waitFor(() => expect(textOf(panel()!)).toContain('beta'));
    expect(confirmDialog(), 'a clean switch asked for a confirmation').toBeNull();

    await selectProject(user, 'beta');
    await waitFor(() => expect(panel()).toBeNull());
    expect(confirmDialog(), 'a clean close asked for a confirmation').toBeNull();
  });

  // compose-screen.md — "'Save' (compose file view, enabled only while the active file is dirty) →
  // asks for confirmation, then writes the active file back to disk."
  it('enables Save only on a dirty file, and writes only after the confirmation', async () => {
    const user = userEvent.setup();
    renderScreen([project({ name: 'alpha' })]);

    await selectProject(user, 'alpha');
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(within(panel()!).getByRole('button', { name: 'Save' })).toBeDisabled();

    await editTheBuffer(user, MARKER);
    expect(within(panel()!).getByRole('button', { name: 'Save' })).toBeEnabled();

    await user.click(within(panel()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(confirmDialog(), 'Save wrote the file back without asking').not.toBeNull());
    await user.click(within(confirmDialog()!).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(saved, 'a cancelled confirmation wrote the file back anyway').toEqual([]);

    await user.click(within(panel()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(confirmDialog()).not.toBeNull());
    await user.click(within(confirmDialog()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].path).toBe('/srv/alpha/docker-compose.yml');
    expect(saved[0].content, 'the confirmed save did not write the edit it was confirming').toContain(MARKER);
  });
});

describe('ComposeScreen — no compose project at all (REQ-51)', () => {
  // REQ-51 — "`No compose projects` becomes a real empty state, on a surface, with a title, one line
  // and the resolving action — replacing bare text on no surface."
  it('states the empty result on the primitive, with a title, a line and the action that resolves it', () => {
    renderScreen([]);

    const empty = card().querySelector('.ui-empty-state') as HTMLElement;
    expect(empty, 'the empty result is not stated on the empty-state primitive').not.toBeNull();
    expect(textOf(empty.querySelector('.ui-empty-state__title') as HTMLElement)).toBe('No compose projects');
    const description = empty.querySelector('.ui-empty-state__description') as HTMLElement | null;
    expect(description, 'the empty state states no line of explanation').not.toBeNull();
    expect(textOf(description!).length, 'the empty state explains nothing').toBeGreaterThan(20);
    expect(Array.from(empty.querySelectorAll('button')).map((button) => (button.textContent ?? '').trim())).toEqual([
      'Check again',
    ]);
  });

  it('re-reads the project list from the empty state’s own action', async () => {
    const user = userEvent.setup();
    renderScreen([]);

    await user.click(within(card().querySelector('.ui-empty-state') as HTMLElement).getByRole('button', { name: 'Check again' }));

    expect(onRefresh, 'Check again re-read nothing').toHaveBeenCalled();
  });

  // compose-screen.md — a list still being read is not a list with nothing to show: the two states
  // are two elements, and only the second offers the action.
  it('draws the reading and the empty result as two different states', () => {
    renderScreen([], false);

    const empty = card().querySelector('.ui-empty-state') as HTMLElement;
    expect(textOf(empty.querySelector('.ui-empty-state__title') as HTMLElement)).toBe('Loading compose projects…');
    expect(empty.querySelector('.ui-empty-state__description'), 'the loading state explains an emptiness it has not established').toBeNull();
    expect(empty.querySelectorAll('button'), 'the loading state offers an action that resolves nothing').toHaveLength(0);
  });
});
