---
batch: warm-start
feature: The server is warm before it accepts requests
closed_req: REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29
depends: lists-from-refresh-cache, volume-sizes-separated
---

# Batch — warm start

The requirements are in `../requirements.md` and are cited here by id.

A server started seconds earlier answers a list endpoint with a failure, against a daemon that is
perfectly reachable. The active endpoint is resolved **after** the port is already accepting
requests, so on any machine whose active context differs from the platform default — the normal case
— the resolution lands about half a second in and discards every held value. A first read in flight
at that moment is disowned: it stores nothing and records no failure, and the caller waiting on it
finds neither, so the endpoint reports that the value could not be read. That breaks REQ-9 and
REQ-16 on a fresh process.

The order becomes: resolve and set the active endpoint, warm the held values, then listen.

## The staleness hazard, and what answers it

Warming values that are then served ten minutes later, to the first operator who happens to connect,
would be worse than the defect being fixed. The answer is machinery this plan already built: the
demand gate of REQ-14. A kind is refreshed only while it is being asked for, and a tick that finds a
whole expiry window with nobody asking stops the refresher and drops what is held — **before** it
reads, so that tick calls the daemon for nothing.

So the warm read **renews no demand**. It reads once and schedules each kind's refresher; the first
tick finds nobody has asked and drops the warmed value. A client connecting seconds after start gets
a warm, instant screen. A client connecting ten minutes later finds a cold server and pays one
correct first read, which is exactly today's behaviour. The daemon is called once per warmed kind,
at process start, and never again on the warm-up's account.

The volume-size value is left out of it (REQ-28): `/system/df` is the most expensive call the
application makes and that value's period is five minutes, so warming it would buy a value about to
expire at the price of the heaviest read there is.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/refresh-cache/refresh-cache.ts` | A warm operation beside the manual reload: reads once every registered kind that is not excluded from it, ends when all those reads have ended, and reports a failed read instead of throwing. | REQ-25, REQ-29 | — |
| INT-2 | modify | `server/src/refresh-cache/refresh-cache.ts` | The warm operation renews no demand: it starts each kind's refresher, whose first tick finds nobody asking and drops what was warmed without calling the daemon. | REQ-26 | INT-1 |
| INT-3 | modify | `server/src/refresh-cache/refresh-cache.ts` | Registering a kind can declare it excluded from the warm operation; included by default, so a kind added later is warmed unless it says otherwise. | REQ-28 | INT-1 |
| INT-4 | modify | `server/src/refresh-cache/refresh-cache.ts` | A caller waiting on a read that a discard disowned reads again, against the endpoint now active, instead of being told the value could not be read. It returns a value or the daemon's own failure, never neither. | REQ-27 | — |
| INT-5 | modify | `server/src/volumes/volumes-service.ts` | The volume-size kind declares itself excluded from the warm operation. Everything else about it stays as `volume-sizes-separated` left it. | REQ-28 | INT-3 |
| INT-6 | modify | `server/src/index.ts` | The startup becomes an awaited order: resolve and set the active endpoint, then warm, then listen. Nothing is accepted before the endpoint is set. | REQ-24, REQ-25 | INT-1 |
| INT-7 | modify | `server/src/index.ts` | Neither step is fatal: an endpoint that cannot be resolved leaves the default in place as today, a warm read that fails is left to the first request, and the port opens either way. | REQ-29 | INT-6 |
| INT-8 | modify | `.sdd/modules/server-app/specs/server-bootstrap.md`, `.sdd/modules/refresh-cache/specs/refresh-cache.md`, `.sdd/modules/volumes/specs/volumes-service.md` | Carry it into the specs: the awaited startup order, the warm operation and its exclusion flag, the demand it does not renew, the disowned read that reads again, and the volume-size kind's exclusion. | REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29 | INT-1, INT-2, INT-3, INT-4, INT-5, INT-6, INT-7 |
| INT-9 | create | server check tree, unit | A check on the cache alone: the warm reads every included kind once and not the excluded one, renews no demand so the first tick drops what it warmed and calls the daemon for nothing, and a read disowned by a discard mid-flight answers its caller instead of failing. Uses the cache's own reset seam between cases. | REQ-25, REQ-26, REQ-27, REQ-28 | INT-1, INT-2, INT-3, INT-4 |
| INT-10 | create | server check tree, api | A check on a freshly started server process whose active context differs in value from the platform default: the first list request it ever receives is answered, never with the value-could-not-be-read failure, and it is answered without the process having been asked anything before. | REQ-24, REQ-25, REQ-27 | INT-6 |
| INT-11 | create | server check tree, api | A check that a server whose daemon cannot be reached at startup still opens its port, answers `/health`, and serves the daemon failure on the endpoints that need it rather than refusing to start. | REQ-29 | INT-7 |

## Human acceptance

### Scenario: The first screen after a restart is answered at once

- REQ → REQ-24, REQ-25
- Given → the server has just been restarted, on a machine whose active Docker context is not the platform default one
- When → the operator opens the application and lands on its first screen
- Then → the list is shown straight away, with no error saying a value could not be read

### Scenario: A switch of context while the first screen loads

- REQ → REQ-27
- Given → the application is loading its first screen
- When → the active context changes while that first read is still in flight
- Then → the screen shows the objects of the daemon now active, and never an error saying a value could not be read

### Scenario: A server left alone all morning shows the daemon as it is now

- REQ → REQ-26
- Given → the server has been running since early, with no browser attached to it at any point
- When → the operator opens the application for the first time that day
- Then → what they see is the state of the daemon at that moment, not the state it was in when the server started

### Scenario: The application still starts with the daemon down

- REQ → REQ-29
- Given → the Docker daemon is stopped
- When → the operator starts the application and opens it
- Then → the interface loads and reports the daemon as unreachable, exactly as it does today
