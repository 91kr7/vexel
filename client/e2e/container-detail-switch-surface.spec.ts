/**
 * The same switch, on a **different surface**: the container detail's health-check `Enabled`
 * control, now drawn inside the product's large dialog
 * (`plan-docker_management_app-containers_card_view-detail_modal/REQ-25`).
 *
 * This is the file that says whose defect it is. The reported symptom belongs to the "Run a
 * container" sheet, and a check that only ever looks there leaves open the reading that the create
 * form does something peculiar. The switch is one library control with four consumers; observing it
 * on a second surface — a different screen, a different anchoring, a different scrolling ancestor —
 * is what makes the correction a library correction rather than a repair of one dialog
 * (plan-docker_management_app-toggle_focus_scroll/REQ-13).
 *
 * **The condition, so a reader can predict a new consumer instead of measuring it.** The drag is the
 * browser scrolling a *focused* element into view, and it bites when the scrolling happens *between*
 * the control's visually hidden input and the input's nearest positioned ancestor: the create
 * sheet's static position then ignores 1346px of scroll. On the delivered inline panel it did not —
 * hidden input at `y=643` against a visible track at `y=634`, coincident, the panel at `y=195.9`
 * before the click and after it — and it does not on this dialog either: **10.3px**, measured
 * 2026-08-26 through this very check.
 *
 * **What this file asserts.** The dialog's **viewport box** — every edge of it — before and after the
 * click, beside the switch still being inside the viewport. It asserted less than that until
 * 2026-08-26: the dialog was centred and sized by its content, so revealing the five health-check
 * fields grew it 85.2px and lifted its top edge 42.6px, and what such a surface can promise is its
 * centre rather than its box. That is the narrowing the human made to
 * `plan-docker_management_app-containers_card_view-detail_modal/REQ-25` on the day, and
 * `…-tabs_composition_refactor/REQ-2` takes it back: the dialog now asks for a stable height, so a
 * reveal inside it moves no edge of it at all and the strict reading is the one the contract states.
 *
 * **Three measured, two inferred, and the difference is not decoration.** With a real pointer, on
 * the unfixed build: the create sheet displaced (its own check), this detail clean, and the plugins
 * "Install daemon plugin" dialog clean. **Not measured**: the plugins screen's per-row switch and
 * the container logs view's `Timestamps` switch. Neither inference is a measurement, and neither may
 * be quoted as one.
 *
 * So this file is a **non-regression guard on a second consumer**, not a second reproduction, and it
 * is honest about it. The instrument is not thereby unproven: the same module's check fails, in the
 * same run, on the create sheet.
 *
 * plan-docker_management_app-toggle_focus_scroll/REQ-10, REQ-11, REQ-13, REQ-15.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { clickAndExpectSurfaceUnmoved } from './support/surface-stability.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

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

// plan-docker_management_app-toggle_focus_scroll/REQ-10, REQ-11, REQ-13 and
// tabs_composition_refactor/REQ-2, REQ-44 — operating the switch inside the container detail moves
// no edge of the dialog and leaves the switch itself inside the viewport
test('operating the health-check switch moves no edge of the container detail dialog', async ({ page }) => {
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

    const measured = await clickAndExpectSurfaceUnmoved({
      page,
      surface: detailPanel(page),
      surfaceName: 'the container detail dialog',
      control: healthSwitch(page),
      controlName: 'the health-check switch',
      hiddenControl: healthToggle(page),
    });

    // Reported, so the two numbers the assertions rest on are ones a reader can see rather than
    // clauses they have to take on trust.
    const grew = measured.surfaceAfter.height - measured.surfaceBefore.height;
    const moved = measured.surfaceAfter.y - measured.surfaceBefore.y;
    console.log(`[REQ-2] the dialog grew ${grew.toFixed(1)}px and its top edge moved ${moved.toFixed(1)}px`);

    // REQ-2 asks for the **viewport box**, and the helper above compares its origin. The size is
    // asserted here, on the same measurement, so that a dialog which stayed put while growing
    // downwards — the delivered defect with one edge pinned — cannot pass on the origin alone.
    expect(
      { width: measured.surfaceAfter.width, height: measured.surfaceAfter.height },
      `the reveal resized the dialog: ${measured.surfaceBefore.width.toFixed(1)}×${measured.surfaceBefore.height.toFixed(
        1,
      )} became ${measured.surfaceAfter.width.toFixed(1)}×${measured.surfaceAfter.height.toFixed(1)}`,
    ).toEqual({ width: measured.surfaceBefore.width, height: measured.surfaceBefore.height });

    // Content beside the geometry, never instead of it (REQ-44): the reveal did happen, so the
    // unchanged box above is a dialog that absorbed five new fields rather than one that ignored the
    // click.
    for (const field of ['Health check command', 'Interval seconds', 'Timeout seconds', 'Retries', 'Start period seconds']) {
      await expect(detailPanel(page).getByLabel(field, { exact: true }), `the switch revealed no \`${field}\` field`).toBeVisible();
    }

    // The switch still switches: the fix under check is about the surface, and
    // a control that stopped working would satisfy the assertions above.
    await expect(healthToggle(page), 'the switch does not read as selected after being operated').toBeChecked();
  } finally {
    // Nothing was saved, so the daemon holds the container exactly as it was
    // created; it is removed all the same, by the test that made it.
    await removeContainerQuietly(name);
  }
});
