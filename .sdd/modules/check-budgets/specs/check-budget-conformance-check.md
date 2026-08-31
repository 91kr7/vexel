---
module: check-budgets
component: Check-budget conformance check
type: build check
---

# Check-budget conformance check

**Purpose** → keeps one rule true: **a test declares a budget that covers what its steps spend.**
The part a machine can decide from the source alone is that no step is allowed more patience than the
test that runs it, and that is what this guard refuses. A step that cannot reach its own ceiling can
never print its own failure message: the test dies somewhere else, on a message that says nothing
about what was actually slow.

## Contract

- runs as a Node script, invoked by the client workspace's `lint` and `test` commands and on its own
  as `npm run lint:check-budgets -w client`
  - first argument → the tree to scan; default `client/e2e/`
  - second argument → the Playwright configuration to read the default budget from; default
    `client/playwright.config.ts`
  - no violation → exit code `0`, one line on stdout with the number of tests checked and the default
    budget they were checked against
  - one or more violations → exit code `1`, and on stderr one line per violation followed by their
    count and what to do about it
- every violation names the file and the line of the step, the step's budget, the test's budget, and
  the test — its title and the line it starts on. When the step is written in a helper of the same
  file, it names that helper as well.
- the default test budget is read from the configuration and never assumed:
  - the configuration cannot be read → exit code `1`, naming the file
  - it declares no `DEFAULT_TEST_BUDGET_MS` → exit code `1`, naming the file and the constant
  - it declares the constant but does not use it as its `timeout` → exit code `1`, because the
    constant would then not be the budget the tests actually get
- a `test` call whose arguments the guard cannot read to their end → exit code `1`, naming the file
  and the line. A test it has not read is a test it has not checked, and that is said out loud rather
  than passed over.

### What a test's budget is

The first of these that exists, innermost first: `test.setTimeout(...)` inside the test; a
`test.setTimeout(...)` in a hook of an enclosing scope; `test.describe.configure({ timeout })` on an
enclosing describe; the same at file level; the default read from the configuration. Several
declarations in one scope → the largest.

### What is in a test's reach

- the step budgets written in the test's own body;
- those written in the `beforeEach` / `afterEach` hooks of the scopes around it, which share the
  test's budget;
- those written in the functions of **the same file** that any of the above calls, and in the
  functions those call in turn.

A step budget is any `timeout:` option whose value is a number, or a name bound to a number by a
`const` of the same file.

## Rules and invariants

- **Strictly greater is a violation; equal is not.** Equal is a lie too — a test cannot spend its
  whole budget on one step and still do anything else — but `openApp` declares exactly the default,
  so `>=` would refuse every test in the suite at once for one helper nobody has measured. The rule
  stays uniform and the borderline is stated here rather than hidden in an allow-list. It is on the
  tech-debt register as `open-app-retries-for-a-whole-test-budget`.
- **There is no allow-list and no exception marker.** Unlike the other build checks of this
  repository, this one has no way out: a budget that cannot be met is repaired, never exempted. The
  arithmetic beside the number is what a reader checks it by.
- **It does not add budgets up.** A test whose steps sum to more than it has still passes. Summing
  would mean deciding which worst cases can occur in one run, which the guard cannot know: it would
  refuse correct code, and a guard that refuses correct code is worked around rather than read.
- **It resolves helpers within one file, not across files.** A budget declared in `client/e2e/support/`
  is not attributed to its callers. The guard under-reports rather than reports wrongly.
- **It counts every numeric `timeout:` option, whatever API it belongs to.** A `docker build` allowed
  300 s is a patience the test must be able to spend, exactly as a locator's is. Telling one API from
  another is neither possible here nor needed.
- **What it cannot resolve on the file's own text, it skips**: a budget held in a parameter or
  computed at run time, a function body that is an expression rather than a block, a `beforeAll` /
  `afterAll` hook, whose timeout is its own and not the test's. Every one of these is a silence, never
  a guess.
- It reads text and needs no parser: comments and the contents of string, template and
  regular-expression literals take no part, so a budget merely quoted in a comment is not counted and
  a bracket inside a regular expression does not make a declaration look unclosed.
- The tree to scan is an argument so that the check driving this guard can point it at sources
  written for it, outside `client/e2e/`, where Playwright would otherwise run them.

## Dependencies

- `client/playwright.config.ts` — the source of the default test budget.

## Requirements served

- plan-docker_management_app-containers_card_view/REQ-69
- plan-docker_management_app-containers_card_view/REQ-70
- plan-docker_management_app-containers_card_view/REQ-71
