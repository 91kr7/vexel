---
id: detail-views-reread-on-unrelated-events
area: both
severity: high
cost: under-load
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# Detail views re-read on events that have nothing to do with the object shown

**What** → the request itself is correctly targeted — `fetchContainerInspect(id)` always asks for
the one object. What is not targeted is the **decision to re-issue it**: the subscription tests the
event's type and action, never which object the event concerns.

**Where** → `client/src/data/use-container-detail.ts:65` — re-reads on any `container` event.
`client/src/data/use-volume-inspect.ts:55` — re-reads on any `volume` **or `container`** event.
Same shape in `use-network-inspect.ts` and `use-image-inspect.ts`.

**Evidence** → looking at container A while container B starts and stops re-fetches A's inspect
seven times. The volume case is worse: a volume inspect costs three Engine calls including
`/system/df` (`server/src/volumes/volumes-service.ts` `getVolumeInspect`), so **with a volume detail
open, every container event triggers a `/system/df`** — dozens of them, at 73 ms each, during a
`compose up`.

**Why it matters** → container events are the most frequent events the daemon emits, and the volume
detail subscribes to all of them. This is the one place where an unrelated event pulls the most
expensive endpoint in the application.

**Blocked on** → the event does not carry a usable identifier. `server/src/events/event-stream-service.ts:138`
publishes `actor: raw.Actor?.Attributes?.name ?? raw.Actor?.ID` — the object's **name**, with the ID
only as a fallback, while the detail hooks hold an **id**. Matching on the name is fragile: it is
absent before the first load and `docker rename` changes it.

**Direction** → publish the actor's raw ID alongside the name in the event payload, then filter on
it. This also makes [[object-type-invalidation-registry-unused]] usable for what it was written for.

**Note** → the human's decision is that detail reads stay pull-based with no server-side cache.
This entry does not contest that: it is about which events justify a re-read, not about who asks.
