/**
 * **The rebuilt Inspect tab measured, not described** —
 * `…-inspect_full_payload/REQ-22`, REQ-23, REQ-26, REQ-27, REQ-28, REQ-29, REQ-32, REQ-33.
 *
 * Content certifies nothing here: a surface dragged out of the viewport keeps every child and every
 * character it had, and what it loses is its coordinates. So every claim below is a **viewport box**
 * the browser reports, taken before and after an interaction driven with a **real pointer at the
 * visible control's own coordinates** — never `element.click()`, never a dispatched event.
 *
 * Own labelled fixtures, removed with `docker rm -fv` in a `finally`; nothing assumed about the
 * operator's daemon.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { boxOf, clickAtItsCentre } from './support/settled.js';
import { clickAndExpectSurfaceUnmoved } from './support/surface-stability.js';
import { closeContainerDetail, containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

const PHONE_VIEWPORT = { width: 375, height: 812 };

/**
 * A container with a payload worth measuring: several published ports, a second network, labels and
 * environment of its own, so the tab holds hundreds of fields rather than a handful.
 */
async function createRichContainer(name: string, network: string): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['network', 'create', ...ownershipArgs(network), network]);
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(name),
    '-p',
    '0:80',
    '-p',
    '0:443',
    '-p',
    '0:8080',
    '-p',
    '0:9090',
    '-e',
    'VEXEL_ONE=1',
    '-e',
    'VEXEL_TWO=2',
    '-e',
    'VEXEL_THREE=3',
    '--label',
    'vexel.e2e.surface=yes',
    '--entrypoint',
    'sleep',
    ALPINE_IMAGE,
    '300',
  ]);
  await execFileAsync('docker', ['network', 'connect', network, name]);
}

async function removeQuietly(name: string, network: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
  await execFileAsync('docker', ['network', 'rm', network]).catch(() => undefined);
}

async function openDetail(page: Page, name: string): Promise<Locator> {
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('Search name, image or state…').fill(name);
  await expect(containerCard(page, name), 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });
  await openContainerDetail(page, name);
  const detail = containerDetail(page);
  await expect(detail.getByRole('button', { name: 'Edit configuration' }), 'the dialog never finished drawing its first tab').toBeVisible({
    timeout: 20_000,
  });
  return detail;
}

function inspectTab(page: Page): Locator {
  return containerDetail(page).getByRole('tab', { name: 'Inspect', exact: true });
}

function findControl(page: Page): Locator {
  return containerDetail(page).getByLabel('Find in payload');
}

/**
 * The header of one named closed section. Named rather than "the first closed one": that locator
 * re-resolves onto the *next* closed section the instant this one opens, and what the check then
 * measures is a different element.
 */
function sectionHeader(page: Page, title: string): Locator {
  return containerDetail(page)
    .locator('.ui-payload-sections > .ui-collapsible-section')
    .filter({ has: page.locator('.ui-collapsible-section__title', { hasText: new RegExp(`^${title}$`) }) })
    .first()
    .locator('.ui-collapsible-section__header');
}

// REQ-22, REQ-32 — the dialog's viewport box is unchanged by selecting Inspect, by opening one of
// its sections and by typing in its find; and the control just operated is still in the viewport.
test('the dialog does not move when the tab is selected, a section opened or the find typed in', async ({ page }) => {
  const name = `vexel-e2e-inspect-surface-${Date.now()}`;
  const network = `${name}-net`;
  try {
    await createRichContainer(name, network);
    const detail = await openDetail(page, name);
    const onConfig = await boxOf(detail, 'the container detail dialog');

    // Selecting the tab, with the surface measured across the click and nothing else.
    const onSelect = await clickAndExpectSurfaceUnmoved({
      page,
      surface: detail,
      surfaceName: 'the container detail dialog',
      control: inspectTab(page),
      controlName: 'the Inspect tab',
    });
    expect(onSelect.surfaceAfter, 'selecting Inspect moved or resized the dialog').toEqual(onConfig);
    await expect(findControl(page)).toBeVisible({ timeout: 20_000 });
    expect(await boxOf(detail, 'the container detail dialog'), 'the dialog changed size as the Inspect tab’s content arrived').toEqual(onConfig);

    // Opening a section.
    const header = sectionHeader(page, 'HostConfig');
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    const opened = await clickAndExpectSurfaceUnmoved({
      page,
      surface: detail,
      surfaceName: 'the container detail dialog',
      control: header,
      controlName: 'the HostConfig section header',
    });
    expect(opened.surfaceAfter, 'opening a payload section moved or resized the dialog').toEqual(onConfig);
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(await boxOf(detail, 'the container detail dialog'), 'the dialog changed size as the section’s fields arrived').toEqual(onConfig);

    // Typing in the find, with a real pointer into the field and a real keyboard after it.
    const find = findControl(page);
    await clickAtItsCentre(page, find, 'the find control');
    const beforeTyping = await boxOf(detail, 'the container detail dialog');
    await page.keyboard.type('Memory');
    await expect(detail.locator('.ui-payload-explorer__matches')).toBeVisible();
    expect(await boxOf(detail, 'the container detail dialog'), 'typing in the find moved or resized the dialog').toEqual(beforeTyping);
    const findBox = await boxOf(find, 'the find control');
    const viewport = page.viewportSize()!;
    expect(findBox.y, 'the find control was carried above the top of the viewport').toBeGreaterThanOrEqual(0);
    expect(findBox.y + findBox.height, 'the find control was carried below the foot of the viewport').toBeLessThanOrEqual(viewport.height);

    await closeContainerDetail(page);
  } finally {
    await removeQuietly(name, network);
  }
});

// REQ-22 — the tab's content scrolls inside the dialog, and the page behind it has nothing to
// scroll: the header and the tab row stay where they are while the payload is scrolled.
test('the tab’s content scrolls inside the dialog, and the page behind it does not scroll', async ({ page }) => {
  const name = `vexel-e2e-inspect-scroll-${Date.now()}`;
  const network = `${name}-net`;
  try {
    await page.setViewportSize({ width: 1280, height: 600 });
    await createRichContainer(name, network);
    const detail = await openDetail(page, name);
    await clickAtItsCentre(page, inspectTab(page), 'the Inspect tab');
    await expect(findControl(page)).toBeVisible({ timeout: 20_000 });

    // Every section opened, so the tab is certainly taller than the region it is given.
    const headers = containerDetail(page).locator('.ui-payload-sections > .ui-collapsible-section > .ui-collapsible-section__header');
    for (let index = 0; index < (await headers.count()); index += 1) {
      const header = headers.nth(index);
      if ((await header.getAttribute('aria-expanded')) === 'false') await clickAtItsCentre(page, header, `the section header at position ${index}`);
    }

    const dialogBefore = await boxOf(detail, 'the container detail dialog');
    const tabRowBefore = await boxOf(detail.getByRole('tab', { name: 'Config', exact: true }), 'the tab row');
    const scrollable = await detail.evaluate((panel) =>
      Array.from(panel.querySelectorAll('*')).some((element) => element.scrollHeight > element.clientHeight + 1),
    );
    expect(scrollable, 'nothing inside the dialog can scroll, so this tab is not taller than the region and proves nothing').toBe(true);

    const pageBefore = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight }));
    await page.mouse.move(dialogBefore.x + dialogBefore.width / 2, dialogBefore.y + dialogBefore.height / 2);
    await page.mouse.wheel(0, 600);

    const pageAfter = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    expect(pageAfter, 'the page behind the dialog scrolled').toEqual({ x: pageBefore.x, y: pageBefore.y });
    expect(
      pageBefore.scrollHeight,
      `the page behind the dialog has ${pageBefore.scrollHeight - pageBefore.clientHeight}px to scroll`,
    ).toBeLessThanOrEqual(pageBefore.clientHeight + 1);
    expect(await boxOf(detail, 'the container detail dialog'), 'scrolling the tab moved the dialog').toEqual(dialogBefore);
    expect(await boxOf(detail.getByRole('tab', { name: 'Config', exact: true }), 'the tab row'), 'scrolling the tab carried the tab row with it').toEqual(
      tabRowBefore,
    );

    await closeContainerDetail(page);
  } finally {
    await removeQuietly(name, network);
  }
});

// REQ-23 — opening the tab and typing in the find stay responsive on a real payload, inside a dialog
// that is also holding a live stream. Measured rather than asserted.
test('opening the tab and typing in the find stay responsive on a real payload beside a live stream', async ({ page }) => {
  test.setTimeout(180_000);
  const name = `vexel-e2e-inspect-responsive-${Date.now()}`;
  const network = `${name}-net`;
  try {
    await createRichContainer(name, network);
    const detail = await openDetail(page, name);

    // A live stream in the same dialog: the Logs tab is opened first, so its subscription is running
    // while the payload is drawn and filtered.
    await clickAtItsCentre(page, detail.getByRole('tab', { name: 'Logs', exact: true }), 'the Logs tab');
    await expect(detail.locator('.ui-log-stream')).toBeVisible({ timeout: 30_000 });

    const openedAt = Date.now();
    await clickAtItsCentre(page, inspectTab(page), 'the Inspect tab');
    await expect(findControl(page)).toBeVisible({ timeout: 20_000 });
    await expect(detail.locator('.ui-payload-band').first()).toBeVisible({ timeout: 20_000 });
    const openMs = Date.now() - openedAt;

    const fields = await detail.evaluate((panel) => JSON.stringify(panel.querySelectorAll('.ui-payload-band').length));
    const find = findControl(page);
    await clickAtItsCentre(page, find, 'the find control');
    const typedAt = Date.now();
    await page.keyboard.type('Host');
    await expect(detail.locator('.ui-payload-explorer__matches')).toHaveText(/matching field/);
    const typeMs = Date.now() - typedAt;

    console.log(`[REQ-23] the tab opened in ${openMs}ms over ${fields} visible bands and answered a four-key term in ${typeMs}ms`);
    expect(openMs, `opening the Inspect tab took ${openMs}ms with a live stream in the same dialog`).toBeLessThan(4000);
    expect(typeMs, `the find took ${typeMs}ms to answer a four-character term`).toBeLessThan(4000);

    await closeContainerDetail(page);
  } finally {
    await removeQuietly(name, network);
  }
});

// REQ-29 — at 375×812 label and value stack instead of clipping, nesting stays legible at depth,
// no value is truncated to nothing, the find is reachable and nothing scrolls sideways.
test('at 375×812 label and value stack, nesting stays legible and nothing scrolls sideways', async ({ page }) => {
  const name = `vexel-e2e-inspect-phone-${Date.now()}`;
  const network = `${name}-net`;
  try {
    await createRichContainer(name, network);
    await page.setViewportSize(PHONE_VIEWPORT);
    const detail = await openDetail(page, name);
    await clickAtItsCentre(page, inspectTab(page), 'the Inspect tab');
    await expect(findControl(page)).toBeVisible({ timeout: 20_000 });

    const headers = containerDetail(page).locator('.ui-payload-sections > .ui-collapsible-section > .ui-collapsible-section__header');
    for (let index = 0; index < (await headers.count()); index += 1) {
      const header = headers.nth(index);
      if ((await header.getAttribute('aria-expanded')) === 'false') await clickAtItsCentre(page, header, `the section header at position ${index}`);
    }

    const measured = await detail.evaluate((panel) => {
      const bands = Array.from(panel.querySelectorAll('.ui-payload-band'));
      const faults: string[] = [];
      for (const band of bands) {
        const label = band.querySelector('.ui-payload-band__label')!;
        const value = band.querySelector('.ui-payload-band__value')!;
        const labelBox = label.getBoundingClientRect();
        const valueBox = value.getBoundingClientRect();
        const name_ = label.textContent ?? '(no label)';
        if (labelBox.width <= 0 || labelBox.height <= 0) faults.push(`${name_}: the label has no box`);
        if (valueBox.width <= 0 || valueBox.height <= 0) faults.push(`${name_}: the value is truncated to nothing`);
        if (getComputedStyle(value).textOverflow === 'ellipsis') faults.push(`${name_}: the value is clamped with an ellipsis`);
        if (valueBox.top < labelBox.bottom - 1) faults.push(`${name_}: the value shares the label's line instead of stacking under it`);
      }
      // The indent as the eye reads it: where the group's own fields start against where its label
      // does. The body's border box starts at the group's edge and carries the indent as padding.
      const groups = Array.from(panel.querySelectorAll('.ui-payload-group'));
      const indents = groups.map((group) => {
        const fields = group.querySelector(':scope > .ui-payload-group__body > .ui-payload-fields');
        const header = group.querySelector(':scope > .ui-payload-group__header');
        return fields && header ? fields.getBoundingClientRect().left - header.getBoundingClientRect().left : 0;
      });
      return { bands: bands.length, faults, groups: groups.length, indents };
    });

    console.log(`[REQ-29] at 375×812 the tab draws ${measured.bands} bands and ${measured.groups} nested groups`);
    expect(measured.bands, 'the tab draws no band at all at 375×812').toBeGreaterThan(0);
    expect(measured.faults, 'the tab loses or crowds a value at 375×812').toEqual([]);
    expect(measured.groups, 'the tab draws no nested group, so nesting cannot be read at this width').toBeGreaterThan(0);
    expect(
      measured.indents.every((indent) => indent > 0),
      `a nested group keeps no indent at 375×812: ${JSON.stringify(measured.indents)}`,
    ).toBe(true);

    const find = findControl(page);
    const findBox = await boxOf(find, 'the find control');
    expect(findBox.width, 'the find control is clipped to nothing at 375×812').toBeGreaterThan(0);
    expect(findBox.x, 'the find control starts left of the viewport').toBeGreaterThanOrEqual(-0.5);
    expect(findBox.x + findBox.width, 'the find control runs off the right of the viewport').toBeLessThanOrEqual(PHONE_VIEWPORT.width + 0.5);

    const sideways = await page.evaluate(() => ({
      page: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    }));
    expect(
      sideways.page.scrollWidth,
      `the page scrolls sideways at 375px: ${sideways.page.scrollWidth} against ${sideways.page.clientWidth}`,
    ).toBeLessThanOrEqual(sideways.page.clientWidth + 1);
    const region = await detail.evaluate((panel) => {
      const explorer = panel.querySelector('.ui-payload-explorer') ?? panel;
      return { scrollWidth: explorer.scrollWidth, clientWidth: explorer.clientWidth };
    });
    expect(region.scrollWidth, `the tab scrolls sideways at 375px: ${region.scrollWidth} against ${region.clientWidth}`).toBeLessThanOrEqual(
      region.clientWidth + 1,
    );

    await closeContainerDetail(page);
  } finally {
    await removeQuietly(name, network);
  }
});
