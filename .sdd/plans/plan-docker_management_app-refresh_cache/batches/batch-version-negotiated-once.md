---
batch: version-negotiated-once
feature: The Engine API version is negotiated once, and the probe still probes
closed_req: REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36
depends: —
---

# Batch — the version is negotiated once

The requirements are in `../requirements.md` and are cited here by id.

**Every call this server makes to the daemon is two calls.** `EngineClient.getVersion()` issues a
full `GET /version` on every invocation, and `request`, `requestRaw`, `requestStream` and `hijack`
each await it as their first statement to build the `/v1.43` prefix. Nothing is remembered: no field,
no promise. The Docker call log added on 2026-08-28 made it readable without instrumentation —
**235 of 447 socket calls at rest were `/version`**, one before each real one, exactly. Locally that
is +3.04 ms and +62% per call; on a TCP+TLS or `ssh://` context it is a second full round trip over
the network for every container listed, every stats sample, every log follow opened.

This batch is what the plan was for. `daemon-connection-reused` (REQ-4) removed the *dial* per call;
the call itself stayed. Removing it is the same argument one layer up.

## The two readings of the version, and why one cache would be wrong

The version is read for two unrelated purposes, and they want opposite things.

- **To compose a path.** `/v{apiVersion}/containers/json` — every call needs the number, none of
  them needs it fresh. This is the reading that must come from a held value (REQ-31).
- **To know whether the daemon is there.** `connection-status-service.ts` probes reachability by
  calling `getVersion()` and treating a failure as "unreachable", and the status it publishes also
  carries the negotiated Engine API and engine versions — which only a real call returns. **A probe
  served from a memo stops probing**, which is the one way this batch could ship a defect worse than
  the cost it removes (REQ-32).

So `getVersion()` keeps its meaning — a real call, every time — and the held value is a second,
internal reading beside it. The two are joined at exactly one point: **a negotiation that reached the
daemon refreshes what is held** (REQ-33). The probe runs on its own schedule and is marked due by the
event stream, so the held value is never older than the last successful probe, and a daemon upgraded
under a running server is picked up with no timer and no eviction rule of its own.

**Scoping needs nothing new, but it must not be thrown away.** The shared client is already discarded
and rebuilt on `onActiveEndpointChanged` (`engine-client.ts:135`), so a value held **on the instance**
cannot outlive the daemon it was negotiated with. Held in a module-level variable instead, it would
survive the discard and compose paths for the new daemon with the old one's version — REQ-34 exists
to make that failure a check rather than a code review.

**A failure is never held** (REQ-35). Memoizing a rejected promise turns one unreachable moment into
a client that stays broken until the context changes.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/docker/engine-client.ts` | The version used to compose a request path comes from a value held **on the client instance**. On a miss it negotiates once, and the calls arriving while that negotiation is in flight wait on that same one instead of each issuing their own. | REQ-31, REQ-34 | — |
| INT-2 | modify | `server/src/docker/engine-client.ts` | `getVersion()` keeps calling the daemon on every invocation — it is the reachability probe and the source of the versions the status reports. A negotiation that reached the daemon replaces what is held; one that failed leaves the held value untouched and is raised to its caller exactly as today. | REQ-32, REQ-33, REQ-35 | INT-1 |
| INT-3 | modify | `.sdd/modules/docker-access/specs/engine-client.md`, `.sdd/modules/connectivity/specs/connection-status-service.md` | Carry it into the specs: the two readings of the version and which one each entry point uses, the refresh on a real negotiation, the scoping to the instance, and that a failure is not held. The connection-status spec states that its probe is a real call and why. | REQ-31, REQ-32, REQ-33, REQ-34, REQ-35 | INT-1, INT-2 |
| INT-4 | create | server check tree, unit | Against a daemon stub that counts what it receives: a run of calls through `request`, `requestRaw`, `requestStream` and `hijack` issues **one** `/version` in total, and a burst leaving in a single tick issues one too — not one per call and not one per entry point. | REQ-31 | INT-1 |
| INT-5 | create | server check tree, unit | `getVersion()` reaches the daemon on **every** invocation — n calls, n `/version` requests — and the value it returns is the one the paths issued after it are composed with. | REQ-32, REQ-33 | INT-2 |
| INT-6 | create | server check tree, unit | A daemon that reports a different API version after a successful probe is composed against from then on, with no restart: the paths issued after that probe carry the new version. | REQ-33 | INT-2 |
| INT-7 | create | server check tree, unit | A change of the active endpoint leaves no version behind: the first call after it negotiates against the new daemon, and no path is composed with the previous daemon's version. Drives the real change signal, not a private reset. | REQ-34 | INT-1 |
| INT-8 | create | server check tree, unit | A negotiation that failed is not held: the call that hit it reports the daemon's own message, and a call made once the daemon answers again negotiates and succeeds rather than inheriting the failure. | REQ-35 | INT-2 |
| INT-9 | create | server check tree, api | Against the real daemon: the connection status still reports a negotiated Engine API version and an engine version, and the list endpoints answer what they answer today — the guardrail that this batch removed calls and nothing else. | REQ-36 | INT-1, INT-2 |
| INT-10 | modify | `.sdd/tech-debt/entries/engine-version-negotiated-on-every-call.md`, `.sdd/tech-debt/index.md` | Close the debt entry that recorded this: `status: closed`, naming this plan and this batch as what closed it. The entry stays standing — the register is a record. | REQ-31 | INT-1, INT-2 |

## Human acceptance

### Scenario: The application asks the daemon half as much

- REQ → REQ-31
- Given → the application is open on a list screen, with `VEXEL_DOCKER_LOG` left at its default
- When → the operator watches the server's Docker call log for a minute
- Then → `GET /version` no longer appears before every other call; the lines are the calls the screens actually need

### Scenario: The daemon going away is still noticed

- REQ → REQ-32
- Given → the application is open and reports the daemon as reachable
- When → the operator stops the Docker daemon
- Then → the interface reports the daemon unreachable, in the same time it takes today

### Scenario: The daemon coming back is still noticed

- REQ → REQ-32, REQ-35
- Given → the interface is reporting the daemon as unreachable
- When → the operator starts the daemon again
- Then → the interface reports it reachable again and the screens fill, without the server being restarted

### Scenario: The reported versions are still there

- REQ → REQ-32, REQ-36
- Given → the daemon is reachable
- When → the operator opens the screen that reports the connection
- Then → the negotiated Engine API version and the engine version are shown, as they are today

### Scenario: Switching context talks to the new daemon

- REQ → REQ-34
- Given → the operator has two Docker contexts
- When → they switch the active context
- Then → the screens show the objects of the daemon now active, with no error about an unsupported API version
