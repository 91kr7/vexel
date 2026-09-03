# measurement — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Report store | tooling module | `scripts/measurement/report-store.mjs` | Where every measurement writes its report file: `reports/<measurement>/`, the name taken from the run's date and time, the ten most recent kept | `specs/report-store.md` |
| Coverage runner | repository command | `scripts/measurement/coverage.mjs` (with `coverage-merge.mjs` and `coverage-summary.mjs` beside it) | `npm run coverage`: runs the four suites, merges line by line what each executed into one figure per workspace and per source file, prints the summary, writes the report, and fails naming any suite that recorded nothing | `specs/coverage-runner.md` |
| Coverage server entry | repository command | `scripts/measurement/coverage-server.mjs` | The web server the browser-driven suite runs against under coverage: builds client and server with source maps, serves the built application, and writes what it executed on the stop signal the product itself does not handle | `specs/coverage-server-entry.md` |
| Suite coverage wiring | configuration | `client/vitest.config.ts`, `client/playwright.config.ts`, `client/e2e/support/test.ts` | What makes each suite record the lines it executes when `VEXEL_COVERAGE_DIR` is set, and leaves every suite exactly as it was when it is not | `specs/suite-coverage-wiring.md` |
