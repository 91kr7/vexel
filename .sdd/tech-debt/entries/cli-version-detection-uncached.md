---
id: cli-version-detection-uncached
area: server
severity: medium
cost: at-rest
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# CLI availability is re-detected every 5 seconds by launching three programs

**What** → the connection status answers which CLIs are installed, and to know it runs
`docker --version`, `docker compose version` and `docker buildx version` in parallel — on every
call, with no cache, every 5 seconds.

**Where** → `server/src/docker/cli-runner.ts:33` (`detectCliAvailability`), called by
`getConnectionStatus`.

**Evidence** → 42 ms for the three in parallel, measured. 12 calls a minute is **2,160 processes an
hour** for three version strings.

**Why it matters** → which programs are installed cannot change while the application is running.
This is not a sampling-cadence question: it is a value that should be read once.

**Direction** → read once per process. The daemon-reachability half is separate and does need a live
signal — but the event stream is already one: while it is connected, the daemon answers. That would
remove most of what this poll exists for.
