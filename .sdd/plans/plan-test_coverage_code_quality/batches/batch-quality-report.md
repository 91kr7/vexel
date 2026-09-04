---
batch: 3 · quality-report
feature: F3 — Code quality report
closed_req: REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-15, REQ-16, REQ-17
depends: 1
---

# Batch 3 — Quality report

One command, `npm run quality`, reports the quality of the hand-written code of both workspaces, per
file: duplication, complexity, oversized files and functions, and rule violations. Requirements are
cited by id and live in [`../requirements.md`](../requirements.md).

The tools are ESLint with `eslint-plugin-sonarjs` for the rules, the complexity and the size, and
`jscpd` for the duplication (decision D1 of [`../batches.md`](../batches.md)). This is the plan's
**quality report**; it is not `npm run lint`, which keeps its current checks and is never called by
this command.

Depends on batch 1 for the **report store**, which this command writes its report file through.

This batch also closes the requirements every measurement shares (REQ-11 to REQ-13, REQ-15 to
REQ-17): the third command is the last one to land. See the coverage check in
[`../batches.md`](../batches.md).

## What this batch builds

- **Quality runner** — the script behind `npm run quality`: it runs the rule pass and the duplication
  pass, merges them into one per-file report, prints the summary and writes the report.
- **Quality rule configuration** — the ESLint configuration this report uses, and only this report:
  the sonarjs rules, the complexity limit and the size limits.
- **Duplication configuration** — what `jscpd` scans and how small a repeated block still counts.
- **Scope list** — the one list of what is measured and what is left out, shared by both passes.
- **Exclusion list** — the findings that report a deliberate rule of this project, each with the rule
  it protects.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | repository-root tooling (`scripts/`), measurement area | **Quality runner.** Run both passes, merge them into one report ordered per file, print the summary, write the report through the report store, and leave no process behind. | REQ-8, REQ-13, REQ-15, REQ-16 | INT-2, INT-3, INT-4 |
| INT-2 | create | repository-root tooling (`scripts/`), measurement area | **Quality rule configuration.** The ESLint configuration of this report alone: the sonarjs rules, the complexity limit, the file and function size limits. | REQ-8 | INT-4 |
| INT-3 | create | repository-root tooling (`scripts/`), measurement area | **Duplication configuration.** What `jscpd` scans in both workspaces, and the smallest repeated block it reports. | REQ-8 | INT-4 |
| INT-4 | create | repository-root tooling (`scripts/`), measurement area | **Scope list.** The hand-written sources of both workspaces are measured. Build output, the UI mockups and the configuration files are left out. | REQ-9 | — |
| INT-5 | create | repository-root tooling (`scripts/`), measurement area | **Exclusion list.** Run the command once with no exclusion, then silence the findings that report a deliberate rule of this project, each entry naming the rule. | REQ-10 | INT-1 |
| INT-6 | modify | `package.json` (repository root, `scripts`) | Add the `quality` script and the quality dependencies. `lint`, `test` and the existing scripts are untouched, and `quality` calls neither. | REQ-11, REQ-12, REQ-17 | INT-1 |

## Human acceptance

### Scenario: The human sees the quality of the code, file by file

- REQ → REQ-8, REQ-13
- Given → the repository is installed
- When → the human runs `npm run quality` at the repository root
- Then → the terminal prints a summary, and a report file for that run appears under
  `reports/quality/`
- And → the report lists, per file, its duplication, its complexity, the files and functions above
  the size limit, and the rule violations

### Scenario: Only hand-written code is measured

- REQ → REQ-9
- Given → a quality run has just finished
- When → the human looks for the build output, the UI mockups or a configuration file in the report
- Then → none of them is there

### Scenario: A deliberate rule of the project is not reported as a defect

- REQ → REQ-10
- Given → the command has been run once with no exclusion, and the exclusion list was written from
  what it reported
- When → the human reads the next report
- Then → no finding reports a rule this project decided on purpose, and the exclusion list names each
  silenced rule and the reason it is silenced

### Scenario: The three measurements are three separate commands

- REQ → REQ-11, REQ-12, REQ-15, REQ-16, REQ-17
- Given → the three commands have been added
- When → the human runs `npm run quality`, then `npm run lint` and `npm run test`
- Then → the quality command runs no test and no coverage, leaves no process behind, and `lint` and
  `test` run the same steps as before with the same result
