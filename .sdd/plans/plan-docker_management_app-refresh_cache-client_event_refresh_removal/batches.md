---
slug: docker_management_app-refresh_cache-client_event_refresh_removal
date: 2026-09-01
spec: .sdd/analysis/docker_management_app-refresh_cache-client_event_refresh_removal.md
status: validated
---

# Batches — the client stops refreshing on Docker events

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| `batch-client-event-trigger-removal` | The client's Docker-event refresh trigger is removed | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15 | — | implemented | An open detail stops following the daemon on its own |

Execution order: one batch, nothing before it.

## Assumptions and decisions

- **One batch, not several.** The spec names a half-done demolition as worse than either end of it:
  some screens with two triggers and some with one is a state nobody designed. REQ-13 is also only
  true once every subscriber is gone, so it cannot be closed by a first batch of a series.
- **The perimeter was counted in the client, not assumed.** Thirteen places subscribe to the daemon
  event stream. Twelve subscribe in order to re-read and are removed; the thirteenth is the
  Dashboard's event-feed service and is untouched. The seven views that lose their only automatic
  trigger are exactly the seven the spec names: `use-system-overview`, `use-disk-usage`,
  `use-container-detail`, `use-image-inspect`, `use-image-layers`, `use-network-inspect`,
  `use-volume-inspect`.
- **Six list hooks keep their clock**: `use-containers`, `use-images`, `use-volumes`, `use-networks`,
  `use-compose-projects`, `use-plugins`. Their poll, their active-context subscription and their
  reload subscription are not touched.
- **`client/e2e/detail-reread-scoped.spec.ts` is removed with the behaviour it covers.** Both its
  tests are about the client's event-driven detail re-read. Its second test also touched
  `plan-docker_management_app-refresh_cache/REQ-58`, which is a **server** requirement and survives;
  that requirement keeps its coverage in `server/test/api/detail-derivation-follows-listing.test.ts`
  and its unit counterpart. INT-9 makes confirming that a condition of removing the file.
- **The server's own reaction to events stays.** The server still marks its held values due on a
  daemon event, so the lists on the clock keep showing fresh data three seconds later. Only the
  browser stops deciding when to read.
- **`client/e2e/support/caught-up.ts` needs no change.** It waits for the list poll and the server's
  own grouping window, neither of which this batch touches.
- **The three technical-debt entries named by the spec stay in the register.** Human decision of
  2026-09-01: this plan removes none of them.

## Requirements this plan supersedes

Per [[past-analyses-and-plans-are-never-touched]], nothing in the earlier plan is edited. Recorded
here so the next reader is not confused by two live statements of the opposite behaviour:

- `plan-docker_management_app-refresh_cache/REQ-7` and `REQ-8` — a detail view re-reading for events
  about its own object. Superseded by REQ-1: it re-reads for no event at all.
- `plan-docker_management_app-refresh_cache/REQ-21`, its "event subscriptions" clause only. The rest
  of REQ-21 — the public shape of the list hooks and their intervals — stands, and REQ-6 restates it.

## Departures from the spec

Both are human decisions of 2026-09-01, taken during validation. **The spec was corrected on the
same day** and now reads as REQ-9 and REQ-13 do; this section is the account of why.

- **The spec's requirement "An action the operator performs through the application still shows its
  result immediately"** is narrowed by REQ-9 to where the application already re-reads after its own
  action. The spec's wording would require adding a re-read to the seven views of REQ-2, and the
  human's instruction is that this step removes and adds nothing. Measured before the decision: the
  operator's actions live on the list screens, which call their own re-read, and the one action taken
  inside a detail view — the container's configuration update — already re-reads explicitly. So the
  narrowing costs the operator nothing they can see, except where a view other than the one acted
  upon was following along on the event.
- **The spec's non-functional requirement "The application makes strictly fewer requests than before
  this step"** is replaced by REQ-13. Nothing is measured and no request is counted. What is asked
  for instead can be read off the code: after this step the Dashboard's event feed is the only
  subscriber to the daemon event stream left in the client.

## Coverage check

Every REQ is served by at least one INT, and every INT serves at least one REQ. No enabling
intervention. Every REQ closes in this batch; none is spread over several.

| REQ | Served by |
|-----|-----------|
| REQ-1 | INT-1, INT-2, INT-3, INT-11 |
| REQ-2 | INT-2, INT-3, INT-11 |
| REQ-3 | INT-1, INT-2, INT-3, INT-4, INT-8, INT-11 |
| REQ-4 | INT-4 |
| REQ-5 | INT-4, INT-10 |
| REQ-6 | INT-1, INT-7 |
| REQ-7 | INT-1, INT-2, INT-3 |
| REQ-8 | INT-1, INT-2 |
| REQ-9 | INT-1, INT-3 |
| REQ-10 | INT-1, INT-2, INT-3 |
| REQ-11 | INT-10 |
| REQ-12 | INT-10 |
| REQ-13 | INT-4, INT-5 |
| REQ-14 | INT-6, INT-7, INT-8, INT-9, INT-10 |
| REQ-15 | INT-6, INT-7, INT-9, INT-10 |

| INT | Serves |
|-----|--------|
| INT-1 | REQ-1, REQ-3, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10 |
| INT-2 | REQ-1, REQ-2, REQ-3, REQ-7, REQ-8, REQ-10 |
| INT-3 | REQ-1, REQ-2, REQ-3, REQ-7, REQ-9, REQ-10 |
| INT-4 | REQ-3, REQ-4, REQ-5, REQ-13 |
| INT-5 | REQ-13 |
| INT-6 | REQ-14, REQ-15 |
| INT-7 | REQ-6, REQ-14, REQ-15 |
| INT-8 | REQ-3, REQ-14 |
| INT-9 | REQ-14, REQ-15 |
| INT-10 | REQ-5, REQ-11, REQ-12, REQ-14, REQ-15 |
| INT-11 | REQ-1, REQ-2, REQ-3 |
