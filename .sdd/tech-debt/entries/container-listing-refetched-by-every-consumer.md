---
id: container-listing-refetched-by-every-consumer
area: server
severity: medium
cost: at-rest
date: 2026-08-27, revised 2026-08-29
source: study .sdd/analysis/studies/refresh-and-polling.html; revised against .sdd/analysis/studies/duplicate-docker-calls.html and the Docker call log
status: open
---

# Every consumer of the container listing fetches it again for itself

**What** → the container listing is read by four services that each reach the Engine on their own,
plus a fifth that reads a narrower form of it. They do not share a read, and the value the refresh
cache holds cannot serve them.

**Where** →

| Caller | Query | On what schedule |
|---|---|---|
| the container listing itself — the refresh cache's own read (`containers-service.ts:185`, kind at `:202`) | `/containers/json?all=true` | 20 s, and on every `container` event |
| the volumes list, `readMountedBy` (`volumes-service.ts:75`, kind at `:130`) | `/containers/json?all=true` | 30 s, and on every `volume` or `container` event |
| the networks list, `readAttachedContainers` (`networks-service.ts:65`, kind at `:116`) | `/containers/json?all=true` | 30 s, and on every `network` or `container` event |
| the dashboard overview (`overview-service.ts:63`) | `/containers/json?all=true`, by calling `listContainers()` — the raw read, not the cache | not periodic: on each daemon event that moves one of its numbers |
| the stats sampler, `sampleOnce` (`containers-service.ts:552`, period at `:176`) | `/containers/json` — running only, a different query | 10 s, while any client watches the sampled figures |

**Why the cache does not serve them** → this is the part that makes it a design decision rather than
a missed call. `containerListCache` holds `ContainerSummary[]`, and that projection carries id,
short id, name, image, state, status, ports and the sampler's figures. It carries **no `Mounts` and
no `NetworkSettings`** — precisely the two fields `readMountedBy` and `readAttachedContainers` exist
to read. The held value is not a smaller copy of the answer, it is a *different* answer, shaped for
one consumer. The others have no choice but to fetch the listing again.

Nor is there a way round it on the daemon's side: `GET /networks` does not populate its `Containers`
map — only the inspect of a single network does, which is why `raw.Containers` is used at
`networks-service.ts:126` and ignored in the list path — and `GET /volumes` reports no mount
information at all. Deriving both from the container listing is the only route the Engine API
offers. The defect is not the derivation; it is that each service derives it alone.

**Evidence** → from the Docker call log, over eleven minutes of ordinary use: **26 same-burst
duplicate reads**, up to four identical `/containers/json?all=true` inside the same millisecond, and
a largest burst of 34 calls in 94 ms. That shape is the one that matters — the copies are
simultaneous, not spread out.

The steady-state arithmetic, read off the declared periods above rather than measured: while all
three lists are being asked for, **seven `?all=true` a minute, four of them derivative**; the
sampler adds six `/containers/json` a minute on top while stats are watched. Every figure is
demand-gated, so a screen nobody is looking at contributes nothing.

**What has changed since this was first written** → the periods. This entry was recorded against the
pre-cache world, where all three polled at 3 s and the count was 60 calls a minute with 40
derivative. The refresh cache (`plan-docker_management_app-refresh_cache`) cut the rate by roughly an
order of magnitude; it did **not** touch the duplication, because it caches per kind and each kind
reads for itself. The count is smaller, the defect is the same one.

**Why it matters** → nothing unifies the callers because each reaches the Engine on its own. It is
the clearest illustration that the server caches **results and never calls**: above, a cache keyed by
kind to which each `read()` is opaque; below, a transport with no memory. Nothing in between reasons
about calls.

**Direction** → two roads, and they are not equivalent, which is why this stays a direction and not a
decision.

- **Widen what is held**, so one read feeds all four: the cache keeps the fields the other consumers
  need, and volumes, networks and the overview derive from it. Immediate and needs no new machinery,
  but the projection stops being "a container listing" and becomes the union of what every consumer
  wants, growing with each new one.
- **Coalesce identical calls in flight**, in the transport: two identical reads issued while one is
  out share its answer. Fixes all four without touching any of them, and covers the ones nobody has
  found yet — but it is a cache of *calls*, which this codebase has never had, and it would need a
  definition of "identical" that is safe for non-`GET` traffic.

**The two roads do not cover the same callers.** Coalescing catches the four that fire in the same
burst; it does nothing for the stats sampler, whose read is ten seconds out of phase with everyone
else's. Only reading from a held value helps there. Whichever road is taken, the sampler is a
separate decision — see [[no-server-side-sampling-or-dedup]].
