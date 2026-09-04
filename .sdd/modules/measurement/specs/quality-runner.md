---
module: measurement
component: Quality runner
type: repository command
---

# Quality runner

**Purpose** → `npm run quality`: reports the quality of the hand-written code of both workspaces,
file by file — duplication, complexity, oversized files and functions, and rule violations.

## Contract

- `npm run quality`, from the repository root, and nothing else runs it: `lint`, `test`, `coverage`,
  `mutation`, `start`, `build` and `serve` neither call it nor are called by it. It takes no
  argument.
- It runs **two passes over the same files**, both scoped by the *Quality scope list*:
  - the rule pass — ESLint through the *Quality rule configuration* — for the rules, the cognitive
    complexity of every function, and the files and functions above their size limit
  - the duplication pass — `jscpd` through the *Quality duplication configuration* — for the repeated
    blocks
  - each writes what it found under `.quality/`, which the run empties before it starts
- It then drops every finding the *Quality exclusion list* silences, and merges what is left into one
  figure per file: lines, duplicated lines, clones, the cognitive complexity of its heaviest
  function, its functions above the size limit, its rule findings.
- It prints, in the terminal: the moment, the duration, and one line per workspace plus one for both
  — files, duplicated share, functions above the complexity limit, files and functions above a size
  limit, rule findings — then the path of the report file.
- It writes that report through the *Report store*, under `reports/quality/`: the same figures per
  workspace, one row per measured file, then every repeated block longest first, the functions above
  the complexity limit, the files and the functions above their size limit, the rule findings grouped
  by rule, and last what the run left out and why.
- It exits non-zero **only** when a pass did not complete — the tool failed, or wrote no report it
  could read — naming the pass. It never fails on what it found.

## Rules and invariants

- **No finding fails this command.** ESLint exits non-zero as soon as it has anything to say, which
  is the normal outcome here: only a fatal exit or an unreadable report means a pass did not run.
  This measurement has no threshold and blocks nothing.
- **A duplicated block is counted in both files it appears in**, so a file's duplicated lines are the
  lines of that file some other block repeats — never a share of the pair.
- **`npm run lint` and `npm run test` are untouched.** ESLint is a tool of this report alone: it
  never reads the repository's other configuration, and the client keeps being linted by oxlint.
- **Nothing survives the run**: two child processes that both exit, no server, no watcher, no
  browser, and nothing on the Docker daemon — this measurement never reaches one. `.quality/` and
  `reports/` are git-ignored, and no source file is touched.
- It runs no test, no build and no suite: it reads the sources as text, and takes seconds.

## Dependencies

- *Quality scope list*, *Quality rule configuration*, *Quality duplication configuration*, *Quality
  exclusion list* (same module).
- *Report store* (same module) — where the report file goes.
- `eslint` with `eslint-plugin-sonarjs` and `typescript-eslint`, `jscpd`.

## Requirements served

- plan-test_coverage_code_quality/REQ-8
- plan-test_coverage_code_quality/REQ-9
- plan-test_coverage_code_quality/REQ-10
- plan-test_coverage_code_quality/REQ-11
- plan-test_coverage_code_quality/REQ-12
- plan-test_coverage_code_quality/REQ-13
- plan-test_coverage_code_quality/REQ-15
- plan-test_coverage_code_quality/REQ-16
- plan-test_coverage_code_quality/REQ-17
