---
module: measurement
component: Server mutation configuration
type: configuration
---

# Server mutation configuration

**Purpose** → what the mutation run changes in the server, and which tests decide whether a change
was caught.

## Contract

- Changes every TypeScript source of `server/src`.
- Runs `npm run test:unit -w server` as the command that judges each change: no runner of the
  mutation tool drives `node --test`, so the unit script is run as it stands.
- The daemon-backed pass is never run, and neither is any other suite: the command is the unit one,
  and it mocks the Docker call.
- Because a command cannot be told which tests concern one change, **the whole server unit suite runs
  once per change**: 9 834 changes over 98 files, at about 81 s each. That is what makes this the
  long half of the measurement, and what the runner's area argument and the incremental file below
  exist for.
- Writes what it found to `.mutation/server.json`, and its working files to `.mutation/server-work/`,
  which it removes whether the pass succeeded or not.
- Keeps `.mutation/server-incremental.json` between runs, so a later run tests only the changes in
  code, or in tests, that moved since.

## Rules and invariants

- **The sources are changed where they live**, not in a copy, for the same reason as the client's:
  the unit tree and the script that runs it resolve paths against the workspace they sit in. The tool
  keeps the originals and puts them back when the pass ends.
- The unit script is used unmodified: what the mutation run measures is the suite the repository
  already runs.

## Dependencies

- *Mutation runner* (same module) — the only thing that runs it.
- `@stryker-mutator/core` — its command runner is what runs the unit script per change.

## Requirements served

- plan-test_coverage_code_quality/REQ-6
- plan-test_coverage_code_quality/REQ-7
- plan-test_coverage_code_quality/REQ-14
- plan-test_coverage_code_quality/REQ-16
