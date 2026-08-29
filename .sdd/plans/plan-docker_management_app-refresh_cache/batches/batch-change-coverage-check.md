---
batch: change-coverage-check
feature: The change-coverage check asserts the guarantee, not the daemon's timing
closed_req: REQ-45, REQ-46
depends: —
---

# Batch — the change-coverage check asserts the guarantee

The requirements are in `../requirements.md` and are cited here by id.

**This batch changes no product source.** Nothing under `server/src/` or `client/src/` moves, and no
component spec and no index changes. It is a correction to one check. A batch that touched a service
here would be turning a measurement problem into a product change.

## What is wrong with the check

`server/test/api/refresh-cache-routes.test.ts`, the case named *"killing and starting a container
through the application shows in the very next list request"* (around line 217), fails about one run
in five on the current tree. It failed five runs in ten at the commit before `container-listing-shared`.
The rate is going down, not up, which is itself a sign that the product is not the cause.

It asserts two things in one line, and only one of them is ours.

| Claim | Who guarantees it | Observable |
|-------|-------------------|------------|
| the listing served was read after the operation | **us**, and it is REQ-13's change coverage | the `X-Vexel-Read-At` header the endpoint already sends (`server/src/refresh-cache/refresh-cache-response.ts:12`) |
| the container reads `exited` in that listing | **the daemon**, and the 204 does not promise it | the `state` field in the body |

`POST /containers/{id}/kill` answers when the signal has been delivered, not when the container has
exited and been reaped. Measured at the daemon: still `running` on the very next listing 14 times out
of 15. The evidence is in `../requirements.md`, under the appended section of 2026-08-30.

## The correction

Split the two claims and assert each where it is guaranteed. Nothing the check asserts today is lost,
except the one claim the daemon does not make.

**The anchor is the instant the kill was asked for, not the instant it returned.** The route marks the
listing changed and then answers 204, so the covering read can start before the 204 reaches the check.
What the mechanism does guarantee is the other order: the read that serves the next list starts at or
after `markChanged()`, which happens after the operation, which happens after the request was sent. So
the check captures the clock before it sends the kill and asserts the served listing's read time is at
or after that instant. That is deterministic. Asserting against the moment the 204 arrived would be a
few milliseconds of luck again, smaller than today's but the same kind.

**A cache serving the old listing still fails it.** The listing read before the kill completed before
that instant, so its read time cannot satisfy the assertion.

**The state assertions move onto `stop`.** `POST /containers/{id}/stop` answers when the container has
stopped, and answers 304 when it was already stopped. Either way the container reads `exited` once it
has answered. The `start` that follows then reports `running`, and it stays a real start: without the
stop in front of it, a start issued while the killed container is still running is a no-op the daemon
answers 304 to, and `running` would have been true before the check asked for anything.

## The siblings were examined, and none of them conflates

The other eight cases for REQ-13 in this file drive operations whose effect on the daemon is complete
when they answer.

- **Presence and absence** — container create, remove and rename; image tag and untag; volume create
  and remove; network create and remove; context and builder create and remove. The daemon has applied
  each of them when it answers, so what the next listing must carry is settled.
- **Attach and detach** — `POST /networks/{id}/connect` and `/disconnect` answer once the endpoint
  exists or is gone, and the attachment is in the container's own `NetworkSettings` at that moment.
- **Start** — answers once the process is started.
- **Compose up and down** — the CLI returns once the containers are created and started, or removed.
  The assertion after `down` is a negative one in any case.

Only the kill answers before the state it was asserted on exists. INT-4 reads them again in the file
rather than trusting this paragraph.

**`containers-routes.test.ts` kills a container too, and must not change.** Its case at line 287
asserts the same `exited` through `expectListedState`, which polls for up to fifteen seconds. That is
a check of `plan-docker_management_app/REQ-20` — the kill reaches the daemon and the row reports what
follows — where waiting for the daemon is the thing being observed and not a way around a guarantee.
REQ-46 forbids the wait in the checks of REQ-13, where it would hide the mechanism under test.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/test/api/refresh-cache-routes.test.ts`, the container lifecycle case | Read the clock just before the kill is sent. After the kill, assert the served listing's read time is at or after that instant. The `exited` assertion after the kill goes. | REQ-45, REQ-46 | — |
| INT-2 | modify | the same case | Stop the container through the application, between the kill and the start. Assert `exited` after the stop and `running` after the start. The case is renamed for the three operations it drives. | REQ-45 | INT-1 |
| INT-3 | modify | the comment above the same case | State which claim each assertion makes and why, and that no wait, retry or poll may be added to it. | REQ-45, REQ-46 | INT-1, INT-2 |
| INT-4 | modify | the other eight cases for REQ-13 in the same file | Read each one against the rule. Correct any that asserts a state the daemon has not settled when the operation answers. Planning found none. | REQ-45 | — |

## How the batch is certified

One green run does not certify it. The defect appeared about one run in five, so the file is run
several times in a row. Ten runs would have shown the old failure about nine times out of ten.

## Human acceptance

### Scenario: The container lifecycle check passes on every run

- REQ → REQ-45, REQ-46
- Given → the check used to fail about one run in five, on a state the daemon had not reached yet
- When → the check drives the kill, the stop and the start through the application, reading the list once after each
- Then → it passes on every run, and it waits for nothing

### Scenario: The check still catches a list served from before the operation

- REQ → REQ-45
- Given → the same check, and a refresh cache made to answer from the value it held before the operation
- When → the check is run
- Then → it fails, on the read time of the listing it was served
