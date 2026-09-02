---
module: check-budgets
component: Clean-daemon conformance check
type: build check
---

# Clean-daemon conformance check

**Purpose** → keeps one rule true: **every daemon-backed test file empties Docker before it runs.**
Both passes are serial and every file drives the same daemon, so a file that does not reset it
inherits whatever the file before it left standing — a container that outlived a failed assertion, an
image a build produced — and then fails later, somewhere else, and differently depending on which
files ran first. That is what a flake is, and it is invisible from the file that reports it.

**Why it lives in this module.** `check-budgets` is the only module whose subject is the checks of
this repository rather than the product: one rule every check follows, and the build-time guard
behind it. This is the second such rule — the state a check starts from, beside the patience it
declares. The other two guards of this repository sit in the module owning the product rule they
protect (`list-order`, `coverage`); no module owns the test lifecycle, and opening one for a single
component would say less than this does.

## Contract

- `node scripts/check-clean-daemon-conformance.mjs`, run from the repository root and wired into the
  root `npm run lint` and `npm run test` as `lint:clean-daemon` — the second check spanning both test
  trees, which is why it is the root's and not a workspace's
  - first argument → the end-to-end tree to scan; default `client/e2e/`, every `*.spec.ts` under it,
    recursively
  - no violation → exit code `0`, one line on stdout with the number of spec files checked and that
    the server pass preloads its reset
  - one or more violations → exit code `1`, and on stderr one line per violation followed by their
    count and what a conforming file looks like
- every violation names the file, and the line when there is one to name.

### What is refused

- **an end-to-end spec that does not call `cleanDaemonBeforeAll()` at its top level.** At the top
  level, so the call cannot sit inside a `describe` that runs after another one has already built its
  fixtures.
- **an end-to-end spec where any `test(...)`, `test.beforeAll(...)` or other `test.*` call comes
  before that one.** Hooks run in registration order, so a hook registered first would build its
  fixtures on a daemon the reset then prunes. Either half alone lets the failure back in, so both are
  checked; the violation names the line of each and why the order matters.
- **`test:api` in `server/package.json` no longer preloading `test/support/api-lifecycle.ts`**
  (`--import ./test/support/api-lifecycle.ts`). The server tree needs no per-file line — `node --test`
  gives every file a process of its own, so a preload cannot be forgotten by a file — so what is
  guarded there is the one thing that can be lost: the preload itself.

## Rules and invariants

- **There is no exception marker and no allow-list.** A file that must not reset the daemon does not
  exist; if one ever does, that is a decision written into this check where it can be read, not
  sprinkled at a call site where it becomes a formality.
- It reads text and needs no parser: comments and the contents of string, template and
  regular-expression literals are blanked with their newlines kept, so a call named in a comment
  counts for nothing, a `test(` inside a title is not mistaken for a declaration, and every line
  number reported is the file's own. A regular expression's own `.test(` is not read as a `test`
  call.
- **A file the check cannot find the call in is a failure, never a skip**: the first half is an
  absence, and an absence is exactly what it exists to catch.
- The tree to scan is the first argument so that the check driving this guard can point it at spec
  files written for it, outside `client/e2e/`, where Playwright would otherwise run them.
- It guards the wiring, not the reset itself: what `resetDaemon` removes and spares is the test
  lifecycle's own contract, and this says only that every file goes through it.

## Dependencies

- `client/e2e/support/lifecycle.ts` — declares `cleanDaemonBeforeAll()`, the registration this
  requires of every spec.
- `server/package.json` — the `test:api` script, read for its preload.

## Requirements served

- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-72
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-73
