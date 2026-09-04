// The client half of `npm run mutation`
// (.sdd/modules/measurement/specs/client-mutation-configuration.md).

// Instrumented sources are not the sources these two read as text: one forbids
// `process.env` in `src`, which the instrumentation writes into every file it
// touches, and the other counts source shapes the instrumentation rewrites.
const testsThatReadTheSourcesAsText = ['timing-scale-build-independence', 'empty-state-action-names'];

export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts', related: false },
  coverageAnalysis: 'perTest',
  inPlace: true,
  mutate: ['src/**/*.ts', 'src/**/*.tsx', '!src/**/*.d.ts'],
  testFiles: [`test/unit/!(${testsThatReadTheSourcesAsText.join('|')}).test.@(ts|tsx)`],
  reporters: ['progress', 'json'],
  jsonReporter: { fileName: '../.mutation/client.json' },
  incremental: true,
  incrementalFile: '../.mutation/client-incremental.json',
  tempDirName: '../.mutation/client-work',
  cleanTempDir: 'always',
  logLevel: 'warn',
};
