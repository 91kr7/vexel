---
request_slug: test_coverage_code_quality
date: 2026-09-03
type: new
size: ordinary
reference: none
---

# Test coverage and code quality measurement

## Request

> need to install an opentool software in order to verify the doverage and the quality of the tests.
> I want to install also a tool to get the score of quality of the code (sonar opensource???)

## Summary

Add open-source tools that measure three things on this repository: how much of the code the tests
execute, whether those tests would actually catch a defect, and how good the code itself is. Each
one runs from a command and prints a report.

## Business goal

The human does not write this code. It is produced batch by batch by AI agents, and the tests are
written by the same process. So "the tests pass" is not an outside opinion on the work.

These measurements give one. They answer two questions the human cannot answer today: where the
tests are thin, and which files carry the most risk. The value is direction — choosing what the next
cycles work on from a measurement, not from memory.

## Requirements

Functional:

- Report test coverage for both workspaces, as a figure per workspace and a figure per file.
- Include in that coverage what the daemon-backed suite and the browser-driven suite execute, not
  only the unit tests.
- Report a mutation score for the unit trees: which deliberate changes to the code no test caught.
- Report code quality per file: duplication, complexity, oversized files and functions, and rule
  violations.
- Run each of the three measurements from its own command in the repository.
- Print a readable summary in the terminal, and write a report file per run so two runs can be
  compared later.
- Leave nothing running when a measurement ends.

Non-functional:

- Every tool is open source and free for private use, and is installed as a dependency of this
  repository.
- No measurement slows the normal test pass: coverage runs under its own command.
- Mutation testing never launches the daemon-backed or the browser-driven suite.
- No measurement needs a container on the local Docker daemon.
- Report files are written where git ignores them.
- A deliberate rule of this project is never reported as a defect.

## Assumptions

- The measurements run on the human's machine, on demand. The request asks to install tools and
  names no pipeline.
- Nothing blocks `npm run lint` or `npm run test` in this first delivery. A limit can only be set
  once a baseline exists.
- Both workspaces are in scope. The request names the project, not one part of it.
- Generated output, the UI mockups and configuration files are excluded from the score. Nobody wrote
  them by hand.
- The existing lint checks stay as they are. The new tools are added beside them, not in place of
  them.
- What the reports find and is worth fixing later becomes an entry in `.sdd/tech-debt/`, per the
  knowledge base. The reports themselves are not a work order.

## Constraints

- Command-line tools only. No always-on server, no database, no web page, no history over time.
  Decision of the human, 2026-09-03.
- No tool may run as a container on the local Docker daemon. Every daemon-backed test file empties
  that daemon before it runs, so such a container would be destroyed during a pass.
- Mutation testing is limited to the unit trees. Decision of the human, 2026-09-03. A full
  browser-driven pass takes over 13 minutes, and mutation testing repeats a suite many times.
- The tools must cover a TypeScript ESM monorepo with two workspaces, from the repository root.

## Market trends

- The free self-hosted Sonar product is **SonarQube Community Build**, under LGPL v3. It needs a
  server process, a database and about 4 GB of RAM. That is why it is excluded here.
- In 2026 the usual open-source substitute is not one product but a set of command-line tools: a
  linter for rules, a separate duplication check, a separate complexity report. No free single tool
  replaces the Sonar dashboard.
- Measuring coverage of a browser-driven suite is now standard: the browser's own coverage data is
  collected and merged with the coverage of the other suites into one report.
- For TypeScript, mutation testing means **Stryker**. Published guidance agrees on how to use it:
  on selected fast tests, on demand, never across a whole slow suite.

## Risks

- A coverage percentage gets read as proof the tests are good. It only says which lines ran. This
  project has already shipped a defect that its own coverage ran straight over.
- The unit trees mock the Docker calls. A good mutation score there says nothing about the real
  behaviour against a daemon.
- The first run on a codebase never measured produces a long list of findings. A list nobody acts on
  makes the tool look wrong instead of the code.
- A generic quality tool reports some of this project's deliberate rules as defects. If that noise
  is not silenced, the report stops being read.
- Coverage of the end-to-end suite depends on the build output and can silently fall to zero. A
  number that quietly stops being true is worse than no number.

## Scope

Inside:

- Coverage for client and server, covering the unit, daemon-backed and end-to-end suites.
- A mutation score on the unit trees, run by hand.
- A code quality report on the hand-written source of both workspaces.
- One command per measurement, and a report file per run.

Outside:

- Any always-on server, database or web dashboard.
- Integration with a CI pipeline.
- Fixing what the reports find. This delivery measures and records.
- Any threshold that blocks lint or test.
- Security, dependency and secret scanning.
- Changing the existing tests or the existing lint checks.

## Sources

- https://docs.sonarsource.com/sonarqube-community-build/setup-and-upgrade/installation-requirements/server-host/
- https://docs.sonarsource.com/sonarqube-community-build/setup-and-upgrade/installation-requirements/database-requirements/
- https://codeant.ai/blogs/free-open-source-sonarqube-alternatives
- https://qaskills.sh/blog/mutation-testing-stryker-guide-2026
- https://www.npmjs.com/package/monocart-coverage-reports
