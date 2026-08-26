/**
 * The privileged path of the container create form, under standing verification.
 *
 * **Shaped around the reported symptom, not around the happy path.** bug-2 of the
 * repository's `bugs.md` — "containers > run container. selecting privileged the
 * popup crashs!" — depicts a surface that is open, correctly positioned and
 * drawing nothing of its own, over an application that is otherwise intact. A
 * check asserting only "a privileged container was created" would have passed
 * during the very screenshot the report came with. So every test here asserts
 * that the sheet is still **drawing its own content** after the toggle — its
 * landmarks present and carrying their text, and its rendered text exactly as
 * long as it was before the interaction — and one test blanks the open sheet on
 * purpose, to prove the assertion refuses a surface that is present and empty.
 * Anyone simplifying this file into "the sheet is visible" has written the check
 * that would not have caught the thing it exists for.
 *
 * **And that is not what the report was.** bug-2 has since been reproduced with a
 * real pointer and its cause measured: operating the switch drags the sheet
 * 1044px above the top of the viewport, because the switch's visually hidden
 * input is drawn 1346px away from the switch and the browser scrolls a focused
 * element into view. Nothing crashes and nothing blanks — the operator is
 * looking at the wrong part of an intact interface. So the content assertions
 * described above stay, guarding the symptom they were written for, and the
 * assertion that can actually fail on this defect is the **position** one:
 * the sheet's viewport coordinates across the interaction, and the switch still
 * inside the viewport after it. That is
 * `plan-docker_management_app-toggle_focus_scroll/REQ-10, REQ-11, REQ-12`, and
 * the shared measurement lives in `support/surface-stability.ts`.
 *
 * The investigation behind the file's original shape is recorded in
 * `.sdd/analysis/docker_management_app-privileged_toggle_verification.md`;
 * nothing here summarises it, and its "not reproducible" verdict is superseded
 * by `.sdd/analysis/docker_management_app-toggle_focus_scroll.md`.
 *
 * **Two limits, and the first governs everything. This check runs in one browser
 * engine. It cannot observe an engine-specific paint failure — the failure class
 * most consistent with the artifact — and it therefore CANNOT CLEAR bug-2.**
 * Anyone citing this coverage as having exonerated the privileged path is citing
 * it for something it was never able to do. **Second: the container is created
 * and never started**, so the form's `Create and start` action is outside this
 * coverage. Handing a real process substantially the host's own authority on the
 * operator's machine in order to test a checkbox is refused outright, and
 * `HostConfig.Privileged` is reported just as well on a container that never ran.
 *
 * plan-docker_management_app-privileged_toggle_verification/REQ-1 to REQ-13,
 * REQ-21, REQ-22, REQ-25.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, navEntry, openApp } from './support/fixtures.js';
import { clickAndExpectSurfaceUnmoved } from './support/surface-stability.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCard } from './support/container-cards.js';

// The width every reproduction attempt used (REQ-7), declared for the whole file
// rather than left to one test to remember: the one thing the artifact fixes
// with reasonable confidence is that the window was narrow.
test.use({ viewport: { width: 813, height: 800 } });

/**
 * The budget the content assertion gives each landmark. Short on purpose: the
 * negative control below is meant to fail fast, and a sheet that is drawing its
 * content is drawing it already.
 */
const CONTENT_TIMEOUT = 5_000;

/**
 * The sections the sheet shows, per `containers/specs/container-create-form.md`.
 * "Pulling the image" is deliberately absent: it is present only while an image
 * is being pulled, which this file never causes.
 */
const SHEET_SECTIONS = [
  'Image and identity',
  'Entrypoint and command',
  'Environment',
  'Ports',
  'Volumes',
  'Networks',
  'Restart policy',
  'Resource limits',
  'Labels',
  'Privileges',
];

/** The three actions the sheet's footer offers, per the same spec. */
const SHEET_ACTIONS = ['Cancel', 'Create only', 'Create and start'];

/** The create/run form sheet itself, so its actions are never confused with the screen's own. */
function formSheet(page: Page): Locator {
  return page.locator('.ui-form-sheet');
}

function imageField(page: Page): Locator {
  return page.getByRole('combobox', { name: 'Image reference' });
}

/** A key/value row of the sheet, addressed by the name it is announced under. */
function editorField(page: Page, name: string): Locator {
  return page.getByRole('textbox', { name, exact: true });
}

function privilegedToggle(page: Page): Locator {
  return formSheet(page).getByRole('checkbox', { name: 'Run privileged' });
}

/**
 * The **visible** switch — the track an operator aims a pointer at. The control
 * addressed above is the visually hidden input behind it, which is what a
 * pointer must never be sent to: where it is drawn is the very thing under
 * examination here.
 */
function privilegedSwitch(page: Page): Locator {
  return formSheet(page).locator('.ui-toggle:has(input[aria-label="Run privileged"]) .ui-toggle__track');
}

async function removeContainerQuietly(name: string): Promise<void> {
  // `-v`, never a bare `-f`: an anonymous volume the daemon attached on its own
  // behalf outlives the container carrying no label of ours, invisible to any
  // later sweep.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/**
 * Asserts the open sheet is **drawing its own content**, and answers how much
 * text it is drawing.
 *
 * This is the whole point of the file (REQ-1). Every landmark is asserted
 * present *and* carrying its text, because presence of a surface is not evidence
 * of its content — the artifact this check answers shows a surface that was
 * present and blank.
 *
 * The length it returns is never compared against a literal: callers compare the
 * sheet against itself across the interaction (before the toggle equals after).
 * The investigation measured 1154 characters, before and after the toggle, on
 * both builds, and the first test below measured the same 1154 on an untouched
 * sheet — that is recorded here as an observed value and is deliberately not the
 * expectation. A reworded form moves both sides together, so
 * self-relative equality survives a copy change; an absolute number would break
 * on the next wording tweak and teach whoever fixes it to loosen the assertion,
 * which is exactly the decay this check exists to resist. **No tolerance band,
 * and never a bare "not empty"**: if a measurement legitimately differs, record
 * the new value here and assert the exact new relation.
 */
async function sheetContentLength(page: Page): Promise<number> {
  const sheet = formSheet(page);
  await expect(sheet, 'the create sheet is not on screen at all').toBeVisible({ timeout: CONTENT_TIMEOUT });
  await expect(
    sheet.getByRole('heading', { level: 2, name: 'Run a container', exact: true }),
    'the sheet is drawing no title',
  ).toBeVisible({ timeout: CONTENT_TIMEOUT });

  // The **level is deliberately not stated**, and it used to be `3`.
  // `plan-ui-coherence-optimisation/REQ-78` made a field group's heading the product's one section
  // header (`form-section.md`, "the heading is the product's one section header, not a treatment
  // this component declares"), and that primitive paints an `h2` — so the ten group headings inside
  // this sheet became siblings of the sheet's own title rather than children of it. Nothing in
  // `form-section.md`, `section-header.md` or `form-sheet.md` states a heading level, so this
  // assertion holds what the contracts actually state: the sheet draws a heading naming each of its
  // groups. The level change itself is reported to the human rather than pinned here.
  for (const title of SHEET_SECTIONS) {
    await expect(
      sheet.getByRole('heading', { name: title, exact: true }),
      `the sheet is not drawing its "${title}" section`,
    ).toBeVisible({ timeout: CONTENT_TIMEOUT });
  }

  await expect(imageField(page), 'the sheet is not drawing its image field').toBeVisible({ timeout: CONTENT_TIMEOUT });
  await expect(
    sheet.getByRole('textbox', { name: 'Container name', exact: true }),
    'the sheet is not drawing its container-name field',
  ).toBeVisible({ timeout: CONTENT_TIMEOUT });
  await expect(privilegedToggle(page), 'the sheet is not drawing the privileged switch').toHaveCount(1, {
    timeout: CONTENT_TIMEOUT,
  });
  // The switch's own text, which is what an operator reads beside it. The input
  // itself is visually hidden behind the track, so the label is the drawn part.
  await expect(
    sheet.getByText('Run privileged', { exact: true }),
    'the privileged switch is drawing no label',
  ).toBeVisible({ timeout: CONTENT_TIMEOUT });

  for (const label of SHEET_ACTIONS) {
    await expect(
      sheet.getByRole('button', { name: label, exact: true }),
      `the sheet's footer is not drawing its "${label}" action`,
    ).toBeVisible({ timeout: CONTENT_TIMEOUT });
  }

  const drawn = await sheet.innerText();
  expect(drawn.trim().length, 'the sheet is present and drawing no text at all').toBeGreaterThan(0);
  return drawn.length;
}

/** Opens the create/run form from the containers screen's own toolbar — the entry the report names. */
async function openFromContainersToolbar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Run container…' }).click();
  await expect(imageField(page)).toBeVisible();
}

/** Enters the ownership labels through the form's own "Labels" section (REQ-11). */
async function enterOwnershipLabels(page: Page, caseName: string): Promise<void> {
  // The product creates the container, not the test, so `ownershipArgs()` cannot
  // reach it: these two pairs are the only way the created container can carry
  // the labels `npm run test:sweep -w server` recognises.
  await page.getByRole('button', { name: 'Add label' }).click();
  await editorField(page, 'Labels Key 1').fill(OWNER_LABEL);
  await editorField(page, 'Labels Value 1').fill(RUN_ID);
  await page.getByRole('button', { name: 'Add label' }).click();
  await editorField(page, 'Labels Key 2').fill(CASE_LABEL);
  await editorField(page, 'Labels Value 2').fill(caseName);
}

/**
 * Operates the switch and asserts what the report is about.
 *
 * **The position assertion is the one that can fail.** The content assertions
 * below it were the whole of this check and they pass with the defect active —
 * 1154 characters before and 1154 after, on a sheet that had been dragged 1044px
 * above the top of the viewport. A surface carried off screen keeps its
 * children and its text; what it does not keep is its coordinates
 * (plan-docker_management_app-toggle_focus_scroll/REQ-10). They are kept beside
 * it because they answer a different symptom — a surface present and blank —
 * and the negative control below still guards them.
 *
 * The click is delivered by a real pointer at the visible switch's own
 * coordinates (REQ-11). Nothing here may go back to activating the input
 * programmatically: that moves no focus, and focus is the entire trigger.
 */
async function togglePrivilegedAndAssertSheetSurvives(page: Page): Promise<void> {
  // The image field takes the focus when the sheet opens, so its suggestion
  // popup is showing on arrival and closes again the moment the switch takes the
  // focus. That popup is a transient overlay over the sheet rather than content
  // of the sheet, and its text is a list of the operator's own local images —
  // which no assertion here may depend on (REQ-9). It is therefore dismissed
  // before the sheet is measured, so both measurements are of the same thing.
  await imageField(page).press('Escape');
  const before = await sheetContentLength(page);

  const { surfaceBefore, surfaceAfter } = await clickAndExpectSurfaceUnmoved({
    page,
    surface: formSheet(page),
    surfaceName: 'the create sheet',
    control: privilegedSwitch(page),
    controlName: 'the privileged switch',
    hiddenControl: privilegedToggle(page),
  });
  // The whole box, not only its position: operating this switch reveals no
  // field and hides none — the sheet's "Privileges" section holds the switch and
  // the two capability fields whatever the switch says — so a sheet that changed
  // size did something this interaction has no business doing.
  expect(
    surfaceAfter,
    'the create sheet changed size when the privileged switch was operated, which reveals or hides nothing',
  ).toEqual(surfaceBefore);

  await expect(privilegedToggle(page), 'the switch does not read as selected after being operated').toBeChecked();
  const after = await sheetContentLength(page);
  expect(after, 'the sheet drew a different amount of content after the privileged switch was operated').toBe(before);
}

/**
 * Uncaught application failures during the interaction, collected for the
 * duration of each test (REQ-6).
 *
 * The investigation's most useful negative finding was a human watching a
 * console; here it is an assertion, so the next occurrence is not adjudicated by
 * whoever happened to be looking.
 */
let applicationFailures: string[] = [];

test.beforeAll(async () => {
  // The smallest fixture the suite has, built `FROM scratch` and fetched from
  // nowhere: no registry is reached by this file (REQ-12, REQ-13).
  await ensureImage(TINY_IMAGE);
});

test.beforeEach(async ({ page }) => {
  applicationFailures = [];
  page.on('pageerror', (error) => applicationFailures.push(`uncaught exception: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') applicationFailures.push(`console error: ${message.text()}`);
  });

  // Pinned, not inherited: the last active screen survives by design (REQ-115 of
  // the reference plan), so nothing here trusts the screen the previous spec left.
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

test.afterEach(() => {
  expect(applicationFailures, 'the application failed while the privileged path was exercised').toEqual([]);
});

// REQ-1, REQ-2, REQ-7 — the sheet keeps drawing its own content after the privileged switch is operated, at the
// narrow viewport the report was made at, and the switch reads as selected
test('keeps drawing the whole sheet after the privileged switch is operated, from the containers screen', async ({
  page,
}) => {
  await openFromContainersToolbar(page);

  await togglePrivilegedAndAssertSheetSurvives(page);

  // Nothing is created: this test is about the interaction alone.
  await formSheet(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(imageField(page)).toHaveCount(0);
});

// REQ-3 — the content assertion demonstrably tells "present and drawn" from "present and blank", and this
// demonstration is part of the standing check rather than a one-time observation
test('the content assertion refuses a sheet that is present and blank', async ({ page }) => {
  await openFromContainersToolbar(page);
  // It holds on the sheet as the application drew it.
  await sheetContentLength(page);

  const sheet = formSheet(page);
  // The symptom, constructed: the surface keeps the geometry it had and loses
  // its own content. No defect of the product produces that — the reproduced
  // one moves the sheet and keeps its content, which is the opposite — so this
  // is the only evidence the content assertions detect anything at all.
  //
  // The geometry is pinned on purpose. Emptied and left to collapse, the surface
  // has no box at all and reads as hidden, so a check asserting nothing but "the
  // sheet is visible" would refuse it too and this control would prove nothing
  // about the content assertions. Held at the size it had, it is exactly what
  // the artifact depicts — present, correctly positioned, drawing nothing — and
  // only an assertion about content can tell it apart from a working sheet.
  await sheet.evaluate((element) => {
    const node = element as HTMLElement;
    const box = node.getBoundingClientRect();
    node.replaceChildren();
    node.style.width = `${box.width}px`;
    node.style.height = `${box.height}px`;
  });
  await expect(sheet, 'the blanked surface must still be present').toHaveCount(1);
  await expect(sheet, 'the blanked surface must still be visible, or this control proves nothing').toBeVisible();

  let refusal: unknown;
  try {
    await sheetContentLength(page);
  } catch (failure) {
    refusal = failure;
  }
  expect(refusal, 'the content assertion accepted a surface that was present and blank').toBeInstanceOf(Error);
});

// REQ-1, REQ-2, REQ-4, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13 — the daemon holds the flag on a container that was
// created and never started, from the containers screen
test('creates a privileged container the daemon reports as privileged and never started', async ({ page }) => {
  // A real creation on a real daemon sits behind this; the default budget is
  // sized for an interaction, not for the daemon's own work.
  test.setTimeout(60_000);
  const caseName = 'privileged-from-containers-screen';
  const name = `vexel-e2e-privileged-${Date.now()}`;
  try {
    await openFromContainersToolbar(page);
    await imageField(page).fill(TINY_IMAGE);
    await page.getByRole('textbox', { name: 'Container name', exact: true }).fill(name);
    await enterOwnershipLabels(page, caseName);

    await togglePrivilegedAndAssertSheetSurvives(page);

    // `Create only`, never `Create and start` — see the file header.
    await formSheet(page).getByRole('button', { name: 'Create only', exact: true }).click();
    await expect(imageField(page)).toHaveCount(0, { timeout: 30_000 });

    // Asserted on the fixture this test made, never on totals or on a list being
    // empty: the operator's own containers are none of its business.
    await page.getByPlaceholder('Search name, image or state…').fill(name);
    const row = containerCard(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('CREATED');

    // The daemon's own answer, not the request the interface composed: privileged
    // as the daemon holds it (REQ-4), and never started (REQ-13).
    const { stdout } = await execFileAsync('docker', [
      'inspect',
      name,
      '--format',
      '{{.HostConfig.Privileged}} {{.State.Running}}',
    ]);
    expect(stdout.trim()).toBe('true false');
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-5 — the other way into the same form: an image row on the images screen, a path no reproduction attempt
// has ever taken (REQ-1, REQ-2, REQ-4, REQ-10, REQ-11, REQ-13 hold there too)
test('creates the same privileged container from an image row on the images screen', async ({ page }) => {
  test.setTimeout(60_000);
  const caseName = 'privileged-from-image-row';
  const name = `vexel-e2e-privileged-${Date.now()}`;
  try {
    // Scoped to the rail: the Dashboard's cross-navigation tiles name the same
    // screens, so an unscoped locator matches more than the entry meant here.
    await navEntry(page, 'Images & layers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
    await page.getByPlaceholder('Search reference or digest…').fill(TINY_IMAGE);
    const imageRow = page.locator('.ui-data-table__row', { hasText: TINY_IMAGE }).first();
    await expect(imageRow).toBeVisible({ timeout: 15_000 });

    // The opening and the entry click are one retried gesture, over a list first let settle: this
    // test reaches the screen through the navigation rail rather than through `openApp`, so the
    // table is still being sized while the search narrows it — and that reflow emits the scroll the
    // menu is contracted to close on (`ui-library/specs/menu.md`). Split in two, the entry click
    // spent 59.7s of a 60s budget on an entry a specified dismissal had already taken away.
    await chooseFromRowOverflowMenu(page, imageRow, 'Run…');

    // The form opens from another screen with the row's reference already in it.
    await expect(imageField(page)).toHaveValue(TINY_IMAGE);
    await page.getByRole('textbox', { name: 'Container name', exact: true }).fill(name);
    await enterOwnershipLabels(page, caseName);

    await togglePrivilegedAndAssertSheetSurvives(page);

    await formSheet(page).getByRole('button', { name: 'Create only', exact: true }).click();
    await expect(imageField(page)).toHaveCount(0, { timeout: 30_000 });

    const { stdout } = await execFileAsync('docker', [
      'inspect',
      name,
      '--format',
      '{{.HostConfig.Privileged}} {{.State.Running}}',
    ]);
    expect(stdout.trim()).toBe('true false');
  } finally {
    await removeContainerQuietly(name);
  }
});
