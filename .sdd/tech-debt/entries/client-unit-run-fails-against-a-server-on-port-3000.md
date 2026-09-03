---
id: client-unit-run-fails-against-a-server-on-port-3000
area: client
severity: medium
cost: correctness
date: 2026-09-04
source: development phase of plan-test_coverage_code_quality, batch mutation-score, while getting Stryker's initial run to pass
status: open
---

# The client unit run goes red when the application is running on port 3000

**What** → `npm run test:unit -w client` **exits 1 while every one of its tests passes**. All 194
files pass, all 2 918 tests pass, and the run then reports 94 unhandled errors and fails on them.
The unhandled errors are not raised by any assertion: they come from WebSocket connections the
component tests open, which succeed against whatever is listening on port 3000 and then fail in the
browser environment the tests run in.

    Test Files  194 passed (194)
         Tests  2918 passed (2918)
        Errors  94 errors
    TypeError: The "event" argument must be an instance of Event. Received an instance of Event

**Where** → the trigger is any process serving the application on port 3000 — a
`npm run dev:server`, an `npm run serve`, or a build left running after a manual session. The
failing path is `client/test/unit/*.test.tsx` rendering components that open a session socket; the
error is raised inside `undici`'s WebSocket implementation dispatching an `Event` of the Node realm
to a target of the jsdom realm (`node_modules/undici/lib/web/websocket/websocket.js`,
`#onConnectionEstablished`). The connection has to be **established** for it to happen, which is why
nothing listening means nothing failing.

**Evidence** → measured on 2026-09-04 on the development machine. A `node dist/index.js` had been
listening on 3000 for 2 h 17 m (`lsof -nP -iTCP -sTCP:LISTEN`). With it up: exit 1, 94 errors, every
test passing. `kill` on that one process, nothing else changed, same command: exit 0, no errors,
same 2 918 tests passing. Reproduced with the batch's own dependencies stashed and `npm ci` run from
the committed lock, so it is not an effect of anything that batch installed. The count varies with
the run (96 under a single-threaded pool), the outcome does not.

**Why it matters** → the red says nothing about the product, and it is red for a reason no message
in the output names: the summary shows 194 files passing and then fails, so the first reading is
that the suite is flaky. It is also **the one thing that can make a green suite fail on a developer's
machine and pass on a colleague's**, since it depends on what that machine happens to be running —
exactly the shared state the rest of this repository's tests are built to refuse. Mutation testing
meets it first, because Stryker reads any unhandled error in the initial run as a broken test run and
refuses to start at all, so the whole measurement fails on a stray server.

**Direction** → the tests should not reach a real socket at all. A component test that renders a
session view is not testing the transport, so the socket belongs behind the same kind of mock the
Docker call already has — one place in `client/test/setup.ts` or in the session client's own test
support, so that no test can open a connection to the machine it runs on, whatever is listening.
Making the run merely *tolerate* the errors is the thing to avoid: `dangerouslyIgnoreUnhandledErrors`
was tried during the batch and only hides them from the exit code, which would leave a component
holding a live connection to the developer's own application and nobody the wiser.
