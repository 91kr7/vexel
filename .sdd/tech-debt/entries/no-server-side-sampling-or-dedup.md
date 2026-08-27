---
id: no-server-side-sampling-or-dedup
area: server
severity: high
cost: architecture
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# No list route samples, caches or merges: N clients cost N times

**What** → every list route is a straight pass-through. No cache, no validity window, no merging of
simultaneous requests. The client's `setInterval` sets the rate at which the daemon is questioned,
and each open window pays in full.

**Where** → all list routes; the fan-out each one performs is recorded in the individual entries
above.

**Evidence** → at rest, one window, no heavy screen: 116 browser requests a minute become **212
Engine calls** plus **64 processes**. Two windows double it — nothing on the server unifies two
clients asking for the same list.

**Why it matters** → this is the umbrella most of the other entries sit under, and the only one that
addresses the multi-client multiplication. The model already exists in the codebase and is proven:
the container stats sampler is gated by a subscriber count, samples at its own cadence, and stops at
1→0 — `server/src/containers/stats-demand-registry.ts`, thirty lines, with the idempotent-release
lesson already learned and commented.

**Human's stated direction (27 Aug 2026)** → implement the remaining lists through that same
sampling mechanism. Detail reads stay pull-based with no server-side cache. Swarm is excluded: its
removal is already planned.

**Four conditions, without which it regresses instead of improving**

1. **Subscribing must deliver the current snapshot immediately**, and a 0→1 transition must sample
   at once rather than waiting a full interval — otherwise first paint becomes slower than today.
2. **The operator's own actions must force an immediate pass.** Stopping a container must change the
   row now, as it does today; trading responsiveness for cost would be a bad bargain.
3. **One sampler per resource, not a single pass for all.** Today a slow list delays only itself; a
   monolithic pass would let one wedged `/system/df` or `compose ls` freeze every list.
4. **Snapshots are invalidated on context switch**, or another daemon's objects show for an instant.
   `server/src/events/event-stream-service.ts` already does exactly this for its backlog.

**What it does not fix** → [[images-list-inspects-every-image]],
[[cli-version-detection-uncached]] and [[new-socket-per-engine-call]] are unaffected in kind: it
changes how often they are paid, not what they cost. They are cheaper to fix and should not wait
for this.
