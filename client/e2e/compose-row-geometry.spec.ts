/**
 * F11 — the compose screen, measured
 * (`plan-ui-coherence-optimisation/REQ-49`, `REQ-50`, `REQ-51`;
 * `compose/specs/compose-screen.md`).
 *
 * Every claim here is about **boxes, paint and routes**. A project row that has
 * lost the services it carries, a panel drawn at a third of the screen, an
 * editor 39px wide, a title wrapping one character per line, a panel that
 * dismisses itself and takes an unsaved edit with it — none of them change what
 * the screen *says*; what they change is where its rectangles are, or which
 * request the browser makes (CLAUDE.md, "What a check drives, and what it
 * measures"). So the assertions are on viewport boxes, on painted ink and on the
 * requests the page issues, and every control is driven with a **real pointer at
 * the visible control's own coordinates**.
 *
 * **The project inventory is answered in the browser, and that is deliberate.**
 * This machine runs no compose project, and creating one to obtain a row would
 * put containers and a network on the operator's own daemon for the duration of
 * a layout measurement. Answering `GET /api/compose/projects` (and the file
 * read, the validation and the aggregated stream) in the page gives every row
 * state at once — three projects of three, two and one services, one `partial`,
 * one `unknown` with no config file and carrying the daemon's own error — at
 * every viewport, and touches nothing on the machine. That is the precedent
 * batches 8 and 10 set.
 *
 * **No lifecycle control is ever clicked.** `up`, `down`, `restart` and `scale`
 * act on a real daemon through a real `docker compose`, so the cluster is
 * *hit-tested* at each control's own centre rather than operated, and those four
 * routes are aborted in the page so that a mistake here cannot reach the daemon
 * at all.
 *
 * What that costs is stated rather than hidden: this file says nothing about the
 * server's own reading of the daemon, nor about the lifecycle commands. That
 * half is `compose.spec.ts`, which drives a real project.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';

interface Viewport {
  width: number;
  height: number;
}

/** The three viewports this plan is written against. */
const VIEWPORTS: Viewport[] = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

interface ServiceFixture {
  name: string;
  image: string;
  state: string;
  replicas: number;
}

interface ProjectFixture {
  name: string;
  configFiles: string[];
  state: 'running' | 'partial' | 'stopped' | 'unknown';
  services: ServiceFixture[];
  error?: string;
}

/** The daemon's own message about a project it could not read. */
const GAMMA_ERROR = 'no configuration file provided: not found';

/**
 * Three projects, in the name order the discovery service returns them in, and
 * differing in every value whose presence used to decide a row's height: the
 * number of services, the discovered file paths, and the daemon's own refusal to
 * read the project. The two of them that shared a subtitle line are columns now
 * (`compose-screen.md`), so a project carrying neither must cost its row no
 * height — which is only measurable against a project that carries both.
 */
const PROJECTS: ProjectFixture[] = [
  {
    name: 'vexel-e2e-alpha',
    configFiles: ['/tmp/vexel-e2e-alpha/docker-compose.yml'],
    state: 'running',
    services: [
      { name: 'api', image: 'alpine:3.20', state: 'running', replicas: 1 },
      { name: 'web', image: 'alpine:3.20', state: 'running', replicas: 2 },
      { name: 'worker', image: 'alpine:3.20', state: 'running', replicas: 1 },
    ],
  },
  {
    name: 'vexel-e2e-beta',
    configFiles: ['/tmp/vexel-e2e-beta/docker-compose.yml', '/tmp/vexel-e2e-beta/docker-compose.override.yml'],
    state: 'partial',
    services: [
      { name: 'cache', image: 'alpine:3.20', state: 'exited', replicas: 0 },
      { name: 'queue', image: 'alpine:3.20', state: 'running', replicas: 1 },
    ],
  },
  {
    // No config file at all, and the daemon's own message about it: the two
    // values a project row may or may not carry, both absent from the two above.
    name: 'vexel-e2e-gamma',
    configFiles: [],
    state: 'unknown',
    services: [{ name: 'solo', image: 'alpine:3.20', state: 'created', replicas: 1 }],
    error: GAMMA_ERROR,
  },
];

/** The compose file the stubbed read answers with, per project. */
function fileContent(project: ProjectFixture, path: string): string {
  return [
    `# ${project.name} — ${path}`,
    'services:',
    ...project.services.flatMap((service) => [`  ${service.name}:`, `    image: ${service.image}`]),
    '',
  ].join('\n');
}

interface StubOptions {
  /** The projects the first read answers with; later reads answer `then` where it is given. */
  projects: ProjectFixture[];
  /** What a re-read answers, so that "it really re-reads" is a difference and not a repetition. */
  then?: ProjectFixture[];
}

interface Stub {
  /** How many times the project list was read. */
  reads: () => number;
  /** How many times an aggregated log stream was opened, and for which project. */
  streams: () => string[];
  /** What the page asked to be written back to disk, if anything. */
  writes: () => { project: string; path: string; content: string }[];
}

/**
 * Answers the compose endpoints in the page, leaving the daemon untouched.
 *
 * The four lifecycle routes are **aborted** rather than answered: no assertion
 * here needs them, and an aborted request cannot be mistaken for a command that
 * silently ran against the operator's own daemon.
 */
async function stubCompose(page: Page, options: StubOptions): Promise<Stub> {
  let reads = 0;
  const streams: string[] = [];
  const writes: { project: string; path: string; content: string }[] = [];

  await page.route('**/api/compose/projects', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    reads += 1;
    const answer = reads === 1 ? options.projects : (options.then ?? options.projects);
    await route.fulfill({ json: answer });
  });

  await page.route('**/api/compose/projects/*/files', async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2)!);
    const project = [...options.projects, ...(options.then ?? [])].find((candidate) => candidate.name === name);
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { path: string; content: string };
      writes.push({ project: name, ...body });
      return route.fulfill({ json: { ok: true } });
    }
    if (!project || project.configFiles.length === 0) {
      return route.fulfill({ json: { ok: true, files: [] } });
    }
    await route.fulfill({
      json: { ok: true, files: project.configFiles.map((path) => ({ path, content: fileContent(project, path) })) },
    });
  });

  await page.route('**/api/compose/projects/*/validate', async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2)!);
    const project = [...options.projects, ...(options.then ?? [])].find((candidate) => candidate.name === name);
    await route.fulfill({
      json: {
        valid: true,
        errors: [],
        services: (project?.services ?? []).map((service) => service.name),
        volumes: [],
        networks: ['default'],
      },
    });
  });

  await page.route('**/api/compose/projects/*/logs/stream', async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-3)!);
    streams.push(name);
    // Two lines and a clean end: an aggregated stream that stops of its own
    // accord rather than dropping, so nothing here reconnects on a timer.
    const body = [
      'event: line',
      `data: ${JSON.stringify({ seq: 1, service: 'api', timestamp: '2026-08-15T10:00:00Z', text: 'listening on 8080' })}`,
      '',
      'event: line',
      `data: ${JSON.stringify({ seq: 2, service: 'web', timestamp: '2026-08-15T10:00:01Z', text: 'ready' })}`,
      '',
      'event: end',
      'data: {}',
      '',
      '',
    ].join('\n');
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body });
  });

  for (const command of ['up', 'down', 'restart']) {
    await page.route(`**/api/compose/projects/*/${command}`, (route) => route.abort());
  }
  await page.route('**/api/compose/projects/*/services/*/scale', (route) => route.abort());

  return { reads: () => reads, streams: () => [...streams], writes: () => [...writes] };
}

function content(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

/** The screen's one list: the outermost object list of the content region. */
function projectList(page: Page): Locator {
  return content(page).locator('.ui-data-table').first();
}

/**
 * The project rows, and only those.
 *
 * A service row is a row of the **nested** list a project row carries in its own
 * content slot, and both carry `.ui-data-table__row`. What tells them apart is
 * depth: a project row is a child of a carrier that is a child of the outer
 * list's own body.
 */
function projectRows(page: Page): Locator {
  return content(page)
    .locator('.ui-data-table__body')
    .first()
    .locator(':scope > .ui-surface > .ui-data-table__row');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function describeBox(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

interface CellGeometry {
  header: string;
  text: string;
  box: Box;
  /** Painted ink of this cell landing outside the row that holds it, in px. */
  outsideTheRow: number;
  /** Lines the cell draws, whatever they say. */
  lines: number;
}

interface RowGeometry {
  label: string;
  kind: 'project' | 'service';
  box: Box;
  cells: CellGeometry[];
  inkPieces: number;
  /** Controls of this row's action cluster, by the words they carry. */
  cluster: { label: string; box: Box }[];
  /** The track the cluster is drawn in. */
  clusterCell: Box | null;
  /** Every control of the row, by accessible name — the replicas stepper included. */
  controls: string[];
}

interface ScreenGeometry {
  contentColumn: number;
  card: Box;
  table: Box;
  tableClientWidth: number;
  tableScrollWidth: number;
  headers: string[];
  rows: RowGeometry[];
  /** How many nested lists the outer list draws — one per project row, opened or not. */
  rowContentLists: number;
  cardLists: number;
  groupedRowsPanels: number;
  grids: number;
  emptyState: {
    title: string;
    titleLines: number;
    titleWidth: number;
    description: string | null;
    controls: string[];
    box: Box;
  } | null;
}

/**
 * The whole screen in a single pass — so no two figures come from two layouts.
 *
 * The ink is **clipped by every ancestor that is not `overflow: visible`** before
 * being compared to the row's own box: below the desktop breakpoint the list
 * pans, and a column beyond the visible box is not painted at all. Measured raw
 * it would be reported as ink spilling out of its row, which is the opposite of
 * what it is.
 */
async function measureScreen(page: Page): Promise<ScreenGeometry> {
  return await page.evaluate(() => {
    const region = document.querySelector('.ui-frame__content') as HTMLElement;
    const regionStyle = getComputedStyle(region);
    const contentColumn =
      region.clientWidth - Number.parseFloat(regionStyle.paddingLeft) - Number.parseFloat(regionStyle.paddingRight);

    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };

    const clip = (raw: DOMRect, from: Element | null): Box | null => {
      let { top, bottom, left, right } = raw;
      for (let node: Element | null = from; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node);
        const owner = node.getBoundingClientRect();
        if (style.overflowX !== 'visible') {
          left = Math.max(left, owner.left);
          right = Math.min(right, owner.right);
        }
        if (style.overflowY !== 'visible') {
          top = Math.max(top, owner.top);
          bottom = Math.min(bottom, owner.bottom);
        }
      }
      if (right - left <= 0.5 || bottom - top <= 0.5) return null;
      return { x: left, y: top, width: right - left, height: bottom - top };
    };

    const paintedInk = (element: Element): Box[] => {
      const out: Box[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue?.trim()) continue;
        range.selectNodeContents(node);
        for (const raw of Array.from(range.getClientRects())) {
          const clipped = clip(raw, node.parentElement);
          if (clipped) out.push(clipped);
        }
      }
      return out;
    };

    const outer = region.querySelector('.ui-data-table') as HTMLElement | null;
    const card = outer?.closest('.ui-surface') ?? region;
    const outerHeaders = outer
      ? Array.from(outer.querySelectorAll<HTMLElement>('.ui-data-table__header-cell')).map((cell) =>
          (cell.textContent ?? '').trim(),
        )
      : [];

    const allRows = outer ? Array.from(outer.querySelectorAll<HTMLElement>('.ui-data-table__row')) : [];
    const rows = allRows.map((row) => {
      const nested = row.closest('.ui-data-table__row-content') !== null;
      const table = row.closest('.ui-data-table') as HTMLElement;
      const headers = Array.from(table.querySelectorAll<HTMLElement>('.ui-data-table__header-cell')).map((cell) =>
        (cell.textContent ?? '').trim(),
      );
      const rowBox = row.getBoundingClientRect();
      const cells = Array.from(row.querySelectorAll<HTMLElement>('.ui-data-table__cell')).filter(
        (cell) => cell.closest('.ui-data-table__row') === row,
      );
      let inkPieces = 0;
      const measured = cells.map((cell, index) => {
        const ink = paintedInk(cell);
        inkPieces += ink.length;
        const outside = ink.reduce(
          (total, rect) =>
            total +
            Math.max(0, rect.x + rect.width - rowBox.right) +
            Math.max(0, rowBox.left - rect.x) +
            Math.max(0, rect.y + rect.height - rowBox.bottom) +
            Math.max(0, rowBox.top - rect.y),
          0,
        );
        return {
          header: headers[index] ?? `#${index}`,
          text: (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
          box: box(cell),
          outsideTheRow: outside,
          lines: cell.querySelectorAll(
            '.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell, .ui-table-badge-list-cell',
          ).length,
        };
      });

      const clusterCell = cells.find((cell) => cell.querySelector('.ui-action-button-group') !== null) ?? null;
      const cluster = clusterCell
        ? Array.from(clusterCell.querySelectorAll<HTMLElement>('button')).map((button) => ({
            label: (button.textContent ?? '').trim(),
            box: box(button),
          }))
        : [];
      const controls = cells.flatMap((cell) =>
        Array.from(cell.querySelectorAll<HTMLElement>('button')).map((button) =>
          (button.getAttribute('aria-label') ?? button.textContent ?? '').trim(),
        ),
      );

      return {
        label: (row.querySelector('.ui-table-two-line-cell__title')?.textContent ?? row.textContent ?? '')
          .trim()
          .slice(0, 60),
        kind: (nested ? 'service' : 'project') as 'project' | 'service',
        box: { x: rowBox.x, y: rowBox.y, width: rowBox.width, height: rowBox.height },
        cells: measured,
        inkPieces,
        cluster,
        clusterCell: clusterCell ? box(clusterCell) : null,
        controls,
      };
    });

    const empty = region.querySelector('.ui-empty-state');
    const emptyTitle = empty?.querySelector('.ui-empty-state__title') ?? null;
    let titleLines = 0;
    let titleWidth = 0;
    if (emptyTitle) {
      const range = document.createRange();
      range.selectNodeContents(emptyTitle);
      const rects = Array.from(range.getClientRects());
      titleLines = rects.length;
      titleWidth = rects.reduce((widest, rect) => Math.max(widest, rect.width), 0);
    }

    return {
      contentColumn,
      card: box(card),
      table: outer ? box(outer) : { x: 0, y: 0, width: 0, height: 0 },
      tableClientWidth: outer?.clientWidth ?? 0,
      tableScrollWidth: outer?.scrollWidth ?? 0,
      headers: outerHeaders,
      rows,
      rowContentLists: region.querySelectorAll('.ui-data-table__row-content .ui-data-table').length,
      cardLists: region.querySelectorAll('.ui-card-list').length,
      groupedRowsPanels: region.querySelectorAll('.ui-grouped-rows-panel').length,
      grids: region.querySelectorAll('.ui-grid').length,
      emptyState: empty
        ? {
            title: (emptyTitle?.textContent ?? '').trim(),
            titleLines,
            titleWidth,
            description: empty.querySelector('.ui-empty-state__description')?.textContent?.trim() ?? null,
            controls: Array.from(empty.querySelectorAll<HTMLElement>('button, [role="button"], a')).map((control) =>
              (control.textContent ?? '').trim(),
            ),
            box: box(empty),
          }
        : null,
    };
  });
}

interface PanelGeometry {
  panels: number;
  closeControls: number;
  panel: Box | null;
  /** The property bands, from which the column count is deduced rather than read off a class. */
  bands: { label: string; x: number; y: number; width: number; valueWidth: number }[];
  tabs: string[];
  editor: Box | null;
  logStream: Box | null;
  logStreamActions: string[] | null;
  dirtyIndicators: number;
  editorValue: string | null;
  statusLine: string | null;
}

async function measurePanel(page: Page): Promise<PanelGeometry> {
  return await page.evaluate(() => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const region = document.querySelector('.ui-frame__content') as HTMLElement;
    const panel = region.querySelector('.ui-detail-panel');
    const editor = panel?.querySelector('.ui-code-editor__textarea') as HTMLTextAreaElement | null;
    const stream = panel?.querySelector('.ui-log-stream') ?? null;
    const actions = stream?.querySelector('.ui-log-stream__actions') ?? null;
    return {
      panels: region.querySelectorAll('.ui-detail-panel').length,
      closeControls: region.querySelectorAll('.ui-detail-panel [aria-label="Close detail"]').length,
      panel: panel ? box(panel) : null,
      bands: panel
        ? Array.from(panel.querySelectorAll<HTMLElement>('.ui-definition-list__row')).map((band) => {
            const rect = band.getBoundingClientRect();
            const value = band.querySelector('.ui-definition-list__value');
            return {
              label: (band.querySelector('.ui-definition-list__label')?.textContent ?? '').trim(),
              x: rect.x,
              y: rect.y,
              width: rect.width,
              valueWidth: value ? value.getBoundingClientRect().width : 0,
            };
          })
        : [],
      tabs: panel
        ? Array.from(panel.querySelectorAll<HTMLElement>('[role="tab"]')).map((tab) => (tab.textContent ?? '').trim())
        : [],
      editor: editor ? box(editor.closest('.ui-code-editor') ?? editor) : null,
      editorValue: editor?.value ?? null,
      logStream: stream ? box(stream) : null,
      logStreamActions: actions
        ? Array.from(actions.querySelectorAll<HTMLElement>('button')).map((button) => (button.textContent ?? '').trim())
        : null,
      dirtyIndicators: panel ? panel.querySelectorAll('.ui-code-editor__dirty').length : 0,
      statusLine: panel?.querySelector('.ui-code-editor__status')?.textContent?.trim() ?? null,
    };
  });
}

/** The screen, at `viewport`, with the stubbed reading drawn. */
async function openScreen(page: Page, viewport: Viewport, options: StubOptions = { projects: PROJECTS }): Promise<Stub> {
  await page.setViewportSize(viewport);
  const stub = await stubCompose(page, options);
  await openApp(page, 'compose');
  await expect(page.getByRole('heading', { level: 1, name: 'Compose' })).toBeVisible({ timeout: 20_000 });
  // Waited for on whichever half the fixture produces: a list still being read
  // is not a list with nothing to show, and only the second explains itself
  // (REQ-51). Measuring the first would measure this runner's timing.
  if (options.projects.length > 0) {
    await expect(projectRows(page).first()).toBeVisible({ timeout: 20_000 });
    await expect(projectRows(page)).toHaveCount(options.projects.length, { timeout: 20_000 });
  } else {
    await expect(content(page).locator('.ui-empty-state__description')).toBeVisible({ timeout: 20_000 });
  }
  return stub;
}

/** A real pointer at the visible control's own coordinates — never `element.click()`. */
async function clickAtItsOwnCentre(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * A project row is selected on its **first cell**: below the desktop breakpoint
 * the row is wider than the box it is read in, so its own centre can sit over
 * another column — or over a control.
 */
async function clickRow(page: Page, index: number): Promise<void> {
  const cell = projectRows(page).nth(index).locator('.ui-data-table__cell').first();
  await clickAtItsOwnCentre(page, cell);
}

/** The confirmation the product raises before anything that destroys work. */
function confirmation(page: Page): Locator {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: /^Confirm: / }) });
}

/** A locator's box once it has stopped moving, so a pointer is aimed at where the control now is. */
async function settledBox(page: Page, target: Locator): Promise<void> {
  let previous = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = JSON.stringify(await target.boundingBox());
    if (current === previous) return;
    previous = current;
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
  }
}

/**
 * Types into the open panel's editor, which is what makes the compose buffer
 * dirty.
 *
 * **The panel opens with a file read behind it**, so the editor arrives after the
 * "Reading the compose file…" state it replaces and the panel is still laying
 * itself out when it does. A pointer aimed at a box taken in that window lands
 * where the control was, not where it is: this helper lost one run out of six
 * that way, at 1440×1000 only, and the symptom was a buffer that never went
 * dirty because the keystrokes went nowhere. So the box is read once it has
 * settled, and the click is asserted to have actually landed on the control
 * before anything is typed into it.
 */
async function editTheBuffer(page: Page, marker: string): Promise<void> {
  const editor = page.locator('.ui-detail-panel .ui-code-editor__textarea');
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await expect(editor, 'the compose file never arrived in the editor').not.toHaveValue('', { timeout: 20_000 });
  await settledBox(page, editor);
  await clickAtItsOwnCentre(page, editor);
  await expect(editor, 'a click at the editor’s own centre did not land on it').toBeFocused({ timeout: 10_000 });
  await page.keyboard.type(marker);
  await expect(page.locator('.ui-detail-panel .ui-code-editor__dirty')).toBeVisible({ timeout: 10_000 });
}

test.describe('F11 — the compose screen against a reading holding every project state', () => {
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    // REQ-49 — "Compose lists its projects with the object-list primitive. The screen that has no
    // list at all acquires the one every other screen uses; each project is a row, with its actions
    // in the cluster." compose-screen.md — "one full-width list of projects, in the object list's
    // comfortable variant, and nothing beside it. Each project row carries its services as a nested
    // header-less list of the same component."
    test(`every project is a row of the one list, carrying its services opened or not — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const screen = await measureScreen(page);
      console.log(
        `[REQ-49] ${at}: content column ${round(screen.contentColumn)}px, card ${describeBox(screen.card)}, ` +
          `list holds ${round(screen.tableScrollWidth)}px of row in ${round(screen.tableClientWidth)}px; ` +
          `headers ${JSON.stringify(screen.headers)}`,
      );

      // The third answer to "how is an object listed" has left the product, and no second one took
      // its place: one outer list, one nested list per project row.
      expect(screen.groupedRowsPanels, `${at}: the retired grouped-rows panel is still drawn`).toBe(0);
      expect(screen.cardLists, `${at}: the screen draws a hand-built card list`).toBe(0);
      expect(screen.rowContentLists, `${at}: a project row does not carry its services as a nested list`).toBe(
        PROJECTS.length,
      );

      const projects = screen.rows.filter((row) => row.kind === 'project');
      const services = screen.rows.filter((row) => row.kind === 'service');
      expect(
        projects.map((row) => row.label),
        `${at}: the projects are not the rows of the list, in the order the reading returned them`,
      ).toEqual(PROJECTS.map((project) => project.name));

      // …and every service is visible with its own state **without anything being selected**: the
      // grouping is the object's own shape, not a detail of the selection.
      expect(await page.locator('.ui-detail-panel').count(), `${at}: a project was selected before anything was clicked`).toBe(0);
      expect(services.length, `${at}: the services of the three projects are not all drawn`).toBe(
        PROJECTS.reduce((total, project) => total + project.services.length, 0),
      );
      for (const project of PROJECTS) {
        for (const service of project.services) {
          const row = services.find((candidate) => candidate.label === service.name);
          expect(row, `${at}: ${project.name}/${service.name} is not drawn as a row of its own`).toBeDefined();
          const text = row!.cells.map((cell) => cell.text).join(' | ');
          expect(text, `${at}: ${service.name} does not state the daemon's own word for its state`).toContain(service.state);
          expect(text, `${at}: ${service.name} does not state its image`).toContain(service.image);
          expect(
            row!.controls,
            `${at}: ${service.name} offers no replicas stepper of its own`,
          ).toEqual(expect.arrayContaining([`Decrease ${service.name} replicas`, `Increase ${service.name} replicas`]));
        }
      }

      // The project's own state, in words, on every row.
      const stateOf = (name: string) =>
        projects.find((row) => row.label === name)!.cells.find((cell) => /STATE/i.test(cell.header))!.text;
      expect(stateOf('vexel-e2e-alpha'), `${at}: a running project does not read as up`).toBe('Up');
      expect(stateOf('vexel-e2e-beta'), `${at}: a partial project does not read as partial`).toBe('Partial');
      expect(stateOf('vexel-e2e-gamma'), `${at}: an unreadable project does not read as unknown`).toBe('Unknown');

      // The list is read at the content column's full width — the pair that halved it is gone.
      expect(
        round(screen.card.width),
        `${at}: the list card is ${round(screen.card.width)}px of a ${round(screen.contentColumn)}px content column`,
      ).toBeGreaterThanOrEqual(round(screen.contentColumn) - 1);
      expect(screen.grids, `${at}: a Grid is still laying something out beside the list`).toBe(0);
    });

    // compose-screen.md — "Every cell of a project row is the same number of lines whatever the
    // project's state: the discovered file paths and the daemon's refusal to read the project are
    // columns of their own, not a shared subtitle line, so a project that carries neither costs its
    // row no height. Measured: 59.4px on every project row and 56px on every service row."
    test(`every project row is one height and every service row another, with nothing painted past a row — ${at}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const screen = await measureScreen(page);
      for (const row of screen.rows) {
        console.log(
          `[REQ-49] ${at} ${row.kind} "${row.label}": ${describeBox(row.box)} — ${row.cells
            .map((cell) => `${cell.header || '(cell)'}="${cell.text}" ${round(cell.box.width)}px/${cell.lines} line(s)`)
            .join(' | ')}`,
        );
      }

      for (const kind of ['project', 'service'] as const) {
        const rows = screen.rows.filter((row) => row.kind === kind);
        const heights = rows.map((row) => round(row.box.height));
        console.log(`[REQ-49] ${at}: ${rows.length} ${kind} row(s), heights ${JSON.stringify([...new Set(heights)])}`);
        expect(rows.length, `${at}: no ${kind} row was measured`).toBeGreaterThan(1);
        expect(
          new Set(heights).size,
          `${at}: the ${kind} rows are ${JSON.stringify(heights)}px tall — a row's height still depends on what it carries`,
        ).toBe(1);
      }

      // The premise: the three projects really do differ in the two values that used to share a
      // subtitle line, or one height proves nothing.
      const projects = screen.rows.filter((row) => row.kind === 'project');
      const cellOf = (name: string, header: RegExp) =>
        projects.find((row) => row.label === name)!.cells.find((cell) => header.test(cell.header))!;
      expect(cellOf('vexel-e2e-alpha', /COMPOSE FILES/i).text, `${at}: the discovered path is not stated`).toContain(
        'docker-compose.yml',
      );
      expect(cellOf('vexel-e2e-gamma', /COMPOSE FILES/i).text, `${at}: a project with no file states one`).toMatch(/^[-–—]?$/);
      expect(cellOf('vexel-e2e-gamma', /DOCKER REPORTS/i).text, `${at}: the daemon's own message is not stated`).toContain(
        GAMMA_ERROR,
      );
      expect(cellOf('vexel-e2e-alpha', /DOCKER REPORTS/i).text, `${at}: a readable project explains itself anyway`).toMatch(
        /^[-–—]$/,
      );
      // …and each of them is its own column, one line, on every row.
      for (const row of projects) {
        for (const cell of row.cells.filter((candidate) => candidate.lines > 0)) {
          expect(cell.lines, `${at}: ${row.label} draws ${cell.lines} lines in its ${cell.header} cell`).toBe(1);
        }
      }

      // Nothing paints outside the row that holds it: below the desktop widths the list pans, and a
      // column that does not fit is panned to rather than spilled.
      const spilling = screen.rows.flatMap((row) =>
        row.cells
          .filter((cell) => cell.outsideTheRow > 1)
          .map((cell) => `${row.kind} ${row.label} ${cell.header}: ${round(cell.outsideTheRow)}px painted outside the row`),
      );
      const inkPieces = screen.rows.reduce((total, row) => total + row.inkPieces, 0);
      console.log(`[REQ-49] ${at}: ${inkPieces} painted text(s) over ${screen.rows.length} row(s), ${spilling.length} spilling`);
      expect(inkPieces, `${at}: no painted text was measured, so this comparison shows nothing`).toBeGreaterThan(0);
      expect(spilling, `${at}: a value is painted outside the row that holds it`).toEqual([]);
    });

    // REQ-49 — "each project is a row, **with its actions in the cluster**"; and REQ-9's track: the
    // cluster's own width and no more. A control that cannot be hit at its own centre is a control
    // the operator cannot use, whatever the DOM says.
    test(`each project's action cluster is hit-testable at each control's own centre — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const table = projectList(page);
      const geometry = await table.evaluate((element) => ({
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth,
      }));
      console.log(`[REQ-49] ${at}: the list holds ${geometry.scrollWidth}px of row in ${geometry.clientWidth}px`);

      const misses: string[] = [];
      const rowCount = await projectRows(page).count();

      for (let index = 0; index < rowCount; index += 1) {
        // **The row is brought on screen first, and the figures are re-taken there.** A control
        // below the fold is not a control drawn wrong: `elementFromPoint` answers nothing outside
        // the viewport, so a probe that measures the whole list once and hit-tests every row from
        // that one reading accuses the third row of a defect the runner produced. Measured that way
        // this file reported two misses at 1280×800 and two at 375×812, all four of them at a `y`
        // past the viewport's own height.
        await projectRows(page).nth(index).scrollIntoViewIfNeeded();

        // At the phone breakpoint the ACTIONS column lies beyond the box the list is read in, so it
        // is reached the way an operator reaches it: by panning, with a real wheel over the row.
        if (geometry.scrollWidth > geometry.clientWidth) {
          const rowBox = (await projectRows(page).nth(index).boundingBox())!;
          await page.mouse.move(rowBox.x + Math.min(60, rowBox.width / 2), rowBox.y + rowBox.height / 2);
          for (let step = 0; step < 20; step += 1) {
            await page.mouse.wheel(120, 0);
            const offset = await table.evaluate((element) => (element as HTMLElement).scrollLeft);
            if (offset >= geometry.scrollWidth - geometry.clientWidth - 1) break;
          }
        }

        // …and read once the scroll those two produced has stopped moving.
        await settledBox(page, projectRows(page).nth(index));

        const screen = await measureScreen(page);
        const row = screen.rows.filter((candidate) => candidate.kind === 'project')[index]!;
        expect(row.clusterCell, `${at}: ${row.label} draws no action track at all`).not.toBeNull();
        expect(row.cluster.length, `${at}: ${row.label} draws no control in its action track`).toBe(2);
        const first = row.cluster[0]!.box;
        const last = row.cluster[row.cluster.length - 1]!.box;
        const inked = last.x + last.width - first.x;
        console.log(
          `[REQ-49] ${at} ${row.label}: cluster ${row.cluster.map((control) => `${control.label} ${describeBox(control.box)}`).join(' + ')} ` +
            `— ${round(inked)}px inked in a ${round(row.clusterCell!.width)}px track`,
        );

        // compose-screen.md — "Up" on a stopped or unknown project, "Down" on a running or partial
        // one, "Restart" on every row.
        const expected = PROJECTS.find((project) => project.name === row.label)!;
        expect(
          row.cluster.map((control) => control.label),
          `${at}: ${row.label} does not carry the pair of lifecycle controls its state calls for`,
        ).toEqual(['Restart', expected.state === 'stopped' || expected.state === 'unknown' ? 'Up' : 'Down']);

        expect(
          round(inked),
          `${at}: ${row.label}'s cluster inks ${round(inked)}px of a ${round(row.clusterCell!.width)}px track`,
        ).toBeLessThanOrEqual(round(row.clusterCell!.width) + 0.5);

        // Hit-tested, never clicked: these controls act on a real daemon.
        //
        // **The rect and the hit test are taken in one tick**, inside a single evaluation. Read as
        // two — measure the whole row, then probe the coordinates it reported — the probe races the
        // scroll `scrollIntoViewIfNeeded` has just started: this file reported two misses at
        // 1440×1000 that way, at the exact coordinates the same button had had a moment earlier, and
        // the point had simply stopped being over it. A control the operator can hit is a control
        // that answers at the coordinates it occupies **now**.
        const hits = await page.evaluate(
          ({ rowIndex, height, width }) => {
            const body = document.querySelector('.ui-frame__content .ui-data-table__body')!;
            const rows = Array.from(body.children)
              .map((carrier) => carrier.querySelector(':scope > .ui-data-table__row'))
              .filter((candidate): candidate is Element => candidate !== null);
            const cluster = rows[rowIndex]?.querySelector('.ui-action-button-group');
            return Array.from(cluster?.querySelectorAll<HTMLElement>('button') ?? []).map((button) => {
              const rect = button.getBoundingClientRect();
              const x = rect.x + rect.width / 2;
              const y = rect.y + rect.height / 2;
              const element = document.elementFromPoint(x, y);
              const hit = element?.closest('button');
              return {
                label: (button.textContent ?? '').trim(),
                x,
                y,
                insideTheViewport: x > 0 && x < width && y > 0 && y < height,
                hit: (hit?.textContent ?? element?.tagName ?? 'nothing').trim(),
              };
            });
          },
          { rowIndex: index, height: viewport.height, width: viewport.width },
        );

        for (const control of hits) {
          // The probe's own premise: a point outside the viewport hits nothing whatever is drawn
          // there, so a miss below is the product's and not this file's.
          expect(
            control.insideTheViewport,
            `${at}: ${row.label} · ${control.label} was probed at (${round(control.x)}, ${round(control.y)}), outside the viewport`,
          ).toBe(true);
          if (control.hit !== control.label) {
            misses.push(`${row.label} · ${control.label} at (${round(control.x)}, ${round(control.y)}) hits "${control.hit}"`);
          }
        }
      }

      expect(misses, `${at}: a lifecycle control is not reachable at its own centre`).toEqual([]);
    });

    // REQ-50 — "A project's detail is revealed by the detail-panel primitive, full width, two-column
    // grid, tabs where the screen needs them." compose-screen.md — "Nothing on this screen is laid
    // out beside anything else: the panel is the content column's width, and so are the editor and
    // the log stream inside it."
    test(`a project's detail opens on the panel at the list's own width, editor and stream with it — ${at}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const before = await measureScreen(page);
      await clickRow(page, 0);
      await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });

      const panel = await measurePanel(page);
      const after = await measureScreen(page);
      console.log(
        `[REQ-50] ${at}: panel ${describeBox(panel.panel!)} inside a ${round(after.tableClientWidth)}px list ` +
          `(card ${round(after.card.width)}px of a ${round(after.contentColumn)}px content column); tabs ${JSON.stringify(panel.tabs)}`,
      );

      expect(panel.panels, `${at}: the row opened no detail panel`).toBe(1);
      // The reveal is the row's own expansion, so the list's width is the panel's width.
      expect(
        round(panel.panel!.width),
        `${at}: the panel is ${round(panel.panel!.width)}px inside a ${round(after.tableClientWidth)}px list`,
      ).toBeGreaterThanOrEqual(round(after.tableClientWidth) * 0.75);
      expect(
        round(panel.panel!.width),
        `${at}: the panel is wider than the box the list is read in`,
      ).toBeLessThanOrEqual(round(after.tableClientWidth) + 0.5);
      expect(panel.panel!.x, `${at}: the panel is drawn off the left edge of the viewport`).toBeGreaterThanOrEqual(-0.5);
      expect(round(before.card.width), `${at}: opening a panel changed the list's own width`).toBe(round(after.card.width));

      // The two views the screen needs, and the editor and the stream at the panel's own width —
      // never at a column's leftover, which is where the deleted pair drew them (39px at 375×812).
      expect(panel.tabs, `${at}: the panel does not offer the compose file and the aggregated logs as two views`).toEqual([
        'Compose file',
        'Aggregated logs',
      ]);
      expect(panel.editor, `${at}: the panel draws no compose editor`).not.toBeNull();
      console.log(`[REQ-50] ${at}: editor ${describeBox(panel.editor!)}`);
      expect(
        Math.abs(panel.editor!.width - panel.panel!.width),
        `${at}: the editor is ${round(panel.editor!.width)}px inside a ${round(panel.panel!.width)}px panel`,
      ).toBeLessThanOrEqual(1);

      await clickAtItsOwnCentre(page, page.getByRole('tab', { name: 'Aggregated logs' }));
      await expect(page.locator('.ui-detail-panel .ui-log-stream')).toBeVisible({ timeout: 20_000 });
      const withLogs = await measurePanel(page);
      console.log(`[REQ-50] ${at}: log stream ${describeBox(withLogs.logStream!)}, actions ${JSON.stringify(withLogs.logStreamActions)}`);
      expect(
        Math.abs(withLogs.logStream!.width - withLogs.panel!.width),
        `${at}: the log stream is ${round(withLogs.logStream!.width)}px inside a ${round(withLogs.panel!.width)}px panel`,
      ).toBeLessThanOrEqual(1);

      // plan-docker_management_app-remove_copy_controls/REQ-12, REQ-20 — the stream exists only
      // inside a project's panel now, so it always has a download filename: its action row is drawn
      // and holds `Download` alone.
      expect(withLogs.logStreamActions, `${at}: the stream inside a panel draws no action row`).not.toBeNull();
      expect(withLogs.logStreamActions, `${at}: the stream's action row holds something besides Download`).toEqual(['Download']);
    });

    // REQ-50, detail-panel.md — "Properties are stated through `properties`, in the library's
    // two-column grid"; the grid derives the count from its own width against the content class's
    // minimum, and the caller states no count.
    test(`the panel's property bands take two columns at desktop widths and one on the phone — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);
      await clickRow(page, 0);
      await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });

      const panel = await measurePanel(page);
      const tops = [...new Set(panel.bands.map((band) => Math.round(band.y)))];
      const columns = Math.max(...tops.map((top) => panel.bands.filter((band) => Math.round(band.y) === top).length));
      console.log(
        `[REQ-50] ${at}: ${panel.bands.length} band(s) over ${tops.length} line(s), ${columns} column(s) — ` +
          panel.bands.map((band) => `${band.label} x=${round(band.x)} w=${round(band.width)}`).join(', '),
      );

      expect(
        panel.bands.map((band) => band.label),
        `${at}: the panel does not state the project's own properties`,
      ).toEqual(['Project', 'State', 'Services running', 'Compose files']);
      expect(columns, `${at}: the property grid resolves ${columns} column(s)`).toBe(viewport.width >= 1280 ? 2 : 1);

      // No band is drawn at no width at all — the 0px-wide box the deleted column produced.
      const starved = panel.bands.filter((band) => band.valueWidth <= 1).map((band) => band.label);
      expect(starved, `${at}: a property value is in the DOM and nowhere on screen`).toEqual([]);
    });
  }

  // compose-screen.md — "No project is selected when the screen opens" and "The aggregated log
  // stream is subscribed only while a project's panel is open": the product no longer streams a
  // project's logs that nobody asked to see. Measured on the requests the page issues, not on what
  // it draws.
  test('nothing is selected when the screen opens, and the aggregated stream is subscribed only while a panel is', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const stub = await openScreen(page, VIEWPORTS[0]);

    expect(await page.locator('.ui-detail-panel').count(), 'a project was selected before anything was clicked').toBe(0);
    expect(await page.locator('.ui-log-stream').count(), 'a log stream is drawn with no project selected').toBe(0);
    console.log(`[REQ-50] streams opened before any selection: ${JSON.stringify(stub.streams())}`);
    expect(stub.streams(), 'the screen subscribed to a project’s aggregated logs that nobody asked to see').toEqual([]);

    await clickRow(page, 0);
    await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
    await expect.poll(() => stub.streams(), { timeout: 20_000 }).toEqual(['vexel-e2e-alpha']);

    // …and it ends with the panel: closing takes the stream with it and opens no other.
    await page.keyboard.press('Escape');
    await expect(page.locator('.ui-detail-panel')).toHaveCount(0, { timeout: 20_000 });
    expect(await page.locator('.ui-log-stream').count(), 'the stream outlived the panel that held it').toBe(0);
    await page.waitForTimeout(2_000);
    console.log(`[REQ-50] streams opened over the whole test: ${JSON.stringify(stub.streams())}`);
    expect(stub.streams(), 'a stream was re-subscribed after the panel closed').toEqual(['vexel-e2e-alpha']);

    // Another project's panel subscribes to that project, and to nothing else.
    await clickRow(page, 1);
    await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
    await expect.poll(() => stub.streams(), { timeout: 20_000 }).toEqual(['vexel-e2e-alpha', 'vexel-e2e-beta']);
  });

  // detail-panel.md — "at most one detail panel is open anywhere in the interface", and in the
  // `opening-gesture` presentation "the panel presents **no** close control … `Escape` calls
  // `onClose` instead". compose-screen.md — "The panel is dismissed exactly as every other panel in
  // the product is."
  test('one project is open at a time, closed by its own row and by Escape, with no close control', async ({ page }) => {
    test.setTimeout(120_000);
    await openScreen(page, VIEWPORTS[0]);

    await clickRow(page, 0);
    await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
    const opened = await measurePanel(page);
    expect(opened.closeControls, 'the panel presents a close control of its own').toBe(0);

    // A second project's row replaces the panel rather than opening a second one.
    await clickRow(page, 1);
    await expect(page.locator('.ui-detail-panel'), 'a second panel was opened beside the first').toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator('.ui-detail-panel')).toContainText('vexel-e2e-beta');

    // The row that opened it closes it…
    await clickRow(page, 1);
    await expect(page.locator('.ui-detail-panel'), 'the open project’s own row left it open').toHaveCount(0, { timeout: 20_000 });

    // …and so does Escape, with a clean buffer.
    await clickRow(page, 0);
    await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('.ui-detail-panel'), 'Escape left the panel open with a clean buffer').toHaveCount(0, {
      timeout: 20_000,
    });
  });
});

/**
 * The dismissal guard, at the two viewports the batch states it at.
 *
 * `compose-screen.md`: "while the buffer is dirty, every route that would discard
 * it (the panel's `Escape`, the row that closes it, another project's row)
 * confirms first, and a refused confirmation leaves both the panel and the edit
 * standing". A guard covering `Escape` but not the row that switches is exactly
 * what a check written against the requirement's wording alone would miss, so
 * each of the three routes is driven separately.
 */
test.describe('F11 — the editable buffer is guarded on every route that would discard it', () => {
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    const at = `${viewport.width}×${viewport.height}`;
    const marker = '\n# vexel-e2e-dirty-marker';

    test(`Escape on a dirty buffer asks first, and Cancel leaves the panel and the edit standing — ${at}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);
      await clickRow(page, 0);
      await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
      await editTheBuffer(page, marker);
      const edited = (await measurePanel(page)).editorValue!;

      await page.keyboard.press('Escape');
      await expect(confirmation(page), `${at}: Escape discarded the unsaved edit without asking`).toBeVisible({ timeout: 20_000 });
      expect(await page.locator('.ui-detail-panel').count(), `${at}: the panel closed while the confirmation was still open`).toBe(1);
      console.log(`[REQ-50] ${at}: Escape on a dirty buffer — confirmation shown, panel still open`);

      await clickAtItsOwnCentre(page, confirmation(page).getByRole('button', { name: 'Cancel' }));
      await expect(confirmation(page)).toBeHidden({ timeout: 20_000 });
      await expect(page.locator('.ui-detail-panel'), `${at}: Cancel closed the panel anyway`).toHaveCount(1);
      const afterCancel = await measurePanel(page);
      expect(afterCancel.editorValue, `${at}: Cancel discarded the edit it refused to discard`).toBe(edited);
      expect(afterCancel.dirtyIndicators, `${at}: the buffer no longer reads as dirty after a refused discard`).toBe(1);

      // …and confirming really does close it.
      await page.keyboard.press('Escape');
      await expect(confirmation(page)).toBeVisible({ timeout: 20_000 });
      await clickAtItsOwnCentre(page, confirmation(page).getByRole('button', { name: 'Discard changes' }));
      await expect(page.locator('.ui-detail-panel'), `${at}: the confirmed discard left the panel open`).toHaveCount(0, {
        timeout: 20_000,
      });
    });

    test(`the row that switches project and the row that closes the open one both ask first — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      // Route 2 — another project's row.
      await clickRow(page, 0);
      await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
      await editTheBuffer(page, marker);
      const edited = (await measurePanel(page)).editorValue!;

      await clickRow(page, 1);
      await expect(
        confirmation(page),
        `${at}: another project's row discarded the unsaved edit without asking`,
      ).toBeVisible({ timeout: 20_000 });
      await clickAtItsOwnCentre(page, confirmation(page).getByRole('button', { name: 'Cancel' }));
      await expect(confirmation(page)).toBeHidden({ timeout: 20_000 });
      await expect(page.locator('.ui-detail-panel')).toHaveCount(1);
      await expect(
        page.locator('.ui-detail-panel'),
        `${at}: a refused confirmation moved the selection to the other project anyway`,
      ).toContainText('vexel-e2e-alpha');
      expect((await measurePanel(page)).editorValue, `${at}: the refused switch discarded the edit`).toBe(edited);
      console.log(`[REQ-50] ${at}: another project's row — confirmation shown, selection and edit unchanged on Cancel`);

      // Route 3 — the open project's own row, which is the route that closes it.
      await clickRow(page, 0);
      await expect(
        confirmation(page),
        `${at}: the open project's own row discarded the unsaved edit without asking`,
      ).toBeVisible({ timeout: 20_000 });
      await clickAtItsOwnCentre(page, confirmation(page).getByRole('button', { name: 'Cancel' }));
      await expect(confirmation(page)).toBeHidden({ timeout: 20_000 });
      await expect(page.locator('.ui-detail-panel'), `${at}: Cancel closed the panel anyway`).toHaveCount(1);
      expect((await measurePanel(page)).editorValue, `${at}: the refused close discarded the edit`).toBe(edited);

      // …and a confirmed switch really does move to the other project.
      await clickRow(page, 1);
      await expect(confirmation(page)).toBeVisible({ timeout: 20_000 });
      await clickAtItsOwnCentre(page, confirmation(page).getByRole('button', { name: 'Discard changes' }));
      await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
      await expect(
        page.locator('.ui-detail-panel'),
        `${at}: the confirmed switch did not open the project whose row was clicked`,
      ).toContainText('vexel-e2e-beta');
    });

    // The control case the guard has to be read against: with a **clean** buffer none of the three
    // routes asks anything at all. Without it, a screen that confirmed on every click would pass
    // every assertion above.
    test(`with a clean buffer no route asks anything — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      await clickRow(page, 0);
      await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
      await clickRow(page, 1);
      await expect(page.locator('.ui-detail-panel')).toContainText('vexel-e2e-beta', { timeout: 20_000 });
      await expect(confirmation(page), `${at}: a clean switch asked for a confirmation`).toHaveCount(0);
      await clickRow(page, 1);
      await expect(page.locator('.ui-detail-panel')).toHaveCount(0, { timeout: 20_000 });
      await expect(confirmation(page), `${at}: a clean close asked for a confirmation`).toHaveCount(0);
    });
  }
});

test.describe('F11 — the compose file inside the panel (plan-docker_management_app/REQ-77)', () => {
  // compose-screen.md — the file "in a `CodeEditor`, tabbed by file name when the project has
  // several, with the dirty indicator and a validation summary line once validated"; "Save"
  // "asks for confirmation, then writes the active file back to disk".
  test('the file is tabbed by name, validated on demand, and saved only after a confirmation', async ({ page }) => {
    test.setTimeout(120_000);
    const stub = await openScreen(page, VIEWPORTS[0]);

    // The project with two discovered files, so the tabs are a real choice.
    await clickRow(page, 1);
    await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
    const panel = page.locator('.ui-detail-panel');
    const fileTabs = panel.getByRole('tab').filter({ hasText: /\.yml$/ });
    await expect(fileTabs).toHaveCount(2, { timeout: 20_000 });
    await expect(fileTabs.first()).toHaveText('docker-compose.yml');

    await clickAtItsOwnCentre(page, fileTabs.nth(1));
    await expect(panel.getByRole('textbox', { name: 'docker-compose.override.yml' })).toBeVisible({ timeout: 20_000 });

    await clickAtItsOwnCentre(page, panel.getByRole('button', { name: 'Validate' }));
    const status = panel.locator('.ui-code-editor__status');
    await expect(status).toBeVisible({ timeout: 20_000 });
    await expect(status).toContainText(/valid/i);
    await expect(status).toContainText('2 services');
    console.log(`[REQ-77] validation summary: "${(await status.textContent())?.trim()}"`);

    // Save is offered only once the active file is dirty, and asks before it writes.
    await expect(panel.getByRole('button', { name: 'Save' })).toBeDisabled();
    await editTheBuffer(page, '\n# vexel-e2e-save-marker');
    await expect(panel.getByRole('button', { name: 'Save' })).toBeEnabled();

    await clickAtItsOwnCentre(page, panel.getByRole('button', { name: 'Save' }));
    await expect(confirmation(page), 'Save wrote the file back without asking').toBeVisible({ timeout: 20_000 });
    await clickAtItsOwnCentre(page, confirmation(page).getByRole('button', { name: 'Cancel' }));
    await expect(confirmation(page)).toBeHidden({ timeout: 20_000 });
    expect(stub.writes(), 'a cancelled confirmation wrote the file back anyway').toEqual([]);

    await clickAtItsOwnCentre(page, panel.getByRole('button', { name: 'Save' }));
    await expect(confirmation(page)).toBeVisible({ timeout: 20_000 });
    await clickAtItsOwnCentre(page, confirmation(page).getByRole('button', { name: 'Save' }));
    await expect.poll(() => stub.writes().length, { timeout: 20_000 }).toBe(1);
    const written = stub.writes()[0]!;
    console.log(`[REQ-77] wrote ${written.path} of ${written.project}, ${written.content.length} bytes`);
    expect(written.path, 'the confirmed save wrote a file the operator was not editing').toBe(
      PROJECTS[1].configFiles[1],
    );
    expect(written.content, 'the confirmed save did not write the edit it was confirming').toContain('vexel-e2e-save-marker');
    await expect(panel.locator('.ui-code-editor__dirty'), 'the buffer still reads as dirty after a confirmed save').toHaveCount(0, {
      timeout: 20_000,
    });
  });
});

test.describe('F11 — no compose project at all (REQ-51)', () => {
  // REQ-51 — "`No compose projects` becomes a real empty state, on a surface, with a title, one line
  // and the resolving action — replacing bare text on no surface." The reading is answered with an
  // empty list rather than trusted to the machine: an assertion about the empty case must not depend
  // on the operator's daemon holding nothing.
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    test(`the empty result is a title on one line, a line of explanation and its action — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport, { projects: [] });

      const screen = await measureScreen(page);
      expect(screen.emptyState, `${at}: the empty result is not stated on the empty-state primitive`).not.toBeNull();
      const empty = screen.emptyState!;
      console.log(
        `[REQ-51] ${at}: ${describeBox(empty.box)} — "${empty.title}" over ${empty.titleLines} line(s), ` +
          `title ink ${round(empty.titleWidth)}px; "${empty.description}"; controls ${JSON.stringify(empty.controls)}`,
      );

      await expect(content(page).locator('.ui-empty-state')).toBeVisible();
      expect(empty.title, `${at}: the empty state states no title`).toBe('No compose projects');
      expect(empty.description, `${at}: the empty state states no line of explanation`).not.toBeNull();
      expect(empty.description!.length, `${at}: the empty state explains nothing`).toBeGreaterThan(20);
      expect(empty.controls, `${at}: the empty state offers no action that resolves it`).toEqual(['Check again']);

      // The pin batch 5 left on this batch: at 375×812 the empty state must read as **words** rather
      // than as a column of single characters, which is what the never-collapsing pair produced —
      // a 48px box around a content column of zero width, its title over three and four lines.
      expect(empty.titleLines, `${at}: the title wraps over ${empty.titleLines} lines`).toBe(1);
      expect(
        round(empty.box.width),
        `${at}: the empty state is ${round(empty.box.width)}px wide`,
      ).toBeGreaterThan(round(empty.titleWidth));
      expect(round(empty.box.width), `${at}: the empty state is drawn in a box no wider than its own padding`).toBeGreaterThan(200);
    });
  }

  // compose-screen.md — "'Check again' (empty state) → re-reads the project list". Measured as a
  // difference across the click, not as a request count: a control that re-issues the read and
  // discards the answer would satisfy the second and not the first.
  test('Check again really re-reads the list', async ({ page }) => {
    test.setTimeout(120_000);
    const stub = await openScreen(page, VIEWPORTS[0], { projects: [], then: PROJECTS });

    const readsBefore = stub.reads();
    expect(await projectRows(page).count(), 'the empty reading drew a row').toBe(0);

    await clickAtItsOwnCentre(page, content(page).locator('.ui-empty-state').getByRole('button', { name: 'Check again' }));
    await expect(projectRows(page)).toHaveCount(PROJECTS.length, { timeout: 20_000 });
    console.log(`[REQ-51] Check again: ${readsBefore} read(s) before, ${stub.reads()} after — 0 → ${await projectRows(page).count()} project(s)`);

    expect(stub.reads(), 'Check again issued no new read of the project list').toBeGreaterThan(readsBefore);
    expect(await content(page).locator('.ui-empty-state').count(), 'the empty state survived a reading that found projects').toBe(0);
  });
});
