import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { measureSection, report } from './support/property-bands.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

/**
 * **The guard on the five surfaces this batch deliberately does not touch.**
 * REQ ids belong to `plan-docker_management_app-detail_property_columns` (REQ-30).
 *
 * The four swarm panels (services, secrets, configs & stacks, nodes) and the
 * About screen's coverage matrix state `columns={2}` today. The corrected
 * arrangement is the shared component's **default**, so it does not reach a
 * caller that states a count: these five render exactly as they did before it
 * existed, and this file asserts that rather than claiming it in prose — so that
 * a change to any of them is attributable to the work that asked for it, and not
 * to the shared correction.
 *
 * **What is asserted here is the delivered defect, and that is deliberate.** Each
 * section shows **exactly two columns at every width checked, including one
 * measured near 400px** — that is, it does **not** respond to its own width. At
 * that width the delivered build hands each pair a ~150–180px cell, in which a
 * 19-character `sha256:` digest wraps across three lines. That is a known defect,
 * left standing on purpose: it belongs to the work that retires the caller-stated
 * count, and improving it here would empty that work of its content and make any
 * regression on these five screens unattributable.
 *
 * **This whole check is deleted by that work** — not commented out, not relaxed —
 * and replaced by its own measurement: at a section of ~400px, one column, one
 * line per value, no digest wrapped across three lines.
 *
 * No constant is written into an assertion beyond the count itself: the two
 * columns are deduced from measured band positions, never from the class the
 * component emits.
 */

/** The count these five surfaces state for themselves, and the only number this file asserts. */
const CALLER_STATED_COLUMNS = 2;

/**
 * Viewports for the coverage matrix, the fifth surface and the one available on
 * any daemon. The narrow one is chosen to land the section near 400px — the
 * width at which the delivered fixed grid misbehaves, and at which it must go on
 * misbehaving until its own work arrives.
 */
const COVERAGE_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 460, height: 900 },
];

/**
 * Whether this daemon is in a swarm. The four swarm panels can only be expanded
 * inside one, and initialising a swarm is a global act on the operator's own
 * daemon — which is why the suite's cluster work lives apart, in
 * `e2e/exclusive/swarm-cluster.spec.ts`. Outside a swarm the swarm half of this
 * guard is skipped with its reason stated, exactly as `swarm.spec.ts` does.
 */
const { stdout: swarmInfo } = await execFileAsync('docker', ['info', '--format', '{{.Swarm.LocalNodeState}}']);
const IN_SWARM = swarmInfo.trim() !== 'inactive' && swarmInfo.trim() !== '';

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

// REQ-30 — the coverage matrix's baseline list: two columns at every width, the ~400px one included.
test('the coverage matrix still states its own count: two columns at every width, near 400px included', async ({ page }) => {
  const measured: string[] = [];
  for (const viewport of COVERAGE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await openApp(page, 'coverage-matrix');
    const section = screenContent(page).locator('.ui-definition-list').first();
    const geometry = await measureSection(section, "the coverage matrix's baseline list");
    const evidence = report(`coverage matrix @${viewport.width}×${viewport.height}`, geometry);
    measured.push(evidence);
    expect(
      geometry.columns,
      `${evidence} — the section shows ${geometry.columns} column(s) where it states ${CALLER_STATED_COLUMNS}: the shared correction has reached a caller that states its own count`,
    ).toBe(CALLER_STATED_COLUMNS);
  }
  console.log(`[REQ-30] ${measured.join('\n[REQ-30] ')}`);

  // The narrow case, stated as the number it is: at ~400px of section the two stated columns are
  // ~180px cells. This is the delivered defect, recorded here so the guard is honest about what it
  // is protecting, and it is what the retiring work replaces this file's measurement with.
  const narrow = measured.at(-1);
  console.log(`[REQ-30] the known defect left standing, at 460 × 900: ${narrow}`);
});

// REQ-30 — the four swarm panels. Only reachable on a daemon that is in a swarm; nothing here
// initialises, joins or leaves one.
test('the four swarm panels still state their own count: two columns wherever they are shown', async ({ page }) => {
  test.skip(!IN_SWARM, 'this daemon is not in a swarm, so no swarm panel expands a property card to measure; the guard’s swarm half needs a cluster and never creates one');

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await openApp(page, 'swarm');
    await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible({ timeout: 20_000 });

    // Every expandable row of every panel that has one: a caller-stated section, wherever it is
    // drawn, still states its own count.
    const rows = screenContent(page).locator('.ui-card-list__item');
    const rowCount = await rows.count();
    for (let index = 0; index < rowCount; index += 1) await rows.nth(index).click();

    const sections = screenContent(page).locator('.ui-definition-list--columns-2');
    const sectionCount = await sections.count();
    expect(sectionCount, 'this daemon is in a swarm but no swarm panel presented a caller-stated property card to measure').toBeGreaterThan(0);
    for (let index = 0; index < sectionCount; index += 1) {
      const geometry = await measureSection(sections.nth(index), `a swarm panel's property card ${index}`);
      const evidence = report(`swarm card ${index} @${viewport.width}×${viewport.height}`, geometry);
      console.log(`[REQ-30] ${evidence}`);
      expect(
        geometry.columns,
        `${evidence} — the card shows ${geometry.columns} column(s) where it states ${CALLER_STATED_COLUMNS}: the shared correction has reached a caller that states its own count`,
      ).toBe(CALLER_STATED_COLUMNS);
    }
  }
});
