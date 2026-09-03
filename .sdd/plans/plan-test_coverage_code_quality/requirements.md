---
slug: test_coverage_code_quality
date: 2026-09-03
spec: .sdd/analysis/test_coverage_code_quality.md
status: validated
---

# Requirements — Test coverage and code quality measurement

Three measurements are added to the repository. Each one runs from its own command and prints a
report. Nothing in the product changes.

Vocabulary used below, taken from the spec:

- **measurement** — one of the three: coverage, mutation score, quality report.
- **unit trees** — `server/test/unit` and `client/test/unit`, the tests that mock Docker and reach no
  daemon.
- **daemon-backed suite** — `server/test/api`, run against the real Docker daemon.
- **browser-driven suite** — `client/e2e`, run by Playwright.
- **report file** — the file a measurement writes on disk, beside the summary it prints.

This plan uses **quality report** for what the request calls "the Sonar score". The word `lint` is
already taken in this repository: it names the existing conformance checks, which this plan does not
touch.

## F1 — Test coverage

| ID | Requirement |
| --- | --- |
| REQ-1 | One command reports test coverage for the client workspace and for the server workspace: one figure per workspace and one figure per file. |
| REQ-2 | The coverage figures count what the daemon-backed suite executes, not only the unit tests. |
| REQ-3 | The coverage figures count what the browser-driven suite executes: the client code the browser runs, and the server code that suite drives. |
| REQ-4 | The coverage of every suite the command ran is merged into one report per workspace, so a file's figure counts every suite that executed it. |
| REQ-5 | When a suite the command ran contributed no coverage data, the command says so and fails, instead of reporting a lower figure. |

## F2 — Mutation score

| ID | Requirement |
| --- | --- |
| REQ-6 | One command reports a mutation score for the unit trees of both workspaces: the score, and per file the deliberate changes no test caught. |
| REQ-7 | The mutation command runs the unit tests only. It never starts the daemon-backed suite or the browser-driven suite. |

## F3 — Code quality report

| ID | Requirement |
| --- | --- |
| REQ-8 | One command reports code quality per file for both workspaces: duplication, complexity, files and functions above a size limit, and rule violations. |
| REQ-9 | The quality report covers hand-written source only. Build output, the UI mockups and configuration files are left out of it. |
| REQ-10 | A rule this project decided on purpose is not reported as a defect by the quality report. |

## F4 — Rules common to the three measurements

| ID | Requirement |
| --- | --- |
| REQ-11 | Each measurement runs from its own command at the repository root. Running one does not run another. |
| REQ-12 | Every tool used is open source, free for private use, and installed as a dependency of this repository. |
| REQ-13 | Each measurement prints a readable summary in the terminal and writes a report file for that run. A run does not overwrite the report file of an earlier run. |
| REQ-14 | Report files are written to a location git ignores. |
| REQ-15 | When a measurement ends it leaves nothing running: no server, no watcher, no browser. |
| REQ-16 | No measurement tool runs as a container on the local Docker daemon, and no measurement adds a container of its own to it. The containers the daemon-backed suite and the browser-driven suite create are their own and do not change. |
| REQ-17 | The existing `npm run lint` and `npm run test` keep the same steps, the same result and the same duration. |
| REQ-18 | A measurement keeps the ten most recent report files of its own measurement and removes the older ones. |

## Out of scope

Taken from the spec, listed so no requirement above is read as covering it:

- Any always-on server, database or web dashboard, and any history of the figures over time.
- Integration with a CI pipeline.
- Fixing what the reports find. What is worth fixing becomes an entry in `.sdd/tech-debt/`.
- Any threshold that blocks `npm run lint` or `npm run test`. REQ-5 is the one failure this plan
  adds, and it belongs to the coverage command alone.
- Security, dependency and secret scanning.
- Changing the existing tests or the existing conformance checks.
