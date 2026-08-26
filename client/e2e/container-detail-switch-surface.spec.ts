/**
 * The same switch, on a **different scrolling surface**: the container detail's health-check
 * `Enabled` control, now drawn inside the product's large dialog
 * (`plan-docker_management_app-containers_card_view-detail_modal/REQ-25`).
 *
 * This is the file that says whose defect it is. The reported symptom belongs to the "Run a
 * container" sheet, and a check that only ever looks there leaves open the reading that the create
 * form does something peculiar. The switch is one library control with four consumers, each of them
 * inside something that scrolls; observing the same displacement on a second surface — a different
 * screen, a different scrolling ancestor — is what makes the correction a library correction rather
 * than a repair of one dialog (plan-docker_management_app-toggle_focus_scroll/REQ-13).
 *
 * **What the delivered inline panel measured, so the next reader inherits it instead of re-deriving
 * it.** On the unfixed build, at 1280×800, this check passed: the switch's hidden input was drawn at
 * `y=643` against a visible track at `y=634` — coincident — and the panel stood at `y=195.9` before
 * the click and after it. The condition is where the scroll container sits relative to the input's
 * offset parent: the create sheet scrolls *between* the switch and its nearest positioned ancestor,
 * so the input's static position ignores 1346px of scroll, and this surface does not.
 *
 * **Three measured, two inferred, and the difference is not decoration.** With a real pointer, on
 * the unfixed build: the create sheet displaced (its own check), this detail clean, and the plugins
 * "Install daemon plugin" dialog clean. **Not measured**: the plugins screen's per-row switch and the
 * container logs view's `Timestamps` switch. Neither inference is a measurement, and neither may be
 * quoted as one.
 *
 * So this file is a **non-regression guard on a second consumer**, not a second reproduction, and it
 * is honest about it. The instrument is not thereby unproven: the same helper fails, in the same
 * run, on the create sheet.
 *
 * The measurement is `support/surface-stability.ts`'s: a real pointer at the visible switch, the
 * surface's viewport coordinates across the click, and the switch still within the viewport
 * afterwards (REQ-10, REQ-11) — which is exactly what detail_modal/REQ-25 asks of the dialog.
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

/** The dialog carrying the detail — the surface that must not move. */
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
 * A container of this spec's own, created and **never started**. Nothing here needs a process: the
 * detail reads the container's inspect data, and this file never saves the edit it opens.
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

// plan-docker_management_app-toggle_focus_scroll/REQ-10, REQ-11, REQ-13 and detail_modal/REQ-25 —
// operating the switch inside the container detail leaves the dialog's viewport box unchanged and
// the switch itself inside the viewport
test('operating the health-check switch leaves the container detail dialog where it was', async ({ page }) => {
  const name = `vexel-e2e-switch-panel-${Date.now()}`;
  try {
    await createNeverStartedContainer(name);

    // Asserted on this spec's own fixture, and searched for rather than looked
    // for in a list: the operator's own containers are none of its business.
    await page.getByPlaceholder('Search name, image or state…').fill(name);
    await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

    await openContainerDetail(page, name);
    await expect(detailPanel(page)).toBeVisible();

    // Config is the tab the detail opens on; its edit mode is where the switch
    // lives (containers/specs/container-detail-panel.md).
    await detailPanel(page).getByRole('button', { name: 'Edit configuration' }).click();
    await expect(healthToggle(page)).toHaveCount(1);
    await expect(healthToggle(page), 'the health-check switch is already on, so this test would prove nothing').not.toBeChecked();

    await clickAndExpectSurfaceUnmoved({
      page,
      surface: detailPanel(page),
      surfaceName: 'the container detail dialog',
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
