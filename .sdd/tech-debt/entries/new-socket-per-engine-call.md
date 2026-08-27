---
id: new-socket-per-engine-call
area: server
severity: high
cost: remote-only
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# A brand-new socket is opened for every single Engine call

**What** → the HTTP client towards Docker constructs a fresh `Agent` **inside** each request, with
`keepAlive: false`. No connection is ever reused.

**Where** → `server/src/docker/http-client.ts:14` (`super({ keepAlive: false })`) and `:41`
(`const agent = new EndpointAgent(endpoint)`, inside `send`). Dialling: `server/src/docker/transport.ts`.

**Evidence** → measured over 200 identical calls on the local unix socket: 0.82 ms per call with a
fresh agent against 0.61 ms reused — 25% of an already tiny number, **negligible locally**.

**Why it matters** → it is not negligible remotely, and the application supports remote contexts.
On a TLS context every request performs three synchronous `readFileSync` of ca/cert/key plus a full
handshake. On an `ssh://` context every request **spawns an `ssh` process** running
`docker system dial-stdio` (`server/src/docker/transport.ts:53`). At the at-rest rate of 212 Engine
calls a minute, that is roughly **212 ssh connections a minute doing nothing**.

**Why it is filed anyway despite being local-cheap** → it is one line, it is invisible on the
development machine, and it degrades by two orders of magnitude on exactly the configuration where
nobody is watching the logs.

**Direction** → a keep-alive agent per endpoint, held for the endpoint's lifetime and replaced on
context switch. Independent of [[no-server-side-sampling-or-dedup]], which changes how often this is
paid but not what it costs.
