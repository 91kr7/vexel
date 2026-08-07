import { defineConfig, devices } from '@playwright/test';

// Playwright setup for the client's e2e suite. Since batch-daemon-connectivity
// wires the shell to the real server API (connectivity status, live events),
// both the client dev server and the server workspace must be running.
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
  use: {
    baseURL: 'http://localhost:5173',
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
  webServer: [
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -w server',
      cwd: '..',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
