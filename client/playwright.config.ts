import { defineConfig, devices } from '@playwright/test';

// Playwright setup for the client's e2e suite. Since batch-daemon-connectivity
// wires the shell to the real server API (connectivity status, live events),
// both the client dev server and the server workspace must be running.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'dot',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
