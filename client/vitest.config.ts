import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { appVersionDefine } from './app-version.ts';

// Set by the coverage run alone, so a normal pass records nothing and costs
// nothing (plan-test_coverage_code_quality/REQ-17).
const coverageDirectory = process.env.VEXEL_COVERAGE_DIR;

// Separate from vite.config.ts: keeps the app's build config untouched and
// scopes unit/component tests to client/test (outside client/src, so the
// UI-boundary conformance check never scans test code).
export default defineConfig({
  plugins: [react()],
  // The same build-time version constant the app build injects: without it the
  // notice would render an undefined version under unit test alone.
  define: appVersionDefine,
  test: {
    environment: 'jsdom',
    include: ['test/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    reporters: ['dot'],
    ...(coverageDirectory
      ? {
          coverage: {
            enabled: true,
            provider: 'v8' as const,
            include: ['src/**'],
            reporter: ['json' as const],
            reportsDirectory: join(coverageDirectory, 'client-unit'),
          },
        }
      : {}),
  },
});
