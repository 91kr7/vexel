---
id: polled-hooks-do-not-coalesce-events
area: client
severity: low
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

**Direction** → reuse the existing 750 ms coalescing in the polled hooks.

**Reduced on 2026-09-01, not closed.** This entry offered two directions and the second one shipped:
the refresh cache holds a value per kind and groups the events that dirty it, so a burst now costs
the daemon one pass however many re-reads the views ask for. What the measurement above counted is
therefore no longer paid, and the severity drops from high to low. What remains is what the title
says — the views still issue one request per event, now answered from a held value. The umbrella
entry this used to point at was removed when the refresh cache closed it.
