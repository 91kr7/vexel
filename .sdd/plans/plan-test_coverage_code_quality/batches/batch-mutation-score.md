---
batch: 2 · mutation-score
feature: F2 — Mutation score
closed_req: REQ-6, REQ-7, REQ-14
depends: 1
---

# Batch 2 — Mutation score

One command, `npm run mutation`, changes the code on purpose and reports which of those changes no
test caught. It runs on the unit trees only: `client/test/unit` and `server/test/unit`. Requirements
are cited by id and live in [`../requirements.md`](../requirements.md).

The tool is Stryker (decision D1 of [`../batches.md`](../batches.md)). The client unit tree is
mutated through Stryker's vitest runner; the server unit tree through its command runner, which runs
`npm run test:unit -w server` (decision D5).

Depends on batch 1 for the **report store**, which this command writes its report file through.

## What this batch builds

- **Mutation runner** — the script behind `npm run mutation`: it runs Stryker over both unit trees,
  prints the score per workspace and writes one report for the run.
- **Client mutation configuration** — what Stryker changes in `client/src` and which tests it runs.
- **Server mutation configuration** — what Stryker changes in `server/src` and which tests it runs.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | repository-root tooling (`scripts/`), measurement area | **Mutation runner.** Run the two mutation passes, print a score per workspace, write one report for the run through the report store, and leave no process behind. | REQ-6, REQ-13, REQ-15, REQ-16 | INT-2, INT-3 |
| INT-2 | create | client workspace | **Client mutation configuration.** Mutate `client/src`, run the client unit tests through the vitest runner, and report per file the changes no test caught. | REQ-6, REQ-7 | — |
| INT-3 | create | server workspace | **Server mutation configuration.** Mutate `server/src`, run `npm run test:unit -w server` as the test command, and never the daemon-backed pass. | REQ-6, REQ-7, REQ-16 | — |
| INT-4 | modify | `.gitignore` (repository root) | Ignore the working directory the mutation tool creates while it runs. | REQ-14 | — |
| INT-5 | modify | `package.json` (repository root, `scripts`) | Add the `mutation` script and the mutation dependencies. `lint`, `test` and the existing scripts are untouched. | REQ-11, REQ-12, REQ-17 | INT-1 |

## Human acceptance

### Scenario: The human sees which deliberate changes no test caught

- REQ → REQ-6, REQ-13
- Given → the repository is installed
- When → the human runs `npm run mutation` at the repository root
- Then → the terminal prints a mutation score for the client and one for the server, and a report
  file for that run appears under `reports/mutation/`
- And → the report names, file by file, the changes that no test caught

### Scenario: The measurement needs no Docker daemon

- REQ → REQ-7, REQ-16
- Given → the Docker daemon is stopped
- When → the human runs `npm run mutation`
- Then → the command completes and prints its scores, without starting the daemon-backed suite or a
  browser

### Scenario: The run leaves the repository clean

- REQ → REQ-14, REQ-15
- Given → a mutation run has just finished
- When → the human runs `git status` and looks at their running processes
- Then → git reports no change, and no process of the run is left

### Scenario: The normal passes are unchanged

- REQ → REQ-11, REQ-12, REQ-17
- Given → the mutation command has been added
- When → the human runs `npm run lint` and then `npm run test`
- Then → both run the same steps as before and give the same result
- And → running `npm run mutation` runs no coverage and no quality report
