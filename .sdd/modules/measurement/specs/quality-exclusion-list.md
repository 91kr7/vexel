---
module: measurement
component: Quality exclusion list
type: configuration
---

# Quality exclusion list

**Purpose** → the findings the quality report does not make, because each of them reports a rule this
project decided on purpose.

## Contract

- `exclusions` → the list, one entry per silenced rule:
  - `rule` → the rule id the finding carries
  - `paths` → the files, or the directory, the entry covers
  - `reason` → the rule of this project the entry protects, in one sentence
- `excludedBy(finding) → entry | undefined` → the entry that silences a finding: the one whose rule
  is the finding's and whose paths hold the finding's file. `undefined` when nothing silences it.

## Rules and invariants

- **The list was written from a run, never from a document.** The command was first run with the list
  empty, and each entry answers a finding that run actually made. Nothing was silenced in advance
  from `CLAUDE.md` or from `.archi`.
- **An entry is as narrow as the finding it answers**: a rule id and the files it was reported in. The
  same rule elsewhere in the codebase is still reported, and a file that moves gets its finding back
  — which is the finding being judged again, not a defect.
- **A silenced finding is still shown, as a silence.** Every entry appears in the report with how
  many findings it removed from that run and the rule it protects, so no exclusion is invisible.
- Only the rule pass has exclusions. The duplication pass reported nothing that a rule of this
  project asked for, so it has none, and the report says so.
- **What it silences is a decision, not a defect being hidden.** The entries of this list cover: the
  client's oxlint disable directives, which ESLint cannot resolve; the operator's own `docker` and
  `ssh` resolved from PATH; a placeholder base used to parse the path of an upgrade request; a
  content digest of a layer entry; the id of a console entry and of a toast; and example subnets in
  the placeholder text of a form. Everything else the run reported stands, the genuine findings
  included.

## Dependencies

- None. It is read by the *Quality runner*.

## Requirements served

- plan-test_coverage_code_quality/REQ-10
