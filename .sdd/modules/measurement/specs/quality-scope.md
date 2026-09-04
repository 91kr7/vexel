---
module: measurement
component: Quality scope list
type: configuration
---

# Quality scope list

**Purpose** → the one list of what the quality report measures, read by both of its passes so that
neither can measure a file the other does not.

## Contract

- `scopeRoots` → `client/src` and `server/src`, the hand-written sources of the two workspaces
- `scopeExtensions` → `ts` and `tsx`
- `scopeFiles` → the glob of every extension under every root, the form the rule pass takes
- `scopeIgnored` → `**/*.d.ts`, the form both passes take

## Rules and invariants

- **Only hand-written source is in.** Build output (`client/dist`, `server/dist`), the UI mockups of
  `.sdd/analysis/ui-mock/` and every configuration file live outside the two roots, so nothing has to
  name them to leave them out.
- **The test trees are out**: the quality report is about the code, and what the tests are worth is
  the subject of the other two measurements.
- Type declarations are ignored: they carry no logic to measure, and nobody wrote the build's.
- CSS and assets are out because they are not what either tool reads: the rule pass parses
  TypeScript, and the two passes read one list.

## Dependencies

- None. It is read by the *Quality rule configuration*, the *Quality duplication configuration* and
  the *Quality runner*.

## Requirements served

- plan-test_coverage_code_quality/REQ-9
