---
batch: startup-order-and-disowned-read
feature: The endpoint is set before the server serves
closed_req: REQ-24, REQ-27, REQ-29
depends: lists-from-refresh-cache
---

# Batch — startup order and disowned read

The requirements are in `../requirements.md` and are cited here by id.

A server started seconds earlier answers a list endpoint with a failure, against a daemon that is
perfectly reachable. `server/src/index.ts` resolves the active endpoint **after** the port is already
accepting requests, so on any machine whose active context differs from the platform default — the
normal case — the resolution lands about half a second in and discards every held value. A first read
in flight at that moment is disowned by the cache's generation check: it stores nothing and records
no failure, and the caller waiting on it finds neither, so the endpoint reports that the value could
not be read. That breaks REQ-9 and REQ-16 on a fresh process.

The order becomes: resolve and set the active endpoint, then listen.

**Nothing is warmed.** A value never read before is fetched by the first request that wants it, with
the client waiting — REQ-9, unchanged. The startup warm read that this batch originally carried was
withdrawn on 2026-08-28 by the human, with the two requirements that existed only to make it safe;
see the note in `../requirements.md`.

## Two halves, and why the batch needs both

**Ordering the startup removes the occasion, not the defect.** A genuine context change arriving
while a first read is in flight is the same hole, and no startup order reaches it. REQ-27 closes it
in the cache, where it lives, and is checked there rather than through the startup.

**The startup must not become a place the server can hang.** Resolving the active context reads
Docker's own configuration, and a daemon that cannot be reached must still leave a listening port
that reports the failure the way it does today — REQ-29. Making the startup wait for the daemon is
the obvious mistake here: it turns an unreachable daemon into a server that never listens.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/refresh-cache/refresh-cache.ts` | A caller waiting on a read that a discard disowned reads again, against the endpoint now active, instead of being told the value could not be read. It returns a value or the daemon's own failure, never neither. | REQ-27 | — |
| INT-2 | modify | `server/src/index.ts` | The startup becomes an awaited order: resolve and set the active endpoint, then listen. Nothing is accepted before the endpoint is set. | REQ-24 | — |
| INT-3 | modify | `server/src/index.ts` | Resolving the endpoint is not fatal and does not hang the startup: an endpoint that cannot be resolved leaves the default in place as today, and the port opens either way. | REQ-29 | INT-2 |
| INT-4 | modify | `.sdd/modules/server-app/specs/server-bootstrap.md`, `.sdd/modules/refresh-cache/specs/refresh-cache.md` | Carry it into the specs: the awaited startup order and what it does when the endpoint cannot be resolved, and the disowned read that reads again instead of answering with neither a value nor an error. | REQ-24, REQ-27, REQ-29 | INT-1, INT-2, INT-3 |
| INT-5 | create | server check tree, unit | A check on the cache alone: a read disowned by a discard mid-flight answers its caller with a value or with the daemon's failure, never with the value-could-not-be-read error. Uses the cache's own reset seam between cases. | REQ-27 | INT-1 |
| INT-6 | create | server check tree, api | A check on a freshly started server process whose active context differs in value from the platform default: the first list request it ever receives is answered, never with the value-could-not-be-read failure, and it is answered without the process having been asked anything before. | REQ-24, REQ-27 | INT-2 |
| INT-7 | create | server check tree, api | A check that a server whose daemon cannot be reached at startup still opens its port, answers `/health`, and serves the daemon failure on the endpoints that need it rather than refusing to start. | REQ-29 | INT-3 |

## Human acceptance

### Scenario: The first screen after a restart is shown, not refused

- REQ → REQ-24, REQ-27
- Given → the server has just been restarted, on a machine whose active Docker context is not the platform default one
- When → the operator opens the application and lands on its first screen
- Then → the list is shown, with no error saying a value could not be read

### Scenario: A switch of context while the first screen loads

- REQ → REQ-27
- Given → the application is loading its first screen
- When → the active context changes while that first read is still in flight
- Then → the screen shows the objects of the daemon now active, and never an error saying a value could not be read

### Scenario: The application still starts with the daemon down

- REQ → REQ-29
- Given → the Docker daemon is stopped
- When → the operator starts the application and opens it
- Then → the interface loads and reports the daemon as unreachable, exactly as it does today
