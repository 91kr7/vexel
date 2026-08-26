/**
 * **The Inspect tab as two questions, and an exit code that reads as bad news** —
 * `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor`,
 * REQ-34, REQ-35, REQ-36, driven under REQ-44 and REQ-45.
 *
 * The ten properties are `Identity` — what the container is — and `Lifecycle` — how it has gone —
 * and the two of them are read here through the headings an operator reads. How many columns each
 * shows is geometry and belongs to `container-detail-property-columns.spec.ts`; what this file
 * answers is which question each property was filed under, and the two distinguished readings the
 * `Lifecycle` group carries: the state as the pill every other surface draws, and a non-zero exit
 * code in the application's own danger role.
 *
 * **A container cannot exhibit both exit codes**, so REQ-36 takes two fixtures — one that exited
 * non-zero and one that exited cleanly — and reads them one after the other. Every fixture carries
 * the ownership labels, is created from the suite's own `alpine:3.20` (never pulled here), and is
 * removed with `docker rm -fv` in a `finally`. Nothing is asserted about the operator's own daemon:
 * the list is narrowed to the fixture by name and the card is searched for.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCard, containerDetail, closeContainerDetail, openContainerDetail } from './support/container-cards.js';

/** A container that runs and stays up, so its state pill is not the neutral one every stopped one carries. */
async function createRunningContainer(name: string): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sleep', ALPINE_IMAGE, '300']);
}

/** A container that has already exited with the code asked for, waited on so its detail is settled. */
async function createExitedContainer(name: string, code: number): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sh', ALPINE_IMAGE, '-c', `exit ${code}`]);
  await execFileAsync('docker', ['wait', name]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  // `-v` and not just `-f`: without it an image's anonymous volumes outlive the container carrying
  // no label of ours, invisible to any later sweep.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** Opens the fixture's detail on Inspect, with a real pointer at each visible control's coordinates. */
async function openInspect(page: Page, name: string): Promise<Locator> {
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('Search name, image or state…').fill(name);
  await expect(containerCard(page, name), 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });
  await openContainerDetail(page, name);
  const detail = containerDetail(page);
  await detail.getByRole('tab', { name: 'Inspect', exact: true }).click();
  await expect(detail.getByText('Identity', { exact: true })).toBeVisible({ timeout: 20_000 });
  return detail;
}

interface Group {
  title: string;
  labels: string[];
}

/**
 * The tab's property groups, each read as its heading and the labels of the bands under it. The
 * dialog's own identity band is a section header too (`containers/specs/container-identity-header.md`),
 * so it is excluded by where it sits rather than by what it says.
 */
async function propertyGroups(detail: Locator): Promise<Group[]> {
  return await detail.evaluate((panel) =>
    Array.from(panel.querySelectorAll('.ui-section-header'))
      .filter((header) => header.closest('.ui-modal__title') === null)
      .map((header) => {
        const list = header.parentElement?.querySelector(':scope > .ui-definition-list');
        return {
          title: (header.querySelector('.ui-section-header__title')?.textContent ?? '').trim(),
          labels: Array.from(list?.querySelectorAll('.ui-definition-list__label') ?? []).map((label) => (label.textContent ?? '').trim()),
        };
      }),
  );
}

/** One band of the open Inspect tab, located by the label an operator reads. */
function band(detail: Locator, label: string): Locator {
  return detail.locator('.ui-definition-list__row').filter({ has: detail.page().locator('.ui-definition-list__label', { hasText: new RegExp(`^${label}$`) }) }).first();
}

// REQ-34 — two questions instead of one list: what the container is, and how it has gone, each
// under its own heading and holding the properties that answer it.
test('Inspect heads the ten properties as Identity and Lifecycle', async ({ page }) => {
  const name = `vexel-e2e-inspect-groups-${Date.now()}`;
  try {
    await createRunningContainer(name);
    const detail = await openInspect(page, name);

    const groups = await propertyGroups(detail);
    expect(groups.map((one) => one.title), 'the Inspect tab does not head its properties as two groups').toEqual(['Identity', 'Lifecycle']);
    expect(groups[0]!.labels).toEqual(['Id', 'Name', 'Image', 'Command', 'Entrypoint', 'Created']);
    expect(groups[1]!.labels).toEqual(['State', 'Started at', 'Finished at', 'Exit code']);

    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-35 — `State` reads as the pill, and it is the **same** pill the dialog's own header draws for
// the same container: one state→tone reading (`containers/specs/container-status.md`), so the two
// surfaces cannot disagree. Compared on the treatment the eye reads, not on a class name.
test('Inspect draws the state as the pill the dialog’s own header draws, not as a word', async ({ page }) => {
  const name = `vexel-e2e-inspect-state-${Date.now()}`;
  try {
    await createRunningContainer(name);
    const detail = await openInspect(page, name);

    const pill = band(detail, 'State').locator('.ui-badge');
    await expect(pill, 'the state is drawn as a plain value rather than as a pill').toBeVisible();
    await expect(pill).toHaveText('RUNNING');

    const drawn = await pill.evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor, borderColor: style.borderColor };
    });
    const inTheHeader = await detail.locator('.ui-modal__title .ui-badge').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor, borderColor: style.borderColor };
    });
    expect(drawn, 'the Lifecycle pill and the header pill draw one container’s state differently').toEqual(inTheHeader);

    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(name);
  }
});

/**
 * The colour the `Exit code` value is painted, beside the colour an ordinary value of the same group
 * is painted, and the colour the application's danger role resolves to. The probe is inserted and
 * removed inside the one evaluation: reading the token off `getComputedStyle` gives its declared
 * text, which a painted `color` cannot be compared with.
 */
async function exitCodeColouring(detail: Locator): Promise<{ exitCode: string; ordinary: string; danger: string }> {
  return await detail.evaluate((panel) => {
    const valueOf = (label: string) => {
      const row = Array.from(panel.querySelectorAll('.ui-definition-list__row')).find(
        (candidate) => candidate.querySelector('.ui-definition-list__label')?.textContent === label,
      );
      return row?.querySelector('.ui-definition-list__value') as HTMLElement | undefined;
    };
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-danger)';
    panel.append(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    return {
      exitCode: getComputedStyle(valueOf('Exit code')!).color,
      ordinary: getComputedStyle(valueOf('Finished at')!).color,
      danger,
    };
  });
}

// REQ-36 — a container that was killed says so where it is read, and one that exited cleanly is
// drawn like every other value. Two fixtures, because one container cannot show both.
test('Inspect tones a non-zero exit code as bad news and leaves a zero one untoned', async ({ page }) => {
  const stem = `vexel-e2e-inspect-exit-${Date.now()}`;
  const badly = `${stem}-badly`;
  const cleanly = `${stem}-cleanly`;
  try {
    await createExitedContainer(badly, 3);
    await createExitedContainer(cleanly, 0);

    const onBadly = await openInspect(page, badly);
    await expect(band(onBadly, 'Exit code').locator('.ui-definition-list__value')).toHaveText('3');
    const bad = await exitCodeColouring(onBadly);
    console.log(`[REQ-36] exited 3: exit code ${bad.exitCode}, an ordinary value ${bad.ordinary}, the danger role ${bad.danger}`);
    expect(bad.exitCode, 'a non-zero exit code is drawn in the ordinary value colour, so it reads as no news at all').not.toBe(bad.ordinary);
    expect(bad.exitCode, 'a non-zero exit code is drawn in some colour of its own rather than the application’s danger role').toBe(bad.danger);
    await closeContainerDetail(page);

    const onCleanly = await openInspect(page, cleanly);
    await expect(band(onCleanly, 'Exit code').locator('.ui-definition-list__value')).toHaveText('0');
    const clean = await exitCodeColouring(onCleanly);
    console.log(`[REQ-36] exited 0: exit code ${clean.exitCode}, an ordinary value ${clean.ordinary}, the danger role ${clean.danger}`);
    expect(clean.exitCode, 'a container that exited cleanly is drawn as bad news').toBe(clean.ordinary);
    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(badly);
    await removeContainerQuietly(cleanly);
  }
});
