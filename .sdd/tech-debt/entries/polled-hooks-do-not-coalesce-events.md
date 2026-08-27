---
id: polled-hooks-do-not-coalesce-events
area: client
severity: high
cost: under-load
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# The twelve polled views re-read once per event, with no grouping

**What** → every clock-driven hook also subscribes to daemon events and calls `refresh()` directly,
once per event. Events do not arrive alone, so a burst becomes a burst of re-reads — each one paying
the full server-side fan-out.

**Where** → `client/src/data/use-containers.ts`, `use-images.ts`, `use-volumes.ts`,
`use-networks.ts`, `use-compose-projects.ts`, `use-plugins.ts` — same shape in each.

**Evidence** → measured on a real container lifecycle (created, started, stopped, removed): the
daemon emitted **9 events** — create, net:connect, start, kill, kill, die, stop, net:disconnect,
destroy. That is 7 container-list re-reads and 2 network-list re-reads, **11 extra Engine calls
inside one second**, on top of the poll that keeps running. A `compose up` with five services emits
roughly forty-five.

**Why it matters** → the grouping already exists, and is written in the two views that need it
least. `use-disk-usage.ts:16` and `use-system-overview.ts:16` both wait 750 ms, with comments
explaining exactly this case: *"a prune emits one event per removed object: they are coalesced into
a single re-read"*, *"a burst of events — a compose up, a prune — is coalesced into a single
re-read"*. The polled views have nothing, presumably because a 3-second poll made one extra re-read
look irrelevant — which is precisely the case where it is not.

**Direction** → reuse the existing 750 ms coalescing, or fold it into
[[no-server-side-sampling-or-dedup]], where a burst becomes one dirty flag and one pass.
