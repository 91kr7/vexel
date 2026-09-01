import { defineConfig, devices } from '@playwright/test';
import { E2E_DATA_DIR } from './e2e/support/fixtures';

/**
 * The e2e suite drives the **delivered form of the product**: one Express
 * process serving the built interface and the API from the same origin and the
 * same port. No Vite dev server is started, and nothing listens on 5173 during a
 * run — the form the operator runs is the form that is verified.
 * REQ ids below belong to plan-docker_management_app-single_process_serving.
 */

/**
 * The suite's own port, deliberately not the developer's 3000 (REQ-19): a
 * developer with `npm run dev:server` up neither disturbs a run nor is disturbed
 * by it.
 */
const E2E_PORT = 3100;
const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;

/**
 * What every test of this suite gets unless it says otherwise. It is Playwright's
 * own default, written down rather than inherited: it is the ceiling every step
 * budget in a test has to fit inside, and a ceiling nobody has written down is a
 * ceiling nobody counts against — which is how a 40s wait came to be declared
 * inside a 30s test (plan-docker_management_app-containers_card_view/REQ-70).
 * Nothing changes at run time; `scripts/check-budget-conformance.mjs` reads the
 * number from here.
 */
const DEFAULT_TEST_BUDGET_MS = 30_000;

export default defineConfig({
  testDir: './e2e',
  timeout: DEFAULT_TEST_BUDGET_MS,
  // One worker on purpose. Every spec drives the same Docker daemon, so running
  // them at once does not overlap idle time — it queues the same serialised
  // daemon work behind a 30s per-test budget and turns contention into spurious
  // timeouts. Measured on this suite: fully parallel and 3 workers both failed
  // with `Test timeout exceeded` on tests that pass serially, at no wall-clock
  // gain (201s / 210s parallel against 195s serial). Isolation is what makes
  // specs independent; concurrency is what makes them flaky here.
  workers: 1,
  fullyParallel: false,
  reporter: 'dot',
  // Prepares the shared base images and the run's own registry, and wipes the
  // run's data directory, so no spec pays for that work inside its own timeout
  // and no run inherits the state of the one before it.
  globalSetup: './e2e/support/global-setup.ts',
  // Stops the registry the setup started: no spec may, since every later one
  // still needs it.
  globalTeardown: './e2e/support/global-teardown.ts',
  use: {
    baseURL: E2E_ORIGIN,
    trace: 'retain-on-failure',
  },
  // One project over the whole suite, destructive specs included. They used to
  // be scheduled apart, after a project they declared as a dependency — which
  // meant a red anywhere in the suite skipped them entirely, and that is what
  // ended the arrangement. What made the split unnecessary is that no spec
  // trusts what the one before it left: each ensures the base images it needs at
  // the point of use (`server/test/support/base-images.ts`), so a prune landing
  // mid-suite costs a local restore from the run's own registry and nothing
  // else. The run is serial, so a prune can never reach a fixture still in use.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // The operator's own command, run as the operator runs it: build the client,
    // build the server, then serve both from the one process. The build belongs
    // here and cannot move into `globalSetup` — Playwright starts the web server
    // *before* that hook, so a build placed there would run against whatever
    // `client/dist` already held.
    command: 'npm start -s',
    cwd: '..',
    // The server's own liveness address, on the suite's port: the entry document
    // is served by the same process, so one readiness probe covers both.
    url: `${E2E_ORIGIN}/health`,
    // A full client *and* server build, from cold, before the process even
    // starts listening — not the 30s a dev server needed.
    timeout: 300_000,
    // Never reuse a running process (REQ-19, REQ-21). A reused one would serve
    // whatever build it happens to hold, under the operator's own data
    // directory, and both failures are silent.
    reuseExistingServer: false,
    // `tsc` reports its diagnostics on stdout: ignoring it would turn a failed
    // build into a five-minute timeout with no stated reason.
    stdout: 'pipe',
    // The Docker call log is on by default for an operator; here it is not.
    // This process's stdout is piped into the reporter's own output, and a run
    // makes thousands of calls — a line each would bury the dots and every
    // failure among them.
    env: {
      PORT: String(E2E_PORT),
      VEXEL_DATA_DIR: E2E_DATA_DIR,
      VEXEL_DOCKER_LOG: 'off',
      // The suite runs the product on a fifth of its own clock (plan-docker_management_app-timing_scale/REQ-18).
      VEXEL_TIMING_SCALE: '0.2',
    },
  },
});
