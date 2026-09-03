---
slug: test_coverage_code_quality
date: 2026-09-03
spec: .sdd/analysis/test_coverage_code_quality.md
status: validated
---

# Batches — Test coverage and code quality measurement

Requirements: [`requirements.md`](requirements.md). Ids cited, never copied.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · coverage | F1 — Test coverage | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-18 | — | todo | The human sees how much of the code the tests execute, per workspace and per file |
| 2 · mutation-score | F2 — Mutation score | REQ-6, REQ-7, REQ-14 | 1 | todo | The human sees which deliberate changes to the code no test caught |
| 3 · quality-report | F3 — Code quality report | REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-15, REQ-16, REQ-17 | 1 | todo | The human sees duplication, complexity, oversized code and rule violations per file |

Execution order: 1 → 2 → 3. Batches 2 and 3 both depend on batch 1, and on one thing only: the
report store built there, which every measurement writes its report file through. They do not depend
on each other, so their order can be swapped.

## What the repository says today

Read while planning, and load-bearing for the cut below:

- The repository root already holds a `scripts/` directory with two checks
  (`check-swarm-absence-conformance.mjs`, `check-clean-daemon-conformance.mjs`), so a repository-level
  script is an existing shape, not a new one.
- **Four suites** carry the coverage of REQ-1 to REQ-4: `client/test/unit` (vitest),
  `server/test/unit` and `server/test/api` (`node --test`), and `client/e2e` (Playwright). Three of
  them run on Node, one runs in a browser.
- The daemon-backed pass is followed by a sweep (`npm run test:sweep -w server`) and the Playwright
  run stops the run's registry in its `globalTeardown`. Both are what REQ-15 relies on: the coverage
  command must keep them, not replace them.
- The Playwright web server runs the root `npm start`, so the server code the browser drives is the
  **built** server (`server/dist`), not the sources. Mapping its coverage back to `server/src` needs
  source maps from the build.
- **The server process handles no stop signal.** There is no `SIGTERM` or `SIGINT` handler anywhere
  in `server/src`. V8 writes its coverage when the process exits normally, so a server killed by a
  signal writes nothing. This is the reason for decision D3.
- The client is linted by `oxlint`, not by ESLint. The quality report brings ESLint in as a tool of
  its own, beside `oxlint` and never in front of it (REQ-17).

## Decisions

- **D1 — The tools, as the human approved them on 2026-09-03.** Coverage: Node's own V8 coverage from
  every suite, merged by `monocart-coverage-reports`. Mutation: **Stryker**. Quality: **ESLint** with
  `eslint-plugin-sonarjs` for rules, complexity and size, plus **`jscpd`** for duplication. All are
  open source, free for private use, and installed as dependencies of this repository (REQ-12).
- **D2 — Every measurement is off unless its own command turns it on.** The coverage wiring inside
  `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` and the e2e fixtures is read from one
  environment variable that only the coverage command sets. With the variable unset, every file
  behaves exactly as it does today, which is what keeps REQ-17 true.
- **D3 — The coverage run starts the built server through an entry of its own.** The product has no
  stop-signal handler, so a server killed at the end of the Playwright run would write no coverage.
  The coverage entry starts the same built server and writes its coverage before exiting. **The
  product source is not changed**: adding a signal handler to `server/src/index.ts` is a change to
  the product that this spec does not ask for.
- **D4 — Reports live in `reports/<measurement>/`**, one file per run, named with the run's date and
  time. The directory is git-ignored. One shared report store writes them and keeps the ten most
  recent files of each measurement (REQ-18, the human's addition of 2026-09-03).
- **D5 — Stryker runs the server unit tests through its command runner.** Stryker has runners for
  vitest but none for `node --test`, so the client unit tree is mutated through the vitest runner and
  the server unit tree by running `npm run test:unit -w server` as a command. The command runner
  cannot select the tests per mutant, so the server pass is the slower of the two. It is the only way
  to mutate that tree without changing the tests, which the spec puts out of scope.
- **D6 — The quality exclusion list is written from the first raw run**, as the human decided on
  2026-09-03. The command is run once with no exclusion, and the list is built from what it actually
  reported, each entry naming the project rule it protects (REQ-10). Nothing is silenced in advance
  from `CLAUDE.md`.
- **D7 — The reports are not a work order.** What the first runs find is not fixed here: the spec puts
  that out of scope. Anything worth fixing becomes an entry in `.sdd/tech-debt/`, per the knowledge
  base entry `technical-debt-goes-in-the-tech-debt-register`.
- **D8 — The new components belong to a new module.** They are repository tooling, not product code,
  and none of the existing modules covers measurement. The one exception is the root command surface:
  the three new scripts are rows of `package.json` (repository root, `scripts`), which the
  `server-app` module already owns.

## Departures from the spec

- **None.** The human's answers of 2026-09-03 (both halves of the e2e coverage, the command names,
  the report location, the tool set, the raw first pass, the failing empty-suite check) all stay
  inside what the spec asks for. The retention rule (REQ-18) is an addition, not a contradiction: the
  spec asks for a report file per run and says nothing about how many are kept.

## Correction made after validation

REQ-16 was reworded after the requirements were validated, because its first wording forbade
something the spec never forbade. It said no measurement may need or create a container on the local
Docker daemon. Read literally, that forbade the coverage command from running the daemon-backed and
browser-driven suites, whose fixtures are containers. What the spec forbids is a **tool** running as
a container. The wording now says that. No id changed and no other requirement moved.

## Coverage check

- **Every REQ is served by at least one INT.**
  REQ-1 → batch 1 INT-3, INT-4, INT-5;
  REQ-2 → batch 1 INT-4;
  REQ-3 → batch 1 INT-5, INT-7, INT-8, INT-9, INT-10;
  REQ-4 → batch 1 INT-5;
  REQ-5 → batch 1 INT-6;
  REQ-6 → batch 2 INT-1, INT-2, INT-3;
  REQ-7 → batch 2 INT-2, INT-3;
  REQ-8 → batch 3 INT-1, INT-2, INT-3;
  REQ-9 → batch 3 INT-4;
  REQ-10 → batch 3 INT-5;
  REQ-11 → batch 1 INT-11, batch 2 INT-5, batch 3 INT-6;
  REQ-12 → batch 1 INT-11, batch 2 INT-5, batch 3 INT-6;
  REQ-13 → batch 1 INT-1, INT-6, batch 2 INT-1, batch 3 INT-1;
  REQ-14 → batch 1 INT-1, INT-2, batch 2 INT-4;
  REQ-15 → batch 1 INT-4, batch 2 INT-1, batch 3 INT-1;
  REQ-16 → batch 1 INT-4, batch 2 INT-3, batch 3 INT-1;
  REQ-17 → batch 1 INT-3, INT-7, INT-8, INT-9, INT-11, batch 2 INT-5, batch 3 INT-6;
  REQ-18 → batch 1 INT-1.
- **Every INT serves at least one REQ.** No enabling intervention without a requirement: the report
  store (batch 1 INT-1) is shared by the three measurements and serves REQ-13, REQ-14 and REQ-18 on
  its own.
- **REQs completed across several batches**, and where each closes:
  - **REQ-11, REQ-12, REQ-13, REQ-15, REQ-16, REQ-17** — every batch adds its own command, its own
    dependencies, its own report and its own teardown, and every batch leaves `npm run lint` and
    `npm run test` untouched. They **close in batch 3**, when the third command lands.
  - **REQ-14** — the ignored location and its `.gitignore` entry arrive in batch 1; batch 2 adds the
    mutation tool's own working directory to that entry, which is the last thing a measurement writes
    outside `reports/`. It **closes in batch 2**.
  - **REQ-18** — the retention rule is one behaviour of the shared report store and **closes in
    batch 1**. Batches 2 and 3 write through that same store and add nothing to it.
  - Every other REQ closes in the single batch listed in the table.
