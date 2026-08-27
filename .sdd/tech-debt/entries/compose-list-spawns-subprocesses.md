---
id: compose-list-spawns-subprocesses
area: server
severity: high
cost: at-rest
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# The Compose list spawns processes every 3 seconds

**What** → project discovery runs `docker compose ls` and then one `docker compose ps` per project
found. It is mounted in the shell, so it runs on every screen, at the shortest cadence in the
application.

**Where** → `server/src/compose/compose-discovery-service.ts:40` (`compose ls`), `:63`
(`compose ps`, per project).

**Evidence** → 39 ms per invocation measured on this machine — `compose` is a slow-loading CLI
plugin, against 9 ms for a bare `docker`. At 3 seconds that is 20 spawns a minute with no projects
at all, and 20 more per minute for every project that exists.

**Why it matters** → this, not the connection status, is the most frequent `fork`/`exec` in the
application — three times more frequent, with the slower binary. It was overlooked because the
connection-status probe is the one that looks like process work.

**Direction** → covered by [[no-server-side-sampling-or-dedup]]: one sampler, gated by demand,
shared by every client.
