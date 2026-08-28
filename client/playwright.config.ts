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

export default defineConfig({
  testDir: './e2e',
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
  projects: [
    // The parallel body of the suite. Every fixture it creates is labelled and
    // scoped to its own spec, so specs cannot disturb one another.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /exclusive\//,
    },
    // Specs whose action is global by nature (the daemon's prune removes every
    // stopped container / dangling image on the host). They cannot be scoped, so
    // they are scheduled apart: after the parallel project, serially within it.
    {
      name: 'exclusive',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /exclusive\/.*\.spec\.ts/,
      fullyParallel: false,
      dependencies: ['chromium'],
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
    env: { PORT: String(E2E_PORT), VEXEL_DATA_DIR: E2E_DATA_DIR, VEXEL_DOCKER_LOG: 'off' },
  },
});
