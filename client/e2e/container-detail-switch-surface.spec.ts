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
 * **What this file asserts, and why it is not the create sheet's assertion.** The delivered inline
 * panel was top-anchored, so "its box did not move" was a statement its geometry could make. This
 * dialog is **content-sized and centred**: revealing the five health-check fields grows it 85.2px
 * and half of that comes off its top edge — measured 2026-08-26, and the reading that had the human
 * narrow REQ-25 that day, since every field-revealing control would do the same and the switch is
 * merely the first. What a centred surface keeps while it merely grows is its **centre**, and what
 * it loses the instant a focus scroll carries it off is exactly that. So the centre is what is
 * asserted, beside the switch still being in the viewport — and bug-2's 1044px drag, which changed
 * no height at all, fails that by 1044px.
 *
 * **Three measured, two inferred, and the difference is not decoration.** With a real pointer, on
 * the unfixed build: the create sheet displaced (its own check), this detail clean, and the plugins
 * "Install daemon plugin" dialog clean. **Not measured**: the plugins screen's per-row switch and
 * the container logs view's `Timestamps` switch. Neither inference is a measurement, and neither may
 * be quoted as one.
 *
 * So this file is a **non-regression guard on a second consumer**, not a second reproduction, and it
 * is honest about it. The instrument is not thereby unproven: the same module's stricter check
 * fails, in the same run, on the create sheet.
 *
 * plan-docker_management_app-toggle_focus_scroll/REQ-10, REQ-11, REQ-13, REQ-15.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { clickAndExpectSurfaceNotDragged } from './support/surface-stability.js';
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

// plan-docker_management_app-toggle_focus_scroll/REQ-10, REQ-11, REQ-13 and detail_modal/REQ-25 as
// narrowed on 2026-08-26 — operating the switch inside the container detail does not drag the
// dialog out of position, and leaves the switch itself inside the viewport
test('operating the health-check switch does not drag the container detail dialog', async ({ page }) => {
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

    const measured = await clickAndExpectSurfaceNotDragged({
      page,
      surface: detailPanel(page),
      surfaceName: 'the container detail dialog',
      control: healthSwitch(page),
      controlName: 'the health-check switch',
      hiddenControl: healthToggle(page),
    });

    // Reported, so the displacement the assertion above allows is a number a reader can see rather
    // than a clause they have to take on trust.
    const grew = measured.surfaceAfter.height - measured.surfaceBefore.height;
    const moved = measured.surfaceAfter.y - measured.surfaceBefore.y;
    console.log(`[REQ-25] the dialog grew ${grew.toFixed(1)}px and its top edge moved ${moved.toFixed(1)}px`);

    // The displacement is the growth's and nothing else's: on a centred surface the top edge takes
    // exactly half of what the content added. Stated as its own assertion so that a dialog which
    // both grew *and* was dragged cannot pass on the centre alone.
    expect(
      Math.round(moved * 10) / 10,
      `the dialog's top edge moved ${moved.toFixed(1)}px against ${grew.toFixed(1)}px of content growth: that is not the growth's own half`,
    ).toBe(Math.round(-grew / 2 * 10) / 10);

    // And the growth is the switch's own doing rather than a coincidence: the five fields it reveals
    // are on screen.
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
