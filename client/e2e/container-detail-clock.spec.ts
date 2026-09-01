/**
 * **The container detail follows the container it shows**
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-25, REQ-27, REQ-28,
 * REQ-29, REQ-30, REQ-31, REQ-39; `containers/specs/container-detail-panel.md`,
 * `containers/specs/container-processes-view.md`).
 *
 * The defect this file exists for was seen by the human: with the Inspect tab open they paused the
 * container from a terminal, and the dialog's header read PAUSED while the payload below it read
 * `Status: running`, `Paused: false`. One screen, one moment, two contradictory statements.
 *
 * So the first case is that defect, driven exactly as it was found: nothing is pressed between the
 * `docker pause` and the reading, and the header and the payload are read **in one pass**, so a
 * failure cannot be two frames compared with each other.
 *
 * The rest is the price of the clock. A tick that finds nothing changed must take nothing away from
 * the operator, and a tick that finds something changed must replace the values where they stand —
 * so a section they opened, a find they typed and an edit they are in the middle of are each driven
 * across a change made from outside.
 *
 * Every fixture carries the ownership labels, is created from the suite's own `alpine:3.20` (never
 * pulled here) and is removed with `docker rm -fv` in a `finally`. No assertion is made on the
 * operator's own daemon: the list is narrowed to the fixture by name.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { clickAtItsCentre } from './support/settled.js';
import { containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';

/** The period both hooks declare, unscaled (`use-container-detail.md`, `use-container-processes.md`). */
const DECLARED_PERIOD_MS = 3_000;
/** What `playwright.config.ts` starts the web server at (plan-docker_management_app-timing_scale/REQ-18). */
const SUITE_SCALE = 0.2;
const PERIOD_ON_THE_SUITE_CLOCK_MS = DECLARED_PERIOD_MS * SUITE_SCALE;

/**
 * How long a view is given to catch up with a change made from outside: four whole periods on the
 * *shipped* clock, so the budget holds at any factor and sits well inside the test's own 30s. A page
 * with no clock at all never gets there however long it is given.
 */
const FOLLOWS_THE_CONTAINER_MS = 12_000;

/** Long enough for several ticks to have run, so "nothing was disturbed" is a claim about ticks that happened. */
const SEVERAL_TICKS_MS = PERIOD_ON_THE_SUITE_CLOCK_MS * 4;

async function createRunningContainer(name: string): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sleep', ALPINE_IMAGE, '300']);
}

async function createBusyContainer(name: string): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(name),
    '--entrypoint',
    'sh',
    ALPINE_IMAGE,
    '-c',
    'while true; do sleep 1; done',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  // `-v` and never a bare `-f`: an anonymous volume the daemon attached on its own behalf outlives
  // the container carrying no label of ours, invisible to any later sweep.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** Opens the fixture's detail, with a real pointer at each visible control's own coordinates. */
async function openDetail(page: Page, name: string): Promise<Locator> {
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('Search name, image or state…').fill(name);
  await expect(containerCard(page, name), 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });
  await openContainerDetail(page, name);
  return containerDetail(page);
}

async function openTab(page: Page, detail: Locator, name: string): Promise<void> {
  await clickAtItsCentre(page, detail.getByRole('tab', { name, exact: true }), `the ${name} tab`);
}

async function openInspect(page: Page, name: string): Promise<Locator> {
  const detail = await openDetail(page, name);
  await openTab(page, detail, 'Inspect');
  await expect(detail.getByLabel('Find in payload'), 'the Inspect tab draws no find control').toBeVisible({ timeout: 20_000 });
  return detail;
}

function sectionNamed(page: Page, title: string): Locator {
  return containerDetail(page)
    .locator('.ui-payload-sections > .ui-collapsible-section')
    .filter({ has: page.locator('.ui-collapsible-section__title', { hasText: new RegExp(`^${title}$`) }) })
    .first();
}

/**
 * What the header says about the container and what the `State` section of the payload says, read
 * in one pass: two readings taken separately could disagree because they are two frames, which is
 * not the defect under check.
 */
interface OneMoment {
  header: string;
  payload: Record<string, string>;
}

async function headerAndPayloadInOnePass(detail: Locator): Promise<OneMoment> {
  return await detail.evaluate((dialog) => {
    const header = (dialog.querySelector('.ui-modal__title')?.textContent ?? '').trim();
    const state = Array.from(dialog.querySelectorAll('.ui-payload-sections > .ui-collapsible-section')).find(
      (section) => (section.querySelector('.ui-collapsible-section__title')?.textContent ?? '').trim() === 'State',
    );
    const payload: Record<string, string> = {};
    for (const band of Array.from(state?.querySelectorAll('.ui-payload-band') ?? [])) {
      const label = (band.querySelector('.ui-payload-band__label')?.textContent ?? '').trim();
      payload[label] = (band.querySelector('.ui-payload-band__value')?.textContent ?? '').trim();
    }
    return { header, payload };
  });
}

// REQ-25, REQ-26 — "With a container's detail open, the dialog does not contradict itself: what its
// header says about the container and what its payload says do not describe two different moments
// for longer than one period."
test('the header and the Inspect payload agree after the container is paused from outside', async ({ page }) => {
  const name = `vexel-e2e-detail-clock-pause-${Date.now()}`;
  try {
    await createRunningContainer(name);
    const detail = await openInspect(page, name);

    const atFirst = await headerAndPayloadInOnePass(detail);
    expect(atFirst.header.toLowerCase(), 'the header does not say the fixture is running to begin with').toContain('running');
    expect(atFirst.payload.Status, 'the State section does not say the fixture is running to begin with').toBe('running');

    // Paused behind the application's back, and nothing on screen is touched
    // afterwards: the clock is the only trigger either half has left.
    await execFileAsync('docker', ['pause', name]);

    await expect
      .poll(async () => headerAndPayloadInOnePass(detail), {
        timeout: FOLLOWS_THE_CONTAINER_MS,
        message:
          'the dialog went on contradicting itself: the header and the payload describe two different moments of the same container',
      })
      .toMatchObject({ header: /paused/i, payload: { Status: 'paused', Paused: 'true' } });
  } finally {
    await execFileAsync('docker', ['unpause', name]).catch(() => undefined);
    await removeContainerQuietly(name);
  }
});

// REQ-28 — "that data is read the moment the operator opens that tab": switching to Inspect shows
// what is true now, without a wait and without a refresh.
test('switching to the Inspect tab shows a state the container reached while another tab was open', async ({ page }) => {
  const name = `vexel-e2e-detail-clock-switch-${Date.now()}`;
  try {
    await createRunningContainer(name);
    const detail = await openDetail(page, name);
    await openTab(page, detail, 'Logs');
    await expect(detail.getByRole('tab', { name: 'Logs', exact: true })).toHaveAttribute('aria-selected', 'true');

    await execFileAsync('docker', ['pause', name]);
    // Watched from the Logs tab, where neither reading is taken at all.
    await page.waitForTimeout(SEVERAL_TICKS_MS);

    await openTab(page, detail, 'Inspect');

    await expect
      .poll(async () => (await headerAndPayloadInOnePass(detail)).payload.Status, {
        timeout: FOLLOWS_THE_CONTAINER_MS,
        message: 'the Inspect tab opened on what was true when the detail was opened, not on what is true now',
      })
      .toBe('paused');
  } finally {
    await execFileAsync('docker', ['unpause', name]).catch(() => undefined);
    await removeContainerQuietly(name);
  }
});

// REQ-29, REQ-30 — "the sections the operator opened stay open, the find keeps filtering … and
// nothing is closed, collapsed or reset."
test('a section the operator opened and a find they typed survive the container changing', async ({ page }) => {
  const name = `vexel-e2e-detail-clock-undisturbed-${Date.now()}`;
  try {
    await createRunningContainer(name);
    const detail = await openInspect(page, name);

    const hostConfig = sectionNamed(page, 'HostConfig');
    await expect(hostConfig, 'the payload draws no HostConfig section').toBeVisible({ timeout: 20_000 });
    const header = hostConfig.locator('.ui-collapsible-section__header');
    expect(await header.getAttribute('aria-expanded'), 'HostConfig is already open, so opening it proves nothing').toBe('false');
    await clickAtItsCentre(page, header, 'the HostConfig section header');
    await expect(header).toHaveAttribute('aria-expanded', 'true');

    const find = detail.getByLabel('Find in payload');
    await clickAtItsCentre(page, find, 'the find control');
    await page.keyboard.type('RestartPolicy');
    const filtered = await detail.locator('.ui-payload-sections > .ui-collapsible-section .ui-collapsible-section__title').allTextContents();
    expect(filtered, 'the find did not filter the payload down before the container was changed').toEqual(['HostConfig']);

    // The container is changed from outside, so the ticks that follow are ticks
    // that find a difference and replace what they hold.
    await execFileAsync('docker', ['pause', name]);
    await page.waitForTimeout(SEVERAL_TICKS_MS);

    await expect(header, 'the section the operator opened was closed by a tick').toHaveAttribute('aria-expanded', 'true');
    await expect(find, 'the find control was cleared by a tick').toHaveValue('RestartPolicy');
    expect(
      await detail.locator('.ui-payload-sections > .ui-collapsible-section .ui-collapsible-section__title').allTextContents(),
      'the find stopped filtering after a tick',
    ).toEqual(['HostConfig']);
  } finally {
    await execFileAsync('docker', ['unpause', name]).catch(() => undefined);
    await removeContainerQuietly(name);
  }
});

// REQ-31 — "An edit in progress on the Config tab is never disturbed by a tick: the form is not
// rebuilt and no value the operator has typed is replaced."
test('an edit in progress on the Config tab keeps every value typed into it', async ({ page }) => {
  const name = `vexel-e2e-detail-clock-editing-${Date.now()}`;
  try {
    await createRunningContainer(name);
    const detail = await openDetail(page, name);

    const edit = detail.getByRole('button', { name: 'Edit configuration', exact: true });
    await expect(edit, 'the Config tab never finished loading its inspect data').toBeVisible({ timeout: 20_000 });
    await clickAtItsCentre(page, edit, 'the Edit configuration action');
    const policy = detail.getByRole('combobox', { name: 'Restart policy' });
    await expect(policy, 'the edit form never opened').toBeVisible();

    await policy.selectOption('always');
    await expect(policy).toHaveValue('always');

    // Changed from outside while the form is open, so the ticks that follow are
    // ticks that find a difference.
    await execFileAsync('docker', ['pause', name]);
    await page.waitForTimeout(SEVERAL_TICKS_MS);

    await expect(policy, 'a tick rebuilt the edit form under the operator').toBeVisible();
    await expect(policy, 'a tick replaced a value the operator had typed').toHaveValue('always');
  } finally {
    await execFileAsync('docker', ['unpause', name]).catch(() => undefined);
    await removeContainerQuietly(name);
  }
});

// REQ-27 — "The container's process listing reads again on its own, at the same period, while the
// Processes tab is open and the container is running."
test('the Processes tab lists a process started inside the container without being asked', async ({ page }) => {
  const name = `vexel-e2e-detail-clock-processes-${Date.now()}`;
  const marker = '424242';
  try {
    await createBusyContainer(name);
    const detail = await openDetail(page, name);
    await openTab(page, detail, 'Processes');
    await expect(detail.getByText(/while true/), 'the Processes tab never listed the fixture’s own process').toBeVisible({ timeout: 20_000 });

    await execFileAsync('docker', ['exec', '-d', name, 'sleep', marker]);

    // Nothing is pressed: the tab's own refresh control is checked in
    // `container-stats-processes.spec.ts`, and here it must not be needed.
    await expect(detail.getByText(new RegExp(`sleep ${marker}`)), 'the process listing did not follow what runs inside the container').toBeVisible({
      timeout: FOLLOWS_THE_CONTAINER_MS,
    });
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-27 — "A container that is not running is not asked for its processes at all", and the tab
// says so rather than reporting the daemon's refusal every period.
test('a container that is not running is asked for its processes not once', async ({ page }) => {
  const name = `vexel-e2e-detail-clock-stopped-${Date.now()}`;
  try {
    await createRunningContainer(name);
    await execFileAsync('docker', ['stop', '-t', '0', name]);

    const asked: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/processes')) asked.push(request.url());
    });

    const detail = await openDetail(page, name);
    await openTab(page, detail, 'Processes');
    await expect(detail.getByText(/No process is running in this container/i)).toBeVisible({ timeout: 20_000 });

    await page.waitForTimeout(SEVERAL_TICKS_MS);

    expect(asked, `the daemon was asked for a stopped container's processes ${asked.length} times`).toEqual([]);
  } finally {
    await removeContainerQuietly(name);
  }
});
