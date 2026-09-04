---
batch: 1 · coverage
feature: F1 — Test coverage
closed_req: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-18
depends: —
---

# Batch 1 — Coverage

One command, `npm run coverage`, runs the four suites of this repository, merges what each one
executed, prints a summary and writes a report file. Requirements are cited by id and live in
[`../requirements.md`](../requirements.md).

The four suites: `client/test/unit` (vitest), `server/test/unit` and `server/test/api`
(`node --test`), `client/e2e` (Playwright).

## What this batch builds

- **Report store** — the shared place a measurement writes its report file: it resolves
  `reports/<measurement>/`, names the file from the run's date and time, and keeps the ten most
  recent files of that measurement. Batches 2 and 3 write through it too.
- **Coverage runner** — the script behind `npm run coverage`: it runs the suites, merges their
  coverage, prints the summary and writes the report.
- **Coverage server entry** — starts the already-built server for the browser-driven run and writes
  its coverage before it exits. It exists because the product handles no stop signal.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | repository-root tooling (`scripts/`), measurement area | **Report store.** Resolve `reports/<measurement>/`, name the run's file from its date and time, write it, and remove all but the ten most recent files of that measurement. | REQ-13, REQ-14, REQ-18 | — |
| INT-2 | modify | `.gitignore` (repository root) | Ignore `reports/` and the directory the coverage run collects its raw data in. | REQ-14 | — |
| INT-3 | modify | `client/vitest.config.ts` | When the coverage run asks for it, write the client unit tests' V8 coverage into the run's raw directory. Unset, the file behaves as today. | REQ-1, REQ-17 | — |
| INT-4 | create | repository-root tooling (`scripts/`), measurement area | **Coverage runner, the spine.** Run the four suites in a fixed order, each writing raw V8 data into the run's directory, and keep the sweep that closes the daemon-backed pass. | REQ-1, REQ-2, REQ-15, REQ-16 | INT-3, INT-8, INT-9 |
| INT-5 | create | repository-root tooling (`scripts/`), measurement area | **Coverage runner, the merge.** Merge the raw data of every suite into one report per workspace — a figure per workspace and per file — mapped back to the TypeScript sources. | REQ-1, REQ-3, REQ-4 | INT-4 |
| INT-6 | create | repository-root tooling (`scripts/`), measurement area | **Coverage runner, the summary and the guard.** Print the summary, write the report through the report store, and fail naming any suite that contributed no data. | REQ-5, REQ-13 | INT-1, INT-5 |
| INT-7 | modify | `client/vite.config.ts` | When the coverage run asks for it, emit source maps in the client build, so the browser's coverage maps back to `client/src`. | REQ-3, REQ-17 | — |
| INT-8 | modify | `client/e2e/support/test.ts` | When the coverage run asks for it, collect the browser's JavaScript coverage around each test and write it into the run's raw directory. | REQ-3, REQ-17 | INT-7 |
| INT-9 | modify | `client/playwright.config.ts` | When the coverage run asks for it, start the web server through the coverage server entry, with the raw directory set. Unset, the command and the environment stay as today. | REQ-3, REQ-17 | INT-10 |
| INT-10 | create | repository-root tooling (`scripts/`), measurement area | **Coverage server entry.** Start the built server and, on the stop signal, write its V8 coverage before exiting. The server build emits source maps for the coverage run. | REQ-3 | — |
| INT-11 | modify | `package.json` (repository root, `scripts`) | Add the `coverage` script and the coverage dependencies. `lint`, `test`, `start`, `build` and `serve` are untouched. | REQ-11, REQ-12, REQ-17 | INT-6 |

## Human acceptance

### Scenario: The human sees how much of the code the tests execute

- REQ → REQ-1, REQ-2, REQ-3, REQ-4, REQ-13
- Given → the repository is installed and the Docker daemon is running
- When → the human runs `npm run coverage` at the repository root
- Then → the terminal prints one coverage figure for the client and one for the server, and a report
  file for that run appears under `reports/coverage/`
- And → the report lists a figure for each source file, and files executed only by the daemon-backed
  suite or only by the browser-driven suite carry a figure above zero

### Scenario: A suite that reported nothing stops the run

- REQ → REQ-5
- Given → one of the four suites ran but produced no coverage data
- When → the coverage command reaches its summary
- Then → the command fails and names the suite that reported nothing, instead of printing a lower
  figure

### Scenario: The run leaves the machine as it found it

- REQ → REQ-15, REQ-16, REQ-18
- Given → a coverage run has just finished
- When → the human lists their Docker containers and runs `git status`
- Then → no container and no process of the run is left, and git reports no change
- And → `reports/coverage/` holds at most ten files, the oldest ones removed

### Scenario: The normal passes are unchanged

- REQ → REQ-17
- Given → the coverage command has been added
- When → the human runs `npm run lint` and then `npm run test`
- Then → both run the same steps as before, give the same result, and take the same time
