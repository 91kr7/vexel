/**
 * The same switch, on a **different scrolling surface**: the container detail
 * panel's health-check `Enabled` control.
 *
 * This is the file that says whose defect it is. The reported symptom belongs
 * to the "Run a container" sheet, and a check that only ever looks there leaves
 * open the reading that the create form does something peculiar. The switch is
 * one library control with four consumers, each of them inside something that
 * scrolls; observing the same displacement in a detail panel — a different
 * surface, a different scrolling ancestor, a different screen — is what makes
 * the correction a library correction rather than a repair of one dialog
 * (plan-docker_management_app-toggle_focus_scroll/REQ-13).
 *
 * **The quiet case, on purpose.** In a dialog the surface leaves the viewport
 * and the operator calls it a crash. In a panel it slides, and nobody files a
 * report — which is exactly why it needs a standing check rather than a human
 * noticing.
 *
 * The measurement itself is the one the create sheet's check uses, in
 * `support/surface-stability.ts`: a real pointer at the visible switch, the
 * surface's viewport coordinates across the click, and the switch still within
 * the viewport afterwards (REQ-10, REQ-11).
 *
 * **What this surface measured, so the next reader inherits it instead of
 * re-deriving it.** On the unfixed build, at 1280×800, this check passes: the
 * switch's hidden input is drawn at `y=643` against a visible track at `y=634`
 * — 9.8px, coincident — and the panel stands at `y=195.9` before the click and
 * `y=195.9` after it. The panel is not affected, and not by luck of the
 * viewport: the input's offset parent **is** `.ui-detail-panel`, which carries
 * `position: relative` of its own (for the close control it no longer draws),
 * and the surface that scrolls — the shell's `.ui-scroll-area` — sits *outside*
 * that frame of reference. The create sheet's is the opposite arrangement: the
 * scrolling happens *between* the switch and the nearest positioned ancestor,
 * so the input's static position ignores 1346px of scroll.
 *
 * **That is the condition** — not "the switch sits inside something that
 * scrolls", which every consumer does. It is what lets a reader predict a new
 * consumer's behaviour from where its scroll container sits, rather than
 * measuring each one.
 *
 * **Three measured, two inferred, and the difference is not decoration.** With
 * a real pointer, on the unfixed build: the create sheet displaced (its own
 * check), this panel clean, and the plugins "Install daemon plugin" dialog
 * clean — hidden input `y=503` against a track at `y=494`, dialog at `y=201.5`
 * before and after, its offset parent the modal's own surface, which does not
 * scroll inside itself. **Not measured: the plugins screen's per-row switch and
 * the container logs view's `Timestamps` switch.** The logs switch is *expected*
 * clean because it is drawn inside this very `.ui-detail-panel`, so it inherits
 * the arrangement measured here; the plugins row switch is simply **unknown**,
 * and was left so deliberately — measuring it costs installing a daemon plugin
 * on the operator's machine on every run, which the project's fixture rules
 * refuse for a consumer nothing gives reason to suspect. Neither inference is a
 * measurement, and neither may be quoted as one.
 *
 * So this file is a **non-regression guard on a second consumer**, not a second
 * reproduction, and it is honest about it. The instrument is not thereby
 * unproven: the same helper fails, in the same run, on the create sheet. And
 * the guard is live rather than ornamental — it fails the day someone deletes
 * the `position: relative` this panel carries for a close control it no longer
 * draws, which is exactly the kind of leftover a tidy-up removes.
 *
 * plan-docker_management_app-toggle_focus_scroll/REQ-10, REQ-11, REQ-13, REQ-15.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { clickAndExpectSurfaceUnmoved } from './support/surface-stability.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';

// The viewport the defect was measured at, so what this file reports can be put
// beside the measurement taken by hand on the create sheet.
test.use({ viewport: { width: 1280, height: 800 } });

const CASE_NAME = 'detail-panel-health-switch';

/** The expanded panel under the owning row — the surface that must not move. */
function detailPanel(page: Page): Locator {
  return containerDetail(page);
}

/** The health-check switch's visually hidden input: what it reads, never where a pointer is sent. */
function healthToggle(page: Page): Locator {
  return detailPanel(page).getByRole('checkbox', { name: 'Enabled', exact: true });
}

/** The **visible** switch: the track an operator aims at, and the only legitimate pointer target. */
function healthSwitch(page: Page): Locator {
  return detailPanel(page).locator('.ui-toggle:has(input[aria-label="Enabled"]) .ui-toggle__track');
}

/**
 * A container of this spec's own, created and **never started**.
 *
 * Nothing here needs a process: the panel reads the container's inspect data,
 * and this file never saves the edit it opens. The smallest image the suite
 * has, built `FROM scratch`, so no registry is reached either.
 */
async function createNeverStartedContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['create', '--name', name, ...ownershipArgs(CASE_NAME), TINY_IMAGE]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  // `-v`, never a bare `-f`: an anonymous volume the daemon attached on its own
  // behalf outlives the container carrying no label of ours.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

test.beforeAll(async () => {
  await ensureImage(TINY_IMAGE);
});

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design, so
  // nothing here trusts the screen another spec left.
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// plan-docker_management_app-toggle_focus_scroll/REQ-10, REQ-11, REQ-13 — operating a switch inside the container
// detail panel leaves the panel where it was and the switch inside the viewport
test('operating the health-check switch leaves the container detail panel where it was', async ({ page }) => {
  const name = `vexel-e2e-switch-panel-${Date.now()}`;
  try {
    await createNeverStartedContainer(name);

    // Asserted on this spec's own fixture, and searched for rather than looked
    // for in a list: the operator's own containers are none of its business,
    // and narrowing the list keeps the open panel where it was put.
    await page.getByPlaceholder('Search name, image or state…').fill(name);
    await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

    await openContainerDetail(page, name);
    await expect(detailPanel(page)).toBeVisible();

    // Config is the tab the panel opens on; its edit mode is where the switch
    // lives (containers/specs/container-detail-panel.md).
    await detailPanel(page).getByRole('button', { name: 'Edit configuration' }).click();
    await expect(healthToggle(page)).toHaveCount(1);
    await expect(healthToggle(page), 'the health-check switch is already on, so this test would prove nothing').not.toBeChecked();

    await clickAndExpectSurfaceUnmoved({
      page,
      surface: detailPanel(page),
      surfaceName: 'the container detail panel',
      control: healthSwitch(page),
      controlName: 'the health-check switch',
      hiddenControl: healthToggle(page),
    });

    // The switch still switches: the fix under check is about the surface, and
    // a control that stopped working would satisfy the assertion above.
    await expect(healthToggle(page), 'the switch does not read as selected after being operated').toBeChecked();
  } finally {
    // Nothing was saved, so the daemon holds the container exactly as it was
    // created; it is removed all the same, by the test that made it.
    await removeContainerQuietly(name);
  }
});
