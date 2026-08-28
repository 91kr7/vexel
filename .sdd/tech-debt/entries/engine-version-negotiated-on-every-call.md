---
id: engine-version-negotiated-on-every-call
area: server
severity: high
cost: at-rest
date: 2026-08-28
source: the Docker call log (server/src/docker/call-log.ts), read against the code and measured on the development machine
status: closed
---

# The Engine API version is re-negotiated before every single call

**What** → `EngineClient.getVersion()` issues a full `GET /version` to the daemon on every
invocation, and every public method of the client awaits it as its first statement. Nothing is
remembered: no field, no promise, no map. **Every Engine API call is therefore two round trips.**

**Where** → `server/src/docker/engine-client.ts:38` (`getVersion`, which calls `requestBuffered`
unconditionally), awaited at `:53` (`request`), `:71` (`requestRaw`), `:90` (`requestStream`) and
`:104` (`hijack`).

**Evidence** → the log added by the Docker call log makes it visible without instrumentation. Three
list endpoints requested once each, at rest:

```
GET /version
GET /v1.43/containers/json?all=true
GET /version
GET /version
GET /version
GET /v1.43/containers/json?all=true
GET /v1.43/volumes
GET /v1.43/system/df
GET /version
GET /version
GET /v1.43/containers/json?all=true
GET /v1.43/networks
```

Twelve socket calls, **six of them `/version`** — one per real call, exactly.

Measured over 200 calls each, local unix socket, connection pool warm:

| | per call |
|---|---|
| `GET /version` alone | 3.08 ms |
| `GET /containers/json?all=true` alone | 4.87 ms |
| the same listing through `EngineClient` | 7.91 ms |

**+3.04 ms, +62% on every call**, on the cheapest transport this application supports.

**Why it matters** → unlike [[new-socket-per-engine-call]] this one is *not* remote-only. The
connection pool means the extra request costs no dial, but a round trip is a round trip: locally it
is 62%, and on a TCP+TLS or `ssh://` context it is a second full request over the network for every
container listed, every stats sample, every log follow opened. It also doubles the request count the
daemon serves, which is the figure every other debt in this register is expressed in.

For comparison, the Docker CLI negotiates **once per process**.

**Why it was not caught before** → the negotiation is one `await` at the top of four methods and
reads as free; nothing in the code says it is a network call, and no test counts requests. It became
obvious the moment the calls were written down in order.

**Direction** → memoize the negotiated version on the `EngineClient` instance, holding the in-flight
promise rather than the resolved value so that a burst negotiates once (the shape
`detectCliAvailability` already uses in `server/src/docker/cli-runner.ts:38`). The scoping is
already correct and needs nothing new: the shared client is discarded and rebuilt on
`onActiveEndpointChanged` (`engine-client.ts:135`), so a memo cannot outlive the daemon it was
negotiated with. A failed negotiation must not be memoized as a success.

One caller wants the opposite and must be looked at rather than inherited:
`server/src/connectivity/connection-status-service.ts:53` uses `getVersion()` as its reachability
probe, and a probe served from a memo stops probing.

**Closed on 2026-08-29** by `plan-docker_management_app-refresh_cache`, batch
`version-negotiated-once` (REQ-31 to REQ-36). The version a request path is composed with is held on
the `EngineClient` instance and negotiated once, the in-flight negotiation being what a burst waits
on; `getVersion()` keeps calling the daemon on every invocation, since it is the reachability probe
and the source of the versions the connection status reports, and a call of it that reached the
daemon refreshes what is held. A failed negotiation is not held. The entry stays on file: the
register is a record.
