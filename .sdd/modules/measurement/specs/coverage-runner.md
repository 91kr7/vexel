---
module: measurement
component: Coverage runner
type: repository command
---

# Coverage runner

**Purpose** → `npm run coverage`: runs the four suites of this repository, merges what each of them
executed, and says how much of the client's and the server's source the tests reach — one figure per
workspace and one per file.

## Contract

- `npm run coverage`, from the repository root, and nothing else runs it: `lint`, `test`, `start`,
  `build` and `serve` neither call it nor are called by it.
- It empties `.coverage/` and runs the four suites in this order, each recording into its own
  directory under `.coverage/raw/`:
  1. the client unit tests — `npm run test:unit -w client`, with `VEXEL_COVERAGE_DIR` set
  2. the server unit tests — `npm run test:unit -w server`, with `NODE_V8_COVERAGE` set and node's
     source maps enabled
  3. the daemon-backed suite — `npm run test:api -w server`, the same way
  4. the browser-driven suite — `npm run test:e2e -w client -- --quiet`, with `VEXEL_COVERAGE_DIR`
     set; it records twice, the server it drives and the code the browser runs
- Whatever those four did, the run closes on `npm run test:sweep -w server`.
- It then prints, in the terminal:
  - one line per workspace: the percentage, the covered and the known lines, and how many source
    files no suite executed
  - one line per suite: whether the suite itself passed, and how many source files it executed a
    line of
  - the path of the report file
- It writes that report through the *Report store*, under `reports/coverage/`: the same figures, plus
  one row per source file of both workspaces.
- It exits non-zero **only** when a suite recorded nothing at all, naming each such suite. The
  browser-driven suite's two halves are named apart, so a browser that recorded nothing cannot hide
  behind the server it drove.
- A suite whose own tests failed is reported as failed in the summary and in the report, and does not
  fail the command: the measurement is of what ran.

## Rules and invariants

- **A figure is a count of lines.** The four suites reach their sources through three different
  transformations — vitest's, node's and the browser bundle's — so their statement positions cannot
  be added together; line numbers are the one coordinate they share. A file's figure is the lines at
  least one suite executed over the lines those suites know the file has, so a line one suite missed
  and another ran counts as covered.
- **Every suite's data is mapped back to the TypeScript sources** before anything is counted: the
  server's from the built JavaScript, the browser's from the bundle it was served.
- **A source file no suite loaded is named, not counted**: it carries no known lines, so it can
  neither raise nor lower the figure of its workspace by being absent from the report.
- Only `client/src` and `server/src` are counted. Test trees, build output, configuration and
  dependencies are not the subject of the measurement.
- **The run leaves nothing of its own behind**: no process (each suite is run to completion, the
  browser-driven one stopping its own web server), no container beyond what the suites themselves
  create and the closing sweep removes, and no tracked file — `.coverage/` and `reports/` are
  git-ignored.
- The suites are the repository's own, run by their own commands: the coverage run adds environment
  variables and nothing else, so a suite behaves exactly as it does in `npm run test`.

## Dependencies

- *Report store* (same module) — where the report file goes.
- *Suite coverage wiring* (same module) — what makes each suite record.
- *Coverage server entry* (same module) — the server the browser-driven suite drives.
- `c8` — maps raw V8 data back to the TypeScript sources; `istanbul-lib-coverage` — reads the result.

## Requirements served

- plan-test_coverage_code_quality/REQ-1
- plan-test_coverage_code_quality/REQ-2
- plan-test_coverage_code_quality/REQ-3
- plan-test_coverage_code_quality/REQ-4
- plan-test_coverage_code_quality/REQ-5
- plan-test_coverage_code_quality/REQ-11
- plan-test_coverage_code_quality/REQ-12
- plan-test_coverage_code_quality/REQ-13
- plan-test_coverage_code_quality/REQ-15
- plan-test_coverage_code_quality/REQ-16
