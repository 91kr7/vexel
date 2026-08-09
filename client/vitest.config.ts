import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { appVersionDefine } from './app-version.ts';

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
  },
});
