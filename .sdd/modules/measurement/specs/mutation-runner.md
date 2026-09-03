---
module: measurement
component: Mutation runner
type: repository command
---

# Mutation runner

**Purpose** → `npm run mutation`: changes the sources of the unit trees on purpose, one change at a
time, and says which of those changes no unit test failed on.

## Contract

- `npm run mutation`, from the repository root, and nothing else runs it: `lint`, `test`, `coverage`,
  `start`, `build` and `serve` neither call it nor are called by it.
- **The area is an optional argument.**
  - no argument → both passes, in this order: the client unit tests, then the server unit tests
  - `npm run mutation -- client` / `npm run mutation -- server` → that pass alone
  - anything else → the command fails before running anything, naming the two accepted values
- Each pass runs in its own workspace and through its own configuration — *Client mutation
  configuration*, *Server mutation configuration* — and writes what it found to
  `.mutation/<workspace>.json`.
- A pass that fails does not stop the other: every chosen pass is run, and every one is reported.
- It then prints, in the terminal:
  - the moment, the duration, and — when only one pass was asked for — which one
  - one line per workspace: the score, how many changes were caught, how many were not, over how
    many files — or that the pass did not complete
  - the path of the report file
- It writes that report through the *Report store*, under `reports/mutation/`: the same figures, one
  row per source file, and then, file by file, every change no test caught with its line, the
  mutation applied, the text it was replaced with, and whether a test ran that line at all.
- **The report says which passes the run covered**, and when it covered one it says the other is
  absent from its tables and that it is no score for it.
- It exits non-zero when a pass did not complete — Stryker failed, or wrote no report — naming each
  such pass. A completed pass never fails the command, whatever the score: this measurement has no
  threshold.

## Rules and invariants

- **The score is the share of caught changes among the changes the run tested**: killed and timed-out
  count as caught, survived and never-executed count as not caught, and changes Stryker refused to
  test (ignored, or not compiling) are in neither, so they can neither raise nor lower it.
- **No daemon, no browser, no server.** Only the unit trees run, and they mock the Docker call: this
  is the one measurement of this repository that needs no Docker at all.
- **A run is long, and the two things that make it workable are the argument and the memory, never a
  smaller scope.** The server pass runs the whole server unit suite once per change — 9 834 changes
  at about 81 s each — because the command runner cannot be told which tests concern one change; the
  client pass runs only the tests that executed the changed line, over 13 911 changes. So each pass
  keeps what it found in `.mutation/<workspace>-incremental.json` and a later run re-tests only what
  the sources and the tests changed since. What is never done to shorten a run is mutating less of
  the tree than the whole of it.
- **The run leaves nothing of its own behind**: no process, and no tracked file — the passes work in
  place and put the sources back, `.mutation/` and `reports/` are git-ignored, and each pass's setup
  files are removed after it, since Stryker deletes them only when it exits cleanly.
- **A run empties its own previous report and nothing else** of `.mutation/`: the incremental file
  living beside it is what the next run reads.
- `npm run lint` and `npm run test` are untouched by it, and it runs neither the coverage nor the
  quality measurement.

## Dependencies

- *Report store* (same module) — where the report file goes.
- *Client mutation configuration*, *Server mutation configuration* (same module) — what each pass
  changes and what it runs against it.
- `@stryker-mutator/core` — makes the changes and runs the tests against each of them.

## Requirements served

- plan-test_coverage_code_quality/REQ-6
- plan-test_coverage_code_quality/REQ-7
- plan-test_coverage_code_quality/REQ-11
- plan-test_coverage_code_quality/REQ-12
- plan-test_coverage_code_quality/REQ-13
- plan-test_coverage_code_quality/REQ-14
- plan-test_coverage_code_quality/REQ-15
- plan-test_coverage_code_quality/REQ-16
