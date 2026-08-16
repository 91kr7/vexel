import { expect, test, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

// The Swarm screen in a real browser, against the operator's own daemon
// (REQ-79 to REQ-84).
//
// Nothing here initialises, joins or leaves a swarm, and nothing is created:
// this file drives the path that is available whatever the daemon is, and — on
// the daemon this project is developed against, which is outside a swarm — that
// path *is* the requirement. A screen that meets no cluster must say what the
// daemon is **once**, with the two ways in inside that one statement, rather
// than repeating it in a banner and in four panels
// (`plan-ui-coherence-optimisation/REQ-52`, `REQ-53`). What needs a cluster is
// driven in `e2e/exclusive/swarm-cluster.spec.ts`, which puts the daemon back
// the way it found it.
//
// **The two tests that used to require the opposite are replaced here, not
// dropped.** "each panel carries the reason" and "the four panels" asserted the
// condition was stated five times, which is the defect batch 12 removes: the
// claim they made is now made the other way round, against the count. The
// geometry of that count, and the cluster's own inventories, are measured in
// `swarm-row-geometry.spec.ts` against a stubbed reading.

const { stdout: swarmInfo } = await execFileAsync('docker', ['info', '--format', '{{.Swarm.LocalNodeState}} {{.Swarm.ControlAvailable}}']);
const [LOCAL_NODE_STATE = 'inactive'] = swarmInfo.trim().split(' ');
const IN_SWARM = LOCAL_NODE_STATE !== 'inactive';

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

/** The five inventories, each in a card of its own, on a manager (swarm-screen.md). */
const INVENTORIES = ['Nodes', 'Services & tasks', 'Secrets', 'Configs', 'Stacks'];

// The last active screen survives by design (REQ-115), so the screen this suite
// needs is pinned rather than inherited from whichever spec ran before.
test.beforeEach(async ({ page }) => {
  await openApp(page, 'swarm');
  await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible({ timeout: 20_000 });
});

// plan-docker_management_app/REQ-79 — the swarm state of the active daemon is shown, and a swarm can
// be initialised or joined. plan-ui-coherence-optimisation/REQ-52, REQ-53 — swarm-screen.md: "where
// there is no cluster to read, exactly one statement of why, on one surface — the empty state, with
// the two actions that resolve it *inside* it".
test('states that the daemon is outside a swarm once, with both ways in inside that statement', async ({ page }) => {
  test.skip(IN_SWARM, 'this daemon is in a swarm; the way in is only offered to one that is not');

  const statement = screenContent(page).locator('.ui-empty-state');
  await expect(statement).toHaveCount(1, { timeout: 20_000 });
  await expect(statement.getByText('This daemon is not part of a swarm')).toBeVisible();

  // The two resolving actions are the statement's own, and the bar that used to carry them is not
  // drawn at all where there is no state to qualify.
  await expect(statement.getByRole('button', { name: 'Initialise a swarm' })).toBeVisible();
  await expect(statement.getByRole('button', { name: 'Join an existing one' })).toBeVisible();
  await expect(screenContent(page).locator('.ui-state-summary-bar')).toHaveCount(0);

  // The token action is offered on a manager only, and there is nothing to leave.
  await expect(screenContent(page).getByRole('button', { name: 'Join tokens' })).toHaveCount(0);
  await expect(screenContent(page).getByRole('button', { name: 'Leave swarm' })).toHaveCount(0);
});

// plan-ui-coherence-optimisation/REQ-52 — "**No panel states it at all** — the panels are rendered
// only where there is a cluster to read, so a panel has nothing to explain and no reason to explain
// it." This replaces "shows the four panels, each stating the reason it has nothing to list", which
// asserted the repetition the batch deletes.
test('draws no inventory panel, and no second statement, where there is no cluster to read', async ({ page }) => {
  test.skip(IN_SWARM, 'the panels are drawn on a manager, which this daemon is not outside a swarm');

  // Waited for the statement itself, not merely for an empty state: "Reading the swarm state…" is
  // one too, and a screen still being read has no condition to state yet.
  await expect(screenContent(page).getByText('This daemon is not part of a swarm')).toBeVisible({ timeout: 20_000 });
  await expect(screenContent(page).locator('.ui-empty-state')).toHaveCount(1);
  for (const title of INVENTORIES) {
    await expect(
      screenContent(page).getByRole('heading', { level: 2, name: title }),
      `the ${title} card is drawn where there is no cluster to read`,
    ).toHaveCount(0);
  }
  await expect(screenContent(page).locator('.ui-data-table')).toHaveCount(0);

  // Exactly one element on screen says it. **A statement is a leaf element whose own text asserts,
  // in words, that there is no cluster to read** — the same definition
  // `swarm-row-geometry.spec.ts` measures the before-and-after with: a container is not counted for
  // what its children say, a line saying what to *do* about the condition is an instruction rather
  // than a repetition of it, and a state name (`Swarm inactive`) is not an assertion.
  const saying = await screenContent(page).evaluate((region) =>
    [...region.querySelectorAll<HTMLElement>('*')].filter(
      (element) =>
        element.children.length === 0 &&
        /not part of a swarm|not a manager|only a manager|no cluster to read/i.test((element.textContent ?? '').trim()),
    ).length,
  );
  console.log(`[REQ-52] the daemon's own screen states the condition with ${saying} element(s)`);
  expect(saying, 'the condition is stated by more than one element on screen').toBe(1);

  // …and no reading of this area ever surfaces as an error.
  await expect(screenContent(page).getByText(/^Error|failed|unexpected/i)).toHaveCount(0);
});

// plan-docker_management_app/REQ-79, REQ-80 — a swarm is joined using a join token.
// swarm-screen.md — "the join token (entered masked, never displayed back)". Nothing is submitted:
// this daemon's membership of a swarm is not this suite's to change.
test('asks for the join token in a masked field with no reveal, and joins nothing', async ({ page }) => {
  test.skip(IN_SWARM, 'the join form is reached from a daemon that is outside a swarm');

  await screenContent(page).getByRole('button', { name: 'Join an existing one' }).click();
  const dialog = page.locator('.ui-modal');
  await expect(dialog).toBeVisible();

  await expect(dialog.getByLabel(/manager address/i)).toBeVisible();
  const token = dialog.getByLabel(/token/i);
  await expect(token).toBeVisible();
  await expect(token).toHaveAttribute('type', 'password');
  await expect(dialog.getByRole('button', { name: /show|reveal/i })).toHaveCount(0);

  // What is typed is dropped with the form, and is nowhere in the page after it closes.
  await token.fill('SWMTKN-1-e2e-typed-never-submitted');
  await dialog.getByRole('button', { name: /cancel/i }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.content()).not.toContain('SWMTKN-1-e2e-typed-never-submitted');
});

// Departure Three (2026-08-07), plan-docker_management_app/REQ-83 — "This screen observes and
// removes stacks; it does not deploy them." swarm-screen.md — "The screen offers no deploy
// affordance, no compose-file path input and no compose editor."
test('offers nothing anywhere that would deploy a stack', async ({ page }) => {
  const content = screenContent(page);
  await expect(content.locator('.ui-empty-state, .ui-data-table').first()).toBeVisible({ timeout: 20_000 });

  await expect(content.getByRole('button', { name: /deploy/i })).toHaveCount(0);
  await expect(content.getByRole('button', { name: /compose/i })).toHaveCount(0);
  await expect(content.getByRole('button', { name: /upload/i })).toHaveCount(0);
  await expect(content.locator('input[type="file"]')).toHaveCount(0);
  // No compose editor and no path to type one in.
  await expect(content.locator('textarea')).toHaveCount(0);
  await expect(content.getByText(/compose|\.ya?ml|stack file/i)).toHaveCount(0);
});
