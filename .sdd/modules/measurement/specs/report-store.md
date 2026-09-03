---
module: measurement
component: Report store
type: tooling module
---

# Report store

**Purpose** → the one place a measurement's report file is written: it decides where the file goes,
what it is named, and how many of them survive.

## Contract

- `writeReport(measurement, contents, { at, extension }) → path`
  - writes `contents` under `reports/<measurement>/`, creating the directory when it is not there
  - names the file `<measurement>-<YYYY-MM-DD>-<HHmmss>.<extension>`, from the run's own local date
    and time (`at`, the current moment by default) and `extension` (`md` by default)
  - removes every file of that directory beyond the ten most recent, most recent meaning last by
    name
  - returns the path of the file it wrote, relative to the repository root
- `repositoryRoot` → the absolute path of the repository root, for callers resolving paths of their
  own against it

## Rules and invariants

- A run never overwrites the report of an earlier run: the name carries the second the run started
  at, and no two runs of one measurement start in the same second.
- A call touches its own measurement's directory and nothing else: one measurement can neither read
  nor delete another's reports.
- What it writes is git-ignored (`reports/`): a report is the output of a run, never a source.

## Requirements served

- plan-test_coverage_code_quality/REQ-13
- plan-test_coverage_code_quality/REQ-14
- plan-test_coverage_code_quality/REQ-18
