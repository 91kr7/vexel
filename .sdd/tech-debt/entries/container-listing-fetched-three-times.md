---
id: container-listing-fetched-three-times
area: server
severity: medium
cost: at-rest
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# The same container listing is fetched three times per 3-second round

**What** → `/containers/json?all=true` is requested from three independent services in the same
tick: the container list itself, the volumes list (to learn which container mounts what) and the
networks list (to learn which container is attached). Same response, three transfers, three parses.

**Where** → `server/src/containers/containers-service.ts:184`,
`server/src/volumes/volumes-service.ts:71` (`readMountedBy`),
`server/src/networks/networks-service.ts:64` (`readAttachedContainers`).

**Evidence** → 60 calls a minute, of which **40 are purely derivative**.

**Why it matters** → nothing unifies them because each service reaches the Engine on its own. It is
the clearest illustration that the server is not the pass-through it looks like.

**Direction** → falls out for free under [[no-server-side-sampling-or-dedup]]: one pass reads the
containers once and feeds all three answers.
