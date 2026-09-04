---
module: measurement
component: Quality duplication configuration
type: configuration
---

# Quality duplication configuration

**Purpose** → what the duplication pass scans, and how small a repeated block still counts as one.

## Contract

- `minimumTokens` → 50. A block repeated over fewer tokens than that is not reported.
- `duplicationArguments(outputDirectory)` → how `jscpd` is asked for it:
  - it scans the *Quality scope list*'s roots, extensions and ignored files, and nothing else
  - it reports **absolute** paths
  - it writes one JSON report into `outputDirectory` and prints nothing of its own
- `duplicationReportName` → the name `jscpd` gives that report, which the runner reads back.

## Rules and invariants

- **Absolute paths are not a detail.** A path relative to the scanned root cannot tell
  `client/src/builders` from `server/src/builders`, and both exist: with relative names two files of
  two workspaces merge into one row of the report.
- 50 tokens is the smallest block worth a row: below it every list of imports and every option
  object of the same shape is a finding, and the report stops being read.
- The pass reads the same files as the rule pass, from the same list. It cannot drift from it.

## Dependencies

- *Quality scope list* (same module) — the files it scans.
- `jscpd`.

## Requirements served

- plan-test_coverage_code_quality/REQ-8
