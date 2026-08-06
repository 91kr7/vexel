import { defineConfig, devices } from '@playwright/test';

// Minimal Playwright setup for the client's e2e suite. No backend is
// involved for this batch: the dev server alone is enough to exercise the
// shell in a real browser.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'dot',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
