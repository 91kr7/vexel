---
batch: daemon-connection-reused
feature: One connection to the daemon is reused
closed_req: REQ-4, REQ-5
depends: —
---

# Batch — daemon connection reused

The requirements are in `../requirements.md` and are cited here by id only.

Every call to the daemon opens its own connection and closes it. On the local socket the waste is
small; on a remote context it is a TLS handshake, or a whole `ssh` process, per call. This is the
one change in the plan whose benefit is nearly invisible on the development machine and large on the
configuration nobody watches.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/docker/http-client.ts` | Hold one reusable connection pool per endpoint instead of building a fresh one inside each request, keeping connections alive between calls. How an endpoint is dialled does not change — unix, TCP with or without TLS, and the ssh tunnel are dialled exactly as now. | REQ-4 | — |
| INT-2 | modify | `server/src/docker/http-client.ts` | Keep streaming requests out of the reuse: a stream owns its connection for its lifetime and never returns it to the pool while open. | REQ-4 | INT-1 |
| INT-3 | modify | `server/src/docker/http-client.ts`, `server/src/docker/endpoint.ts` | Bind the pool to its endpoint and discard it on the change notification the active-endpoint component already publishes, so no connection opened for one daemon serves a call to another. | REQ-5 | INT-1 |
| INT-4 | modify | `.sdd/modules/docker-access/specs/engine-client.md`, `.sdd/modules/docker-access/specs/active-endpoint.md` | Carry into the specs: calls over an endpoint reuse a connection, the reuse is per endpoint, streams are excluded, and a change of active endpoint discards it. | REQ-4, REQ-5 | INT-1, INT-2, INT-3 |
| INT-5 | create | server check tree, unit and api | Checks that a run of calls against one endpoint opens fewer connections than it makes calls, and that after the active endpoint changes no call is served over a connection belonging to the previous one. Answers, errors and streams are asserted unchanged. | REQ-4, REQ-5 | INT-1, INT-2, INT-3 |

## Human acceptance

### Scenario: Every screen still works against the daemon

- REQ → REQ-4
- Given → the application is open and connected
- When → the operator moves through the containers, images, volumes, networks and compose screens and acts on each — starting a container, removing a network, opening a log stream
- Then → everything answers and behaves exactly as today, with no error and no delay the operator can perceive

### Scenario: Changing context really changes daemon

- REQ → REQ-5
- Given → the operator has two contexts pointing at different daemons, and the application is showing the objects of the first
- When → the operator makes the second context active
- Then → every screen shows the objects of the second daemon, with nothing of the first left visible anywhere

### Scenario: A remote daemon stops paying per call

- REQ → REQ-4
- Given → the active context is a remote `ssh://` context, and the operator is watching the processes running on their machine
- When → the operator leaves the application open on any screen for a minute
- Then → the application is not starting a new `ssh` process for each call it makes
