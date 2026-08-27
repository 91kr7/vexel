---
batch: daemon-connection-reused
feature: One connection to the daemon is reused
closed_req: REQ-4, REQ-5
depends: —
---

# Batch — daemon connection reused

The requirements are in `../requirements.md` and are cited here by id only.

Every call to the daemon currently opens its own connection and closes it. On the local socket the
waste is small; on a remote context it is a TLS handshake, or a whole `ssh` process, per call. This
batch reuses the connection. It is the one change in this plan whose benefit is almost invisible on
the development machine and large on the configuration nobody watches.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-5 | modify | `server/src/docker/http-client.ts` | Hold one reusable connection pool per endpoint instead of constructing a fresh one inside each request, and let it keep connections alive between calls. How an endpoint is dialled does not change — unix socket, TCP with or without TLS, and the ssh tunnel are dialled exactly as they are now; what changes is that the result is reused. Streaming requests keep their own long-lived connection semantics: a stream still owns its connection for its lifetime and never returns it to be reused while open. | REQ-4 | — |
| INT-6 | modify | `server/src/docker/http-client.ts`, `server/src/docker/endpoint.ts` | Bind the reuse to the endpoint it belongs to and discard it when the active endpoint changes, using the change notification the active-endpoint component already publishes. No connection opened for one daemon may serve a call to another, and nothing may be left holding a socket to a daemon the operator has left. | REQ-5 | INT-5 |
| INT-7 | modify | `.sdd/modules/docker-access/specs/engine-client.md`, `.sdd/modules/docker-access/specs/active-endpoint.md` | Carry the change into the specifications: that calls over an endpoint reuse a connection, that the reuse is per endpoint, and that a change of active endpoint discards it. | REQ-4, REQ-5 | INT-5, INT-6 |
| INT-8 | create | server check tree, unit and api | Checks that a run of calls against one endpoint establishes fewer connections than it makes calls, and that after the active endpoint changes no call is served over a connection belonging to the previous one. The behaviour of the calls themselves — answers, errors, streams — is asserted unchanged. | REQ-4, REQ-5 | INT-5, INT-6 |

## Human acceptance

### Scenario: Every screen still works against the daemon

- REQ → REQ-4
- Given → the application is open and connected
- When → the operator moves through the containers, images, volumes, networks and compose screens and performs an action on each — starting a container, removing a network, opening a log stream
- Then → everything answers and behaves exactly as it does today, with no error and no delay the operator can perceive

### Scenario: Changing context really changes daemon

- REQ → REQ-5
- Given → the operator has two contexts configured, pointing at different daemons, and the application is showing the objects of the first
- When → the operator makes the second context active
- Then → every screen shows the objects of the second daemon, and nothing of the first daemon remains visible anywhere

### Scenario: A remote daemon stops paying per call

- REQ → REQ-4
- Given → the active context is a remote `ssh://` context, and the operator is watching the processes running on their machine
- When → the operator leaves the application open on any screen for a minute
- Then → the application is not starting a new `ssh` process for each call it makes
