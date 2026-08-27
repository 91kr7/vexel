---
id: contexts-list-spawns-subprocesses
area: server
severity: low
cost: at-rest
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# The contexts list spawns two processes every 15 seconds

**What** → `listContexts` runs `docker context ls`, then `docker context inspect` over every name
returned, to discover TLS material. It is mounted in the shell.

**Where** → `server/src/contexts/contexts-service.ts:59` (`context ls`), `:163`
(`context inspect`, via `readTlsMaterial`).

**Evidence** → 9 ms each, 8 spawns a minute. Small next to the rest, and listed for completeness:
it is one of the four things that launch programs while the application sits idle.

**Why it matters** → contexts change when the operator changes them, or rarely from outside. A
15-second clock is far shorter than the rate at which the answer can differ.

**Direction** → covered by [[no-server-side-sampling-or-dedup]], with a long cadence and an
immediate re-read after the application's own context mutations.
