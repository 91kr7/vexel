---
module: measurement
component: Quality rule configuration
type: configuration
---

# Quality rule configuration

**Purpose** → the ESLint configuration of the quality report and of nothing else: which rules are
read, and the three limits the report applies.

## Contract

- Default export → an ESLint flat configuration, passed to ESLint by the *Quality runner* alone.
  - the files it covers are the *Quality scope list*'s, and the files it ignores are that list's too
  - the parser is `typescript-eslint`'s, with JSX enabled, and no type information is asked for
  - the rules are `eslint-plugin-sonarjs`'s recommended set, plus the two size rules below
- `limits` → the three limits the report applies, in one place:
  - `cognitiveComplexity` → 15 per function
  - `fileLines` → 400 per file
  - `functionLines` → 80 per function
- `sonarjs/cognitive-complexity` is configured at **zero**, so every function reports its own figure
  and the report can state a file's complexity rather than only its excesses. The limit of 15 is
  applied by the report, from `limits`.
- `max-lines` and `max-lines-per-function` are configured at their limits, blank lines and comments
  not counted: for size, only the excesses are of interest.

## Rules and invariants

- **Nothing but the quality report reads this configuration.** It is not named `eslint.config.js`,
  it sits under `scripts/measurement/`, and the runner passes it with the config lookup switched off,
  so no editor and no other command can pick it up by accident.
- **The client is still linted by oxlint.** ESLint arrives with this report as a tool of its own,
  beside oxlint and never in front of it: `npm run lint` runs the same steps it always did.
- **No severity here fails anything.** The runner never reads ESLint's exit code as a verdict on the
  code: this measurement has no threshold.
- Type-aware rules are not enabled: the pass reads no `tsconfig.json` and takes seconds, and the
  types are checked by the two builds and the two typecheck passes already.

## Dependencies

- *Quality scope list* (same module) — the files it covers.
- `eslint`, `typescript-eslint`, `eslint-plugin-sonarjs`.

## Requirements served

- plan-test_coverage_code_quality/REQ-8
- plan-test_coverage_code_quality/REQ-17
