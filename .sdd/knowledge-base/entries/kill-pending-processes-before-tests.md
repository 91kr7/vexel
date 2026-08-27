---
id: kill-pending-processes-before-tests
kind: how-to
scope: test
date: 2026-08-27
source: /sdd-dev, batch push-failure-reported
---

# Kill pending processes before launching the tests

**Rule** → Before launching any test suite, kill whatever processes are still pending — application
servers, dev servers, leftovers of an earlier run. **No exception for processes a human started**:
"non mi interessa se sono processi lanciati da un umano".

**Why** → The human found the machine full of npm processes and asked for this outright. What was
standing when they looked: three duplicate instances of the application from two days earlier, of
which only one held a port and the other two served nobody, plus a dev server from that morning.
They cost memory and CPU for nothing, and the suite starts the server it needs on its own anyway.

**How to apply** →
- *test* → the run begins by listing what is alive (`ps` for `npm run`/`node dist`/`vite`/
  `playwright`, `lsof -nP -iTCP -sTCP:LISTEN` for the ports) and killing it, before the first
  command of [[batch-closing-commands]] is typed. Do not stop to ask whose a process is.
- *test* → a run interrupted halfway leaves objects on the daemon too: sweep them
  (`npm run test:sweep -w server`) in the same preliminary step.
