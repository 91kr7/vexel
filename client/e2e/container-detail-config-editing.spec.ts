/**
 * **The Config tab in editing, measured** — `…-tabs_composition_refactor/REQ-23`, `REQ-24`,
 * `REQ-25`, under REQ-44 and REQ-45.
 *
 * All three are claims about **what is drawn where**. "Each group sits inside its own container"
 * (REQ-23) is not "five headings exist" — the arrangement this batch replaces had all five headings
 * and no container at all — so what is asserted here is a bounded surface per group: one that paints
 * a boundary, insets its own fields, and holds that group's heading and no other's. "The two small
 * groups sit side by side" (REQ-24) is a claim about two boxes, and about the state the library's
 * named `pair` promises when the box cannot carry both, so **both states are measured**: side by
 * side at a width that holds them, stacked at full width when it does not. And the footer's standing
 * statement (REQ-25) is asserted **before anything is touched**, which is the whole of the human's
 * decision on it: it says what a save *would* cost, and is not a response to an edit.
 *
 * What jsdom can answer — which element holds which group, which two share the pair, what the footer
 * states beside its dirty indicator — is asserted in
 * `client/test/unit/container-detail-panel.test.tsx` and `client/test/unit/form-footer.test.tsx`,
 * and is not repeated here.
 *
 * **Two neighbours own what this file does not.** REQ-2 — the health-check reveal moving no edge of
 * the dialog, on this new arrangement — is `container-detail-switch-surface.spec.ts`'s, measured
 * with a real pointer at the visible track. REQ-26 — the confirmation still asked before a container
 * is stopped, removed and recreated — is `containers.spec.ts`'s, and is unchanged by this batch.
 *
 * **The fixture is this file's own**: a container created and never started, from the suite's own
 * `vexel-test-tiny:1`, carrying the ownership labels and one environment variable so the
 * `Environment variables` group has a row of its own. Nothing here saves, so the daemon holds the
 * container exactly as it was created and no anonymous volume is orphaned; it is removed with
 * `docker rm -fv` in a `finally` all the same (REQ-45).
 */
import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { boxOf, clickAtItsCentre } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';

const CASE_NAME = 'container-detail-config-editing';

/** The five groups REQ-23 names, in the order the form composes them. */
const GROUPS = ['Runtime', 'Health check', 'Environment variables', 'Port mappings', 'Mounts'] as const;
type GroupTitle = (typeof GROUPS)[number];

/** A width that comfortably carries two columns, and one that cannot (`layout-primitives.md`: ~744px). */
const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 640, height: 900 };

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GroupSurface {
  /** Whether the group's heading has a bounded surface of its own at all. */
  contained: boolean;
  /** True when the "container" found is the dialog's own surface — i.e. no container of the group's own. */
  isTheDialog: boolean;
  box: Box;
  /** Every section heading the surface holds: its own alone, or it is not that group's. */
  headings: string[];
  /** The thickest of the four border widths, in px. */
  border: number;
  /** The surface's own background, as the browser resolves it. */
  background: string;
  /** How far the group's heading is inset from the surface's leading edge. */
  inset: number;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function describeBox(box: Box): string {
  return `${round(box.x)},${round(box.y)} ${round(box.width)}×${round(box.height)}`;
}

/** A background that paints nothing: the ground shows through, which is the arrangement being replaced. */
function paintsNothing(background: string): boolean {
  return background === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(background);
}

/**
 * Each group's own container, read through the heading an operator sees: the nearest bounded surface
 * around it. Under the arrangement this batch replaces there is none — the nearest surface is the
 * dialog itself, shared by all five — which is exactly what makes the reading falsifiable.
 */
async function groupSurfaces(page: Page): Promise<Record<GroupTitle, GroupSurface>> {
  const measured = await containerDetail(page).evaluate((detail, titles: readonly string[]) => {
    const dialogSurface = detail.closest('.ui-surface');
    const rectOf = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return titles.map((title) => {
      const heading = [...detail.querySelectorAll('.ui-section-header__title')].find((node) => node.textContent === title);
      if (heading === undefined) {
        return [title, null] as const;
      }
      const surface = heading.closest('.ui-surface');
      if (surface === null) {
        return [title, { contained: false, isTheDialog: false, box: rectOf(heading), headings: [title], border: 0, background: 'transparent', inset: 0 }] as const;
      }
      const style = getComputedStyle(surface);
      const border = Math.max(
        parseFloat(style.borderTopWidth),
        parseFloat(style.borderRightWidth),
        parseFloat(style.borderBottomWidth),
        parseFloat(style.borderLeftWidth),
      );
      return [
        title,
        {
          contained: surface !== dialogSurface,
          isTheDialog: surface === dialogSurface,
          box: rectOf(surface),
          headings: [...surface.querySelectorAll('.ui-section-header__title')].map((node) => node.textContent ?? ''),
          border,
          background: style.backgroundColor,
          inset: heading.getBoundingClientRect().x - surface.getBoundingClientRect().x,
        },
      ] as const;
    });
  }, GROUPS);

  const surfaces = {} as Record<GroupTitle, GroupSurface>;
  for (const [title, surface] of measured) {
    expect(surface, `the edit form draws no \`${title}\` group at all`).not.toBeNull();
    surfaces[title as GroupTitle] = surface as GroupSurface;
  }
  return surfaces;
}

/** What the footer states and where: its note, its dirty indicator and its save action. */
async function footerParts(page: Page): Promise<{ note: { text: string; box: Box }; status: { text: string; box: Box }; save: Box }> {
  const save = containerDetail(page).getByRole('button', { name: /^(Save changes|Saving…)$/ });
  await save.scrollIntoViewIfNeeded();
  const saveBox = await boxOf(save, 'the form’s save action');
  const parts = await save.evaluate((button) => {
    const rectOf = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    // The footer's leading side, as `ui-library/specs/form-footer.md` composes it: the note above
    // the dirty indicator, both beside the row of actions the save belongs to.
    const leading = button.closest('.ui-row')?.parentElement?.firstElementChild ?? null;
    if (leading === null) return null;
    const children = [...leading.children];
    const note = children.length > 1 ? children[0] : null;
    const status = children.length > 1 ? children[1] : leading;
    return {
      note: note === null ? null : { text: note.textContent ?? '', box: rectOf(note) },
      status: { text: status.textContent ?? '', box: rectOf(status) },
    };
  });
  expect(parts, 'the form draws no footer of the library’s own').not.toBeNull();
  expect(parts!.note, 'the footer’s leading side carries the dirty indicator alone: no statement stands above it').not.toBeNull();
  return { note: parts!.note!, status: parts!.status, save: saveBox };
}

async function createFixture(name: string): Promise<void> {
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', name, ...ownershipArgs(CASE_NAME), '-e', 'FOO=bar', TINY_IMAGE]);
}

async function removeFixture(name: string): Promise<void> {
  // `-v` and never a bare `-f`: an anonymous volume the daemon attached on its own behalf outlives
  // the container carrying no label of ours, invisible to any later sweep.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** Opens the fixture's detail at a stated viewport and puts its Config tab into editing. */
async function openEditForm(page: Page, name: string, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  // Pinned rather than inherited: the last active screen survives by design (REQ-113).
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  // Searched for rather than looked for in the list: the operator's own containers are none of this
  // file's business, and the list may hold hundreds of them.
  await page.getByPlaceholder('Search name, image or state…').fill(name);
  await expect(containerCard(page, name), 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });
  await openContainerDetail(page, name);

  const edit = containerDetail(page).getByRole('button', { name: 'Edit configuration', exact: true });
  await expect(edit, 'the Config tab never finished loading its inspect data').toBeVisible({ timeout: 20_000 });
  // A real pointer at the visible control's own coordinates (REQ-44).
  await clickAtItsCentre(page, edit, 'the Edit configuration action');
  await expect(containerDetail(page).getByRole('combobox', { name: 'Restart policy' }), 'the edit form never opened').toBeVisible();
}

// REQ-23, REQ-24 — five groups, each inside a bounded container of its own, with the two small ones
// side by side at a width that carries both and the other three at full width below them.
test('Config in editing: five groups in five containers, the two small ones side by side', async ({ page }) => {
  const name = `vexel-e2e-config-edit-groups-${Date.now()}`;
  try {
    await createFixture(name);
    await openEditForm(page, name, WIDE);

    const surfaces = await groupSurfaces(page);
    console.log(
      `[REQ-23] ${GROUPS.map((title) => `${title} ${describeBox(surfaces[title].box)} border ${round(surfaces[title].border)} inset ${round(surfaces[title].inset)}`).join(
        ' | ',
      )}`,
    );

    for (const title of GROUPS) {
      const surface = surfaces[title];
      expect(
        surface.contained,
        surface.isTheDialog
          ? `the \`${title}\` group has no container of its own: its nearest surface is the dialog itself, so it is a heading on the continuous ground`
          : `the \`${title}\` group has no bounded surface around it at all`,
      ).toBe(true);
      expect(surface.headings, `the container holding \`${title}\` also holds ${JSON.stringify(surface.headings)}, so it is not that group's own`).toEqual([
        title,
      ]);
      // A container is a container because it is bounded and because its content sits inside it: a
      // boundary the browser paints, and an inset separating the fields from the edge.
      expect(
        surface.border > 0 || !paintsNothing(surface.background),
        `the \`${title}\` group's container paints neither a border (${round(surface.border)}px) nor a ground (${surface.background}), so nothing bounds it`,
      ).toBe(true);
      expect(surface.inset, `the \`${title}\` group's fields reach the edge of its container (inset ${round(surface.inset)}px)`).toBeGreaterThan(0);
    }

    const boxes = GROUPS.map((title) => surfaces[title].box);
    expect(new Set(boxes.map((box) => `${box.x},${box.y}`)).size, 'two of the five groups are drawn at the same origin, so they share a container').toBe(5);

    // REQ-24 — Runtime and Health check on one row: the same top edge, and horizontal ranges that do
    // not overlap.
    const runtime = surfaces.Runtime.box;
    const health = surfaces['Health check'].box;
    console.log(`[REQ-24] wide: Runtime ${describeBox(runtime)} / Health check ${describeBox(health)}`);
    expect(
      Math.abs(runtime.y - health.y),
      `Runtime starts at y=${round(runtime.y)} and Health check at y=${round(health.y)}, so they are not on one row`,
    ).toBeLessThanOrEqual(1);
    expect(
      runtime.x + runtime.width,
      `Runtime ends at x=${round(runtime.x + runtime.width)} while Health check begins at x=${round(health.x)}: the two overlap`,
    ).toBeLessThanOrEqual(health.x + 1);
    expect(
      Math.abs(runtime.width - health.width),
      `the two share a row at ${round(runtime.width)}px and ${round(health.width)}px, which is not the equal pair the arrangement promises`,
    ).toBeLessThanOrEqual(1);

    // The other three below them, each spanning what the two share between them.
    const pairBottom = Math.max(runtime.y + runtime.height, health.y + health.height);
    for (const title of ['Environment variables', 'Port mappings', 'Mounts'] as const) {
      const box = surfaces[title].box;
      expect(box.y, `the \`${title}\` group starts at y=${round(box.y)}, above the bottom of the two small groups (${round(pairBottom)})`).toBeGreaterThanOrEqual(
        pairBottom - 1,
      );
      expect(
        box.width,
        `the \`${title}\` group is ${round(box.width)}px wide against ${round(runtime.width)}px for one of the two small ones, so it is not at full width`,
      ).toBeGreaterThan(runtime.width + 1);
    }
  } finally {
    await removeFixture(name);
  }
});

// REQ-24 — the other half of the claim: when the box cannot carry both, the two stack, each at full
// width, rather than being squeezed side by side.
test('Config in editing: the two small groups stack at full width when the dialog cannot carry both', async ({ page }) => {
  const name = `vexel-e2e-config-edit-stack-${Date.now()}`;
  try {
    await createFixture(name);
    await openEditForm(page, name, WIDE);

    // Resized with the form open, so what is compared is one form under two widths rather than two
    // separate openings of it.
    await page.setViewportSize(NARROW);
    await expect(containerDetail(page).getByRole('combobox', { name: 'Restart policy' })).toBeVisible();

    const surfaces = await groupSurfaces(page);
    const runtime = surfaces.Runtime.box;
    const health = surfaces['Health check'].box;
    const environment = surfaces['Environment variables'].box;
    console.log(`[REQ-24] narrow: Runtime ${describeBox(runtime)} / Health check ${describeBox(health)} / Environment ${describeBox(environment)}`);

    expect(
      health.y,
      `at ${NARROW.width}px Health check still starts at y=${round(health.y)} while Runtime ends at ${round(runtime.y + runtime.height)}: the two are still side by side`,
    ).toBeGreaterThanOrEqual(runtime.y + runtime.height - 1);
    for (const [title, box] of [
      ['Runtime', runtime],
      ['Health check', health],
    ] as const) {
      expect(
        Math.abs(box.width - environment.width),
        `stacked, \`${title}\` is ${round(box.width)}px wide against the full-width groups' ${round(environment.width)}px`,
      ).toBeLessThanOrEqual(1);
    }
  } finally {
    await removeFixture(name);
  }
});

// REQ-25 — the footer states what a save would cost from the moment the form opens, above the dirty
// indicator and never instead of it, and it goes on stating it whatever is edited.
test('Config in editing: the footer states the recreate cost from the moment the form opens', async ({ page }) => {
  const name = `vexel-e2e-config-edit-note-${Date.now()}`;
  try {
    await createFixture(name);
    await openEditForm(page, name, WIDE);

    // Read before a single field is touched: that is the whole of what "standing" means here.
    const opened = await footerParts(page);
    console.log(`[REQ-25] on opening: note "${opened.note.text}" ${describeBox(opened.note.box)} / status "${opened.status.text}" ${describeBox(opened.status.box)}`);

    expect(opened.note.text, 'the footer says nothing about the environment').toMatch(/environment/i);
    expect(opened.note.text, 'the footer says nothing about the mounts').toMatch(/mounts/i);
    expect(opened.note.text, 'the footer never states that a recreate is what those changes cost').toMatch(/recreat/i);
    expect(opened.status.text, 'the form reports an edit before anything was touched, so the statement above may be a response to one').toBe('No changes');

    // Where it is drawn: above the indicator, and on the footer's leading side.
    expect(
      opened.note.box.y + opened.note.box.height,
      `the note ends at y=${round(opened.note.box.y + opened.note.box.height)}, below the top of the dirty indicator (${round(opened.status.box.y)})`,
    ).toBeLessThanOrEqual(opened.status.box.y + 1);
    expect(
      opened.note.box.x + opened.note.box.width,
      `the note reaches x=${round(opened.note.box.x + opened.note.box.width)}, past the save action's leading edge (${round(opened.save.x)})`,
    ).toBeLessThanOrEqual(opened.save.x);

    // And it stands: a change the recreate does not concern leaves it exactly where it was.
    await containerDetail(page).getByRole('combobox', { name: 'Restart policy' }).selectOption('always');
    const edited = await footerParts(page);
    expect(edited.status.text, 'the form did not register the restart-policy change, so this second reading proves nothing').toBe('Unsaved changes');
    expect(edited.note.text, 'the statement disappeared once a field was edited').toBe(opened.note.text);
  } finally {
    await removeFixture(name);
  }
});
