// The server half of `npm run mutation`
// (.sdd/modules/measurement/specs/server-mutation-configuration.md).
export default {
  packageManager: 'npm',
  testRunner: 'command',
  commandRunner: { command: 'npm run test:unit -w server' },
  coverageAnalysis: 'off',
  inPlace: true,
  mutate: ['src/**/*.ts'],
  reporters: ['progress', 'json'],
  jsonReporter: { fileName: '../.mutation/server.json' },
  incremental: true,
  incrementalFile: '../.mutation/server-incremental.json',
  tempDirName: '../.mutation/server-work',
  cleanTempDir: 'always',
  logLevel: 'warn',
};
