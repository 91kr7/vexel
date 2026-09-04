---
module: measurement
component: Client mutation configuration
type: configuration
---

# Client mutation configuration

**Purpose** → what the mutation run changes in the client, and which tests decide whether a change
was caught.

## Contract

- Changes every TypeScript source of `client/src`, type declarations apart.
- Runs `client/test/unit` through the vitest runner, against `client/vitest.config.ts` — the same
  configuration `npm run test:unit -w client` uses, so the tests that judge a change are the tests
  the repository already has.
- Two unit tests are left out of the pass, both of which read `client/src` as text rather than
  running it: one forbids `process.env` in the sources, and one counts source shapes. The mutation
  tool writes its own switch — `process.env` included — into every file it changes, so both fail on
  a changed tree whatever the change is, and would report every change of every file they scan as
  caught.
- Per change, only the tests that executed the changed line are run.
- Writes what it found to `.mutation/client.json`, and its working files to `.mutation/client-work/`,
  which it removes whether the pass succeeded or not.
- Keeps `.mutation/client-incremental.json` between runs, so a later run tests only the changes in
  code, or in tests, that moved since.

## Rules and invariants

- **The sources are changed where they live**, not in a copy: the client unit tree reads the
  repository root, its own `scripts/` and its own `src/` by path, and none of those paths hold from
  a copy elsewhere on disk. The tool keeps the originals and puts them back when the pass ends.
- Nothing here is read by `npm run test -w client`: it is a separate configuration file, used by the
  mutation command alone.
- The pass covers 13 911 changes over 222 files, and running only the tests that executed a changed
  line is what keeps it the shorter of the two.

## Dependencies

- *Mutation runner* (same module) — the only thing that runs it.
- `@stryker-mutator/vitest-runner` — runs the client unit tests per change.

## Requirements served

- plan-test_coverage_code_quality/REQ-6
- plan-test_coverage_code_quality/REQ-7
- plan-test_coverage_code_quality/REQ-14
