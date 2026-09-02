import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { ALPINE_IMAGE, TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCard, containerDetail, openContainerDetail, openRawPayload, rawPayloadSection } from './support/container-cards.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * **Every copy affordance has left the client — checked at runtime, over all
 * eight screens and all twenty-four instance sites.** REQ ids belong to
 * `plan-docker_management_app-remove_copy_controls`.
 *
 * **Absence is asserted by behaviour, never by the label** (REQ-25). Every
 * instance on the delivered build happened to say `Copy`; that is a fact about
 * that build, not about the design — the removed component took a `label` prop,
 * so an icon-only or differently-worded instance was one edit away, and a check
 * written against the word would have passed on a build still shipping one. Two
 * mechanisms are used here instead, and neither mentions the word:
 *
 * - **the container is emptied of controls**: the surfaces that held one are
 *   asserted to hold no interactive element at all beyond the named survivors
 *   (`Download`, `Re-run`, `Show`/`Hide`, `Rotate`) — an icon-only instance is
 *   still a control in that box and still fails;
 * - **the page is instrumented**: `navigator.clipboard` and `document.execCommand`
 *   are replaced before the application loads with recorders, and **no write is
 *   observed** while the eight screens are driven. A grep cannot see a write
 *   arriving through a bundled dependency; this can (REQ-2, REQ-3).
 *
 * **Content assertions stand beside the behavioural ones, never instead of them**
 * (REQ-29): each affected value is still shown with its exact delivered text and
 * is still selectable. A surface that lost its control *and* its value has passed
 * half a check.
 *
 * **Every interaction is a real pointer at the visible control's own coordinates**
 * (REQ-27) — a row's own cell, a tab, a section header, a tree row. Never
 * `element.click()`, never a dispatched event, never a hidden target.
 *
 * **Three sites render one control per row** — console entries, health-log blocks
 * and definition bands — and are asserted over **every** row present, never the
 * first: the daemon decides how many there are (REQ-26).
 *
 * **The delivered build's own figures**, measured by this spec before the removal
 * existed (2026-08-14, this environment): 24 instance sites over 8 screens, every
 * one of them labelled `Copy`.
 *
 * Fixture discipline (REQ-35): every container, volume, network, image and
 * compose project is this spec's own, carries the ownership labels, and is
 * removed in a `finally` with `docker rm -fv`. Nothing assumes an empty daemon —
 * each row is found through the screen's own search. Nothing reaches Docker Hub.
 *
 * **Sites 13–19 were the swarm screen's** and left with the area on 2026-08-27
 * (plan-docker_management_app-swarm_removal/REQ-1). The site numbers below are
 * the delivered build's own and are kept as they were taken; what is swept is
 * every site the product still has.
 */

declare global {
  interface Window {
    __clipboardWrites?: string[];
  }
}

/**
 * Records every route to the clipboard the platform offers, before any
 * application code runs.
 *
 * Installed as an init script so it is in place for the first paint of every
 * document, including the ones a reload produces. It does not merely count: it
 * keeps what was written, so a failure says which value reached the clipboard
 * and from where.
 */
async function recordClipboardWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const writes: string[] = [];
    window.__clipboardWrites = writes;
    const record = (what: unknown) => {
      writes.push(typeof what === 'string' ? what : String(what));
      return Promise.resolve();
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => record(text),
        write: (items: unknown) => record(items),
        readText: () => Promise.resolve(''),
        read: () => Promise.resolve([]),
      },
    });
    const originalExecCommand = document.execCommand?.bind(document);
    document.execCommand = (command: string, ...rest: unknown[]) => {
      if (command === 'copy' || command === 'cut') {
        record(`execCommand(${command})`);
        return true;
      }
      return originalExecCommand ? (originalExecCommand as (c: string, ...r: unknown[]) => boolean)(command, ...rest) : false;
    };
  });
}

async function expectNoClipboardWrite(page: Page, where: string): Promise<void> {
  const writes = await page.evaluate(() => window.__clipboardWrites ?? []);
  expect(writes, `${where} — something put a value on the clipboard, so a copy affordance is still reachable there`).toEqual([]);
}

/**
 * A control the operator can operate, whatever it is called and whether or not it
 * carries text: this is the criterion the word `Copy` is deliberately not.
 */
const CONTROL_SELECTOR = 'button, [role="button"], a[href], input:not([type="hidden"])';

/** Every property band of a section, asserted to hold no control at all — over all of them, not the first (REQ-26). */
async function expectBandsHoldNoControl(section: Locator, where: string): Promise<void> {
  await expect(section, `${where} — the property section is not on screen, so nothing about it can be checked`).toBeVisible();
  const offending = await section.evaluate((element, selector) => {
    return Array.from(element.querySelectorAll('.ui-definition-list__row'))
      .map((band) => {
        const label = band.querySelector('.ui-definition-list__label')?.textContent ?? '(no label)';
        const controls = Array.from(band.querySelectorAll<HTMLElement>(selector));
        return controls.length === 0 ? null : `${label}: ${controls.map((control) => control.textContent?.trim() || control.tagName.toLowerCase()).join(', ')}`;
      })
      .filter((entry): entry is string => entry !== null);
  }, CONTROL_SELECTOR);
  expect(offending, `${where} — these property bands still hold a control beside their value`).toEqual([]);
}

/** Every payload band in scope, at every depth, asserted to hold no control at all. */
async function expectPayloadBandsHoldNoControl(scope: Locator, where: string): Promise<void> {
  await expect(scope, `${where} — the payload rendering is not on screen, so nothing about it can be checked`).toBeVisible();
  const offending = await scope.evaluate((element, selector) => {
    return Array.from(element.querySelectorAll('.ui-payload-band'))
      .map((band) => {
        const label = band.querySelector('.ui-payload-band__label')?.textContent ?? '(no label)';
        const controls = Array.from(band.querySelectorAll<HTMLElement>(selector));
        return controls.length === 0 ? null : `${label}: ${controls.map((control) => control.textContent?.trim() || control.tagName.toLowerCase()).join(', ')}`;
      })
      .filter((entry): entry is string => entry !== null);
  }, CONTROL_SELECTOR);
  expect(offending.length, `${where} — no band is drawn at all, so this site was not reached`).toBeGreaterThanOrEqual(0);
  expect(offending, `${where} — these bands still hold a control beside their value`).toEqual([]);
}

/** Every raw payload / code block in scope, asserted to hold no control and no action row at all. */
async function expectCodeBlocksHoldNoControl(scope: Locator, where: string, expectedCount: number): Promise<void> {
  const blocks = scope.locator('.ui-code-viewer');
  await expect(blocks.first(), `${where} — no code block is on screen, so this site was not reached`).toBeVisible();
  expect(await blocks.count(), `${where} — a different number of code blocks than this site is supposed to render`).toBeGreaterThanOrEqual(expectedCount);
  const offending = await scope.evaluate((element, selector) => {
    return Array.from(element.querySelectorAll('.ui-code-viewer')).flatMap((block, index) => {
      const controls = Array.from(block.querySelectorAll<HTMLElement>(selector));
      const rows = Array.from(block.querySelectorAll('.ui-code-viewer__actions'));
      return [
        ...(controls.length > 0 ? [`block ${index}: ${controls.map((control) => control.textContent?.trim() || control.tagName.toLowerCase()).join(', ')}`] : []),
        // REQ-11 — the row held the control as its only child: it must not survive it.
        ...(rows.length > 0 ? [`block ${index}: an action row survives with ${rows[0]!.children.length} children`] : []),
      ];
    });
  }, CONTROL_SELECTOR);
  expect(offending, `${where} — these code blocks still hold a control, or an action row that lost its only child`).toEqual([]);
}

/** The controls an action group actually holds, by their accessible text. */
async function controlsOf(group: Locator): Promise<string[]> {
  return group.evaluate(
    (element, selector) =>
      Array.from(element.querySelectorAll<HTMLElement>(selector)).map((control) => control.textContent?.trim() || `<${control.tagName.toLowerCase()}>`),
    CONTROL_SELECTOR,
  );
}

/** A value that is still selectable by hand: the fallback the whole removal leaves the operator (REQ-17). */
async function expectSelectable(value: Locator, where: string): Promise<void> {
  const presentation = await value.evaluate((element) => {
    const style = getComputedStyle(element);
    return { userSelect: style.userSelect, textOverflow: style.textOverflow, overflowWrap: style.overflowWrap, title: element.getAttribute('title') };
  });
  expect(presentation.userSelect, `${where} — the value cannot be selected with the mouse any more`).not.toBe('none');
  expect(presentation.textOverflow, `${where} — the value is clamped with an ellipsis, which turns a convenience loss into a data loss`).not.toBe('ellipsis');
  // REQ-3 — a `title` carrying the full value is the same affordance under another name.
  expect(presentation.title, `${where} — the value carries a title attribute, which is the removed affordance renamed`).toBeNull();
}

// ─── fixtures ────────────────────────────────────────────────────────────────

async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs, '--entrypoint', 'sleep', ALPINE_IMAGE, '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function createStandaloneImage(tag: string, containerName: string): Promise<void> {
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
  await execFileAsync('docker', ['commit', containerName, tag]);
}

async function removeStandaloneImage(tag: string, containerName: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
  await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
}

// ─── shared locators ─────────────────────────────────────────────────────────

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

function imageRow(page: Page, text: string): Locator {
  return page.locator('.ui-data-table__row', { hasText: text }).first();
}

/** The container's card on the containers screen — the surface that carries its name and its values. */
function containerRow(page: Page, name: string): Locator {
  return containerCard(page, name).first();
}

/**
 * Opens one of the image's analyses from the row's own overflow menu.
 *
 * Opening **and** choosing are retried together, over a settled list: the list
 * re-reads from daemon events, and every one of the menu's specified dismissals
 * (`ui-library/specs/menu.md`) lands between the two halves when they are
 * retried separately.
 */
async function chooseRowAction(page: Page, row: Locator, label: string): Promise<void> {
  await chooseFromRowOverflowMenu(page, row, label);
}

test.beforeEach(async ({ page }) => {
  await recordClipboardWrites(page);
});

// ─── screen 1 · images & layers (sites 1–4) ──────────────────────────────────

// REQ-1, REQ-16, REQ-17, REQ-19, REQ-25, REQ-26, REQ-29 — the image detail panel's `Id` band and its
// raw payload block: two of the twenty-four sites, and the surface the `Id` fallback rests on.
test('images: the detail panel offers no copy on its Id band or its raw payload, and both still read as delivered', async ({ page }) => {
  await ensureImage(ALPINE_IMAGE);
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('Search reference or digest…').fill(ALPINE_IMAGE);
  const row = imageRow(page, ALPINE_IMAGE);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator('.ui-data-table__cell').first().click();

  const panel = page.locator('.ui-detail-panel');
  const section = panel.locator('.ui-definition-list').first();
  await expect(section).toBeVisible({ timeout: 20_000 });

  // Site 1 — the `Id` band (REQ-1), and every other band of the section with it (REQ-26).
  await expectBandsHoldNoControl(section, 'Images → detail panel, property section');

  // Beside it, never instead of it (REQ-29): the value is unchanged and still selectable. The panel
  // shows `sha256:` plus twelve characters — 19 characters, exactly as delivered, unwidened (REQ-16).
  const idValue = section.locator('.ui-definition-list__row', { hasText: 'Id' }).first().locator('.ui-definition-list__value');
  await expect(idValue).toHaveText(/^sha256:[0-9a-f]{12}$/);
  await expectSelectable(idValue, 'Images → detail panel, the `Id` value');

  // The server-shortened `Digest` keeps exactly its delivered presentation; it never had a control
  // and is not attributable to this report (REQ-16, REQ-19).
  //
  // **The band is conditional since 2026-08-15.** `plan-ui-coherence-optimisation/REQ-58` stops the
  // panel drawing `Digest` where the daemon reports the image's own id under `RepoDigests` — one
  // value under two names — which is what a containerd-backed daemon does for an image restored
  // from the run's own registry. So the presentation is asserted where the band exists, and its
  // absence is reported rather than waited for: waiting for it made this test's outcome a property
  // of the daemon's image store (`images/specs/image-detail-panel.md`).
  const digestRow = section.locator('.ui-definition-list__row', { hasText: 'Digest' }).first();
  if ((await digestRow.count()) > 0) {
    await expectSelectable(digestRow.locator('.ui-definition-list__value'), 'Images → detail panel, the `Digest` value');
  } else {
    console.log(`[REQ-58] ${ALPINE_IMAGE} states no repository digest of its own on this daemon, so the panel draws no Digest band`);
  }

  // Site 2 — the raw payload block above which the control sat (REQ-11).
  await expectCodeBlocksHoldNoControl(panel, 'Images → detail panel, raw payload', 1);

  // REQ-19 — the fallback the removal leaves: the full id is present, complete and selectable, in
  // the Engine's own payload on this same surface. Verified, not assumed.
  const fullId = (await execFileAsync('docker', ['image', 'inspect', '--format', '{{.Id}}', ALPINE_IMAGE])).stdout.trim();
  await expect(panel.locator('.ui-code-viewer__code').last()).toContainText(fullId);

  // REQ-33 — the section and the block contribute no focus stop at all now: the tab order shortened
  // by exactly the removed controls, and no group is left announced with no members.
  expect(await controlsOf(section), 'Images → detail panel — the property section still holds a focusable control').toEqual([]);
  await expectNoClipboardWrite(page, 'Images → detail panel');
});

// REQ-1, REQ-25, REQ-26 — the layer explorer's `Build step` band (site 3), reached by selecting a
// layer with a real pointer (REQ-27).
test('images: the layer explorer offers no copy on the selected layer\'s build step', async ({ page }) => {
  await ensureImage('registry:2');
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('Search reference or digest…').fill('registry');
  const row = imageRow(page, 'registry:2');
  await expect(row).toBeVisible({ timeout: 20_000 });

  await chooseRowAction(page, row, 'Explore layers…');
  const modal = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Layer stack — registry:2' }) });
  await expect(modal).toBeVisible();
  const layerRows = modal.locator('.ui-data-table__row');
  await expect(layerRows.first()).toBeVisible({ timeout: 20_000 });

  await layerRows.first().locator('.ui-data-table__cell').first().click();
  const section = modal.locator('.ui-definition-list').first();
  await expect(section).toBeVisible({ timeout: 10_000 });
  await expectBandsHoldNoControl(section, 'Images → layer explorer, the selected layer\'s build step');
  await expectNoClipboardWrite(page, 'Images → layer explorer');
});

// REQ-1, REQ-25, REQ-34 — the filesystem browser's entry `Path` band (site 4): the site of the
// inventory most easily missed, and bug-3's own metadata pane, which comes out otherwise unchanged.
test('images: the filesystem browser offers no copy on a selected entry\'s path', async ({ page }) => {
  // 120s = 60 + 25 + 20 + 15 (REQ-64, REQ-65):
  //   60s — the extraction: the ceiling this case declares for the tree's first entry, and the
  //         largest single step it runs;
  //   25s — the image fixture: the single-layer image ensured on the daemon, then `docker create`
  //         and `docker commit` here, and the image and its container removed in the `finally`;
  //   20s — the images screen opens and the fixture's row appears in the list;
  //   15s — the overflow-menu gesture, the cost warning, the entry click and the pane read.
  test.setTimeout(120_000);
  const containerName = `vexel-e2e-nocopy-fs-src-${Date.now()}`;
  const tag = `vexel-e2e-nocopy-fs-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await openApp(page, 'images-layers');
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder('Search reference or digest…').fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 20_000 });

    await chooseRowAction(page, row, 'Browse filesystem…');
    const modal = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Filesystem — ${tag}` }) });
    await expect(modal).toBeVisible();
    const warning = page.getByRole('heading', { name: `Confirm: ${tag}` });
    await expect(warning).toBeVisible({ timeout: 20_000 });
    await warning.locator('xpath=..').getByRole('button', { name: 'Extract' }).click();

    const entries = modal.locator('.ui-tree-view__row');
    await expect(entries.first()).toBeVisible({ timeout: 60_000 });
    await entries.first().click();

    const section = modal.locator('.ui-definition-list').first();
    await expect(section).toBeVisible({ timeout: 20_000 });
    await expectBandsHoldNoControl(section, 'Images → filesystem browser, the entry metadata pane');

    // REQ-16, REQ-17 — the path still reads as delivered and is still selectable.
    const pathValue = section.locator('.ui-definition-list__row', { hasText: 'Path' }).first().locator('.ui-definition-list__value');
    await expect(pathValue).toHaveText(/^\//);
    await expectSelectable(pathValue, 'Images → filesystem browser, the `Path` value');
    await expectNoClipboardWrite(page, 'Images → filesystem browser');
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// ─── screen 2 · containers (sites 5–9) ───────────────────────────────────────

// REQ-1, REQ-16, REQ-19, REQ-25, REQ-26, and `…-inspect_full_payload/REQ-24` — the `Inspect` tab's
// `Id` and `Image` fields, the health-log output the payload carries and the raw payload block.
//
// **The tab is the payload's own shape now**: the curated property list and the `Health` section
// with its code blocks are gone (`…-inspect_full_payload/REQ-3`, REQ-5), so the same absence is
// asserted on the bands and the section that replaced them rather than dropped with the elements it
// used to name. The tab's only controls are the find and the section headers, which is the widest
// form of the claim this site can make.
test('containers: the Inspect tab offers no copy on any field, on its health log or on its raw payload', async ({ page }) => {
  const name = `vexel-e2e-nocopy-inspect-${Date.now()}`;
  try {
    await createSleepingContainer(name, ['--health-cmd', 'echo ok', '--health-interval', '1s', '--health-retries', '1', '--health-start-period', '0s']);
    await openApp(page, 'containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });
    await expect(containerRow(page, name)).toBeVisible({ timeout: 20_000 });
    await openContainerDetail(page, name);

    const detail = containerDetail(page);
    await expect(detail).toBeVisible();
    await detail.getByRole('tab', { name: 'Inspect' }).click();
    const explorer = detail.locator('.ui-payload-explorer');
    await expect(explorer).toBeVisible({ timeout: 20_000 });

    // Sites 5 and 6 — `Id` and `Image` among every other band the payload draws, at every depth.
    await expectPayloadBandsHoldNoControl(explorer, 'Containers → Inspect, the payload bands');

    // REQ-19 — the full container id is obtained by hand-selection, and the tab carries it as the
    // daemon's own literal rather than as the twelve characters the dialog's header states.
    const fullId = (await execFileAsync('docker', ['inspect', '--format', '{{.Id}}', name])).stdout.trim();
    const idValue = explorer
      .locator('.ui-payload-band')
      .filter({ has: page.locator('.ui-payload-band__label', { hasText: /^Id$/ }) })
      .first()
      .locator('.ui-payload-band__value');
    await expect(idValue).toHaveText(fullId);
    await expectSelectable(idValue, 'Containers → Inspect, the `Id` value');

    // Site 7 — the health-log output, which the payload carries as fields of its own now: found
    // through the find, so no assumption is made about which section it sits in.
    await detail.getByLabel('Find in payload').fill('Output');
    const outputs = explorer.locator('.ui-payload-band').filter({ has: page.locator('.ui-payload-band__label', { hasText: /^Output$/ }) });
    await expect(outputs.first(), 'the health log the daemon produced is nowhere in the tab').toBeVisible({ timeout: 30_000 });
    await expectPayloadBandsHoldNoControl(explorer, 'Containers → Inspect, the health-log fields');
    await detail.getByLabel('Find in payload').fill('');

    // Site 8 — the raw payload block, still behind its own header and still the only code block of
    // the tab: the header is pressed, and what is then on screen holds no control and carries the
    // whole id for a hand-selection.
    await expect(rawPayloadSection(page).locator('.ui-collapsible-section__header'), 'the payload section is open when the tab opens').toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await openRawPayload(page);
    await expectCodeBlocksHoldNoControl(detail, 'Containers → Inspect, raw payload', 1);
    await expect(detail.locator('.ui-code-viewer__code').last()).toContainText(fullId);
    await expectSelectable(detail.locator('.ui-code-viewer__code').last(), 'Containers → Inspect, the raw payload block');

    // The tab's whole control inventory: the find field, and the section headers that disclose. The
    // disclosure is what the requirement never objected to; anything else here would be new.
    const controls = await controlsOf(explorer);
    const disclosures = await explorer.locator('.ui-collapsible-section__header').count();
    expect(
      controls.length,
      `Containers → Inspect — the tab holds ${controls.length} controls against ${disclosures} section headers and one find field: ${controls.join(', ')}`,
    ).toBe(disclosures + 1);
    await expectNoClipboardWrite(page, 'Containers → Inspect');
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-1, REQ-12, REQ-20, REQ-25 — the container logs view's stream (site 9), and the fallback the
// whole log cost rests on: `Download` still delivers the whole buffer.
test('containers: the logs view offers no copy, and Download still delivers the whole buffer', async ({ page }) => {
  const name = `vexel-e2e-nocopy-logs-${Date.now()}`;
  try {
    await ensureImage(ALPINE_IMAGE);
    await execFileAsync('docker', [
      'run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sh', ALPINE_IMAGE,
      '-c', 'echo hello-from-stdout; echo second-line; sleep 300',
    ]);
    await openApp(page, 'containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });
    await expect(containerRow(page, name)).toBeVisible({ timeout: 20_000 });
    await openContainerDetail(page, name);
    const detail = containerDetail(page);
    await detail.getByRole('tab', { name: 'Logs' }).click();
    await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 20_000 });

    // Site 9 — the stream's action row (REQ-12, REQ-13). It held `Download` and nothing else at all
    // until 2026-08-15, when `plan-ui-coherence-optimisation/REQ-62` moved the stream's search onto
    // it: the delivered third toolbar row was `Download` alone, and the search shares the row now
    // (`ui-library/specs/log-stream.md`, its `toolbar` slot). What this report contracts is the
    // absence of a **copy**, not the absence of every neighbour, so that is what is asserted —
    // beside the clipboard check at the end of the test, which no rearrangement can satisfy by
    // accident.
    const actions = detail.locator('.ui-log-stream__actions');
    await expect(actions).toBeVisible();
    const rowControls = await controlsOf(actions);
    expect(rowControls, 'Containers → Logs — the stream action row lost `Download`').toContain('Download');
    expect(
      rowControls.filter((control) => /copy/i.test(control)),
      'Containers → Logs — a copy affordance is back on the stream action row',
    ).toEqual([]);
    await expect(actions.getByRole('button', { name: /copy/i })).toHaveCount(0);

    // REQ-20 — verified, not assumed: the equivalent that remains still delivers the whole buffer.
    const downloadPromise = page.waitForEvent('download');
    await actions.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text, 'Containers → Logs — the download no longer carries the whole buffer').toContain('hello-from-stdout');
    expect(text, 'Containers → Logs — the download no longer carries the whole buffer').toContain('second-line');
    // The artefact belongs to the runner: it is handed back rather than deleted from its directory.
    await download.delete();

    await expectNoClipboardWrite(page, 'Containers → Logs');
  } finally {
    await removeContainerQuietly(name);
  }
});

// ─── screen 3 · volumes & networks (sites 10–12) ─────────────────────────────

// REQ-1, REQ-25, REQ-26 — the volume `Mountpoint` band and both panels' raw payload blocks.
test('volumes & networks: neither inline inspect offers a copy, on a band or above a payload', async ({ page }) => {
  const volumeName = `vexel-e2e-nocopy-vol-${Date.now()}`;
  const networkName = `vexel-e2e-nocopy-net-${Date.now()}`;
  try {
    await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(volumeName), volumeName]);
    await execFileAsync('docker', ['network', 'create', ...ownershipArgs(networkName), networkName]);
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });

    // Both lists are the object list — the same table containers and images ship — and the surface
    // each reveals is the library's detail panel: the sites are the same two, drawn by other
    // components. A panel is now the innermost region carrying both its heading and its list: its
    // section header sits above the card rather than inside it
    // (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`).
    const volumesPanel = page
      .locator('.ui-stack, .ui-surface')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Volumes' }) })
      .filter({ has: page.locator('.ui-data-table') })
      .last();
    await volumesPanel.locator('.ui-data-table__row', { hasText: volumeName }).first().locator('.ui-data-table__cell').first().click();
    const volumeExpanded = volumesPanel.locator('.ui-detail-panel');
    await expect(volumeExpanded).toBeVisible({ timeout: 20_000 });

    // Sites 10 and 11.
    await expectBandsHoldNoControl(volumeExpanded.locator('.ui-definition-list').first(), 'Volumes → inline inspect, property section');
    await expectCodeBlocksHoldNoControl(volumeExpanded, 'Volumes → inline inspect, raw payload', 1);
    const mountpoint = volumeExpanded.locator('.ui-definition-list__row', { hasText: 'Mountpoint' }).first().locator('.ui-definition-list__value');
    await expectSelectable(mountpoint, 'Volumes → inline inspect, the `Mountpoint` value');

    const networksPanel = page
      .locator('.ui-stack, .ui-surface')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Networks' }) })
      .filter({ has: page.locator('.ui-data-table') })
      .last();
    await networksPanel.locator('.ui-data-table__row', { hasText: networkName }).first().locator('.ui-data-table__cell').first().click();
    const networkExpanded = networksPanel.locator('.ui-detail-panel');
    await expect(networkExpanded).toBeVisible({ timeout: 20_000 });

    // Site 12 — the networks panel carries no band control of its own; its payload block is the site.
    await expectCodeBlocksHoldNoControl(networkExpanded, 'Networks → inline inspect, raw payload', 1);
    await expectNoClipboardWrite(page, 'Volumes & networks');
  } finally {
    await execFileAsync('docker', ['network', 'rm', networkName]).catch(() => undefined);
    await execFileAsync('docker', ['volume', 'rm', '-f', volumeName]).catch(() => undefined);
  }
});

// ─── screen 5 · plugins (sites 20–21) ────────────────────────────────────────

/**
 * A daemon plugin the machine need not have.
 *
 * `docker plugin ls` is host-wide and installing one is destructive enough that only
 * one spec does it, so the inventory and the inspect payload behind
 * this screen are served from **the application's own API**, stubbed here. What
 * is under examination is the client's rendering of a plugin's property band and
 * raw payload — nothing about the daemon — so the stub removes the only
 * dependency that would otherwise make this site unreachable on most machines,
 * and it touches neither the daemon nor the network.
 */
async function stubOneDaemonPlugin(page: Page): Promise<void> {
  const plugin = {
    id: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    name: 'vexel-e2e-plugin:latest',
    reference: 'docker.io/vexel/e2e-plugin:latest',
    enabled: true,
    interfaceTypes: ['docker.volumedriver/1.0'],
    type: 'volume driver',
    description: 'a stubbed plugin, so this screen has a row to inspect',
  };
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { cli: { items: [] }, daemon: { items: [plugin] } } });
  });
  await page.route('**/api/plugins/inspect*', async (route) => {
    await route.fulfill({
      json: { ...plugin, documentation: 'none', mounts: [], devices: [], capabilities: [], env: [], raw: { Id: plugin.id, Name: plugin.name } },
    });
  });
}

// REQ-1, REQ-25 — the plugin inspect's `Name` band and its raw payload block.
test('plugins: an inspected plugin offers no copy on its name or above its payload', async ({ page }) => {
  await stubOneDaemonPlugin(page);
  await openApp(page, 'plugins');
  // The innermost region carrying both the heading and the list: the section header and the
  // toolbar sit above the one unpadded card holding it
  // (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`).
  const panel = screenContent(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Daemon plugins' }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
  await expect(panel).toBeVisible({ timeout: 20_000 });

  await panel.getByRole('button', { name: 'Inspect' }).first().click();
  // The daemon list is the object list since batch 10 (plan-ui-coherence-optimisation/REQ-46), so
  // the inspection is the row's own expansion on the table rather than on a hand-built card list.
  const expanded = panel.locator('.ui-data-table__expanded');
  await expect(expanded).toBeVisible({ timeout: 20_000 });

  // Sites 20 and 21.
  await expectBandsHoldNoControl(expanded.locator('.ui-definition-list').first(), 'Plugins → inspect, property section');
  await expectCodeBlocksHoldNoControl(expanded, 'Plugins → inspect, raw payload', 1);
  await expectNoClipboardWrite(page, 'Plugins');
});

// ─── screen 6 · registries (site 22) ─────────────────────────────────────────

/**
 * A repository with one tag, served from the application's own API.
 *
 * The pull dialog is only reachable from a tag chip, and the only registry every
 * machine has configured is the public index — so reaching this site for real
 * would mean a spec searching Docker Hub, which this suite never does
 * (CLAUDE.md, "No test reaches Docker Hub"). The stub is of the browse endpoints
 * alone; the dialog it opens is the product's own, and the pull is cancelled and
 * never confirmed, so the daemon is not touched either.
 */
async function stubOneRepositoryTag(page: Page): Promise<void> {
  await page.route('**/api/registries/repositories*', async (route) => {
    await route.fulfill({ json: [{ name: 'library/vexel-e2e', description: 'a stubbed repository, so this screen has a tag to pull' }] });
  });
  await page.route('**/api/registries/tags*', async (route) => {
    await route.fulfill({ json: [{ name: '1.0', sizeBytes: 1024, pullReference: 'docker.io/library/vexel-e2e:1.0' }] });
  });
}

// REQ-1, REQ-16, REQ-25 — the pull dialog's `Reference` band.
test('registries: the pull dialog offers no copy on the reference it is about to pull', async ({ page }) => {
  await stubOneRepositoryTag(page);
  await openApp(page, 'registries');
  await expect(screenContent(page).getByRole('heading', { level: 2, name: 'Registries & credentials' })).toBeVisible({ timeout: 20_000 });

  const registriesPanel = screenContent(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Registries & credentials' }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
  // The registries list is the object list — the same table containers and images ship, its section
  // header above its card rather than inside it; a row is selected on its first cell, the row's own
  // centre being over the action cluster once a table pans.
  await registriesPanel.locator('.ui-data-table__row').first().locator('.ui-data-table__cell').first().click();

  const chip = screenContent(page).locator('.ui-chip', { hasText: '1.0' }).first();
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await chip.getByRole('button', { name: 'pull' }).click();

  const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Pull tag' }) });
  await expect(dialog).toBeVisible();

  // Site 22.
  await expectBandsHoldNoControl(dialog.locator('.ui-definition-list').first(), 'Registries → pull dialog, the `Reference` band');
  const reference = dialog.locator('.ui-definition-list__row', { hasText: 'Reference' }).first().locator('.ui-definition-list__value');
  await expect(reference).toHaveText('docker.io/library/vexel-e2e:1.0');
  await expectSelectable(reference, 'Registries → pull dialog, the `Reference` value');

  // Nothing is pulled: the dialog is dismissed rather than submitted.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expectNoClipboardWrite(page, 'Registries');
});

// ─── screen 7 · compose (site 23) ────────────────────────────────────────────

/**
 * REQ-1, REQ-20, REQ-25 — the aggregated log stream: no copy either way, and
 * `Download` offered exactly while a project is selected.
 *
 * **REQ-12's site on this screen is gone**
 * (`plan-ui-coherence-optimisation/REQ-50`, batch 11): the stream lives inside
 * the selected project's own detail panel now, so it is never offered without a
 * download filename and, with no project selected, is not drawn at all. The
 * component's behaviour — a row with nothing to hold is not rendered — is
 * unchanged, still contracted in `ui-library/specs/log-stream.md` and still
 * checked in `test/unit/copy-affordance-contract.test.tsx`. What is asserted
 * here is the half that still has a site.
 */
test('compose: the aggregated log stream offers no copy, and holds Download exactly while a project is selected', async ({ page }) => {
  const caseName = 'nocopy';
  const dir = await mkdtemp(join(tmpdir(), 'vexel-e2e-nocopy-compose-'));
  const projectName = `vexel-e2e-nocopy-compose-${RUN_ID}`;
  try {
    await ensureImage(ALPINE_IMAGE);
    const yaml = [
      'services:',
      '  web:',
      `    image: ${ALPINE_IMAGE}`,
      '    pull_policy: never',
      '    command: ["sh", "-c", "echo compose-line; sleep 300"]',
      '    labels:',
      `      - "${OWNER_LABEL}=${RUN_ID}"`,
      `      - "${CASE_LABEL}=${caseName}"`,
      '',
    ].join('\n');
    const filePath = join(dir, 'docker-compose.yml');
    await writeFile(filePath, yaml, 'utf8');
    await execFileAsync('docker', ['compose', '-f', filePath, '-p', projectName, 'up', '-d']);

    await openApp(page, 'compose');
    await expect(page.getByRole('heading', { level: 1, name: 'Compose' })).toBeVisible({ timeout: 20_000 });

    // With no project selected the screen draws no stream at all — not an empty one, and not one
    // stripped of its row.
    const stream = page.locator('.ui-log-stream');
    await expect(page.locator('.ui-frame__content .ui-data-table__row').first()).toBeVisible({ timeout: 30_000 });
    expect(await stream.count(), 'Compose → no project selected — a log stream is drawn for no project').toBe(0);

    // REQ-20 — and `Download` is offered exactly while a project is selected, which is delivered
    // behaviour named here so the gap is a known one rather than a later discovery.
    // A project row is a **direct child** of the outer list's body: the carrier
    // surface each row used to be wrapped in went with the presentation it
    // belonged to
    // (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-3`).
    const row = page
      .locator('.ui-frame__content .ui-data-table__body')
      .first()
      .locator(':scope > .ui-data-table__row')
      .filter({ hasText: projectName });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.locator('.ui-data-table__cell').first().click();
    await page.locator('.ui-detail-panel').getByRole('tab', { name: 'Aggregated logs', exact: true }).click();

    const actions = stream.locator('.ui-log-stream__actions');
    await expect(actions).toBeVisible({ timeout: 20_000 });
    expect(await controlsOf(actions), 'Compose → a project selected — the stream action row holds something besides `Download`').toEqual(['Download']);
    await expectNoClipboardWrite(page, 'Compose');
  } finally {
    const containers = await execFileAsync('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${projectName}`]).catch(() => ({ stdout: '' }));
    const containerIds = containers.stdout.split('\n').filter((id) => id.length > 0);
    if (containerIds.length > 0) await execFileAsync('docker', ['rm', '-fv', ...containerIds]).catch(() => undefined);
    const networks = await execFileAsync('docker', ['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${projectName}`]).catch(() => ({ stdout: '' }));
    const networkIds = networks.stdout.split('\n').filter((id) => id.length > 0);
    if (networkIds.length > 0) await execFileAsync('docker', ['network', 'rm', ...networkIds]).catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

// ─── screen 8 · raw console (site 24) ────────────────────────────────────────

// REQ-1, REQ-25, REQ-26 — one control per transcript entry: asserted over **every** entry, never the
// first, and with `Re-run` and the status badges left exactly as delivered (REQ-13, REQ-18).
//
// The second command is sent only once the first entry carries its status, and that order is the
// product's own precondition rather than a cover for a race
// (plan-docker_management_app-remove_copy_controls/REQ-36, REQ-38). `console-surface.md` declares
// `Enter` inert while the console is busy, so a line typed while the first command is still running
// is dropped by contract and the transcript keeps one entry. This case used to type both lines in a
// row: it passed on an idle daemon and failed whenever its own file ran. The status assertion that
// closed the case is what the loop now waits on, so it covers both entries instead of the last one.
// Nothing else may be added here to make it pass — no retry, no fixed delay, no wider budget and no
// softened assertion.
test('raw console: no transcript entry offers a copy, and every one keeps its Re-run and its status', async ({ page }) => {
  const marker = `vexel-e2e-nocopy-console-${RUN_ID}`;
  await openApp(page, 'raw-console');
  await expect(screenContent(page).getByRole('heading', { name: 'Raw command & API console' })).toBeVisible({ timeout: 20_000 });

  const prompt = page.getByLabel('Console prompt');
  const commands = ['first', 'second'].map((suffix) => `docker ps --filter label=${marker}-${suffix}`);
  for (const command of commands) {
    await prompt.fill(command);
    await prompt.press('Enter');
    // The entry is found by the command it carries, never by its position in the transcript.
    const entry = page.locator('.ui-console-surface__entry', { has: page.locator('.ui-console-surface__command', { hasText: command }) });
    await expect(entry, `Raw console → \`${command}\` never reached its final status`).toContainText('exit 0', { timeout: 30_000 });
  }

  const entries = page.locator('.ui-console-surface__entry');
  await expect(entries).toHaveCount(2, { timeout: 30_000 });

  const count = await entries.count();
  for (let index = 0; index < count; index += 1) {
    const group = entries.nth(index).locator('.ui-console-surface__entry-actions');
    expect(await controlsOf(group), `Raw console → entry ${index} — the action group holds something besides \`Re-run\``).toEqual(['Re-run']);
    // REQ-13 — the badges beside it are still there: nothing shifted because a sibling left.
    await expect(group.locator('.ui-badge').first()).toBeVisible();
  }

  await expectNoClipboardWrite(page, 'Raw console');
});
