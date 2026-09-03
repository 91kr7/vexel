---
batch: 1 · single-origin-serving
feature: F1 — The server is the whole application: one process, one origin
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12]
depends: []
---

# Batch 1 — Single-origin serving

The Express process stops being "the part the application talks to" and becomes the application: it
serves the built interface and the API from the same origin and the same port. Nothing else about
the product changes — no screen, no route, no operation.

REQ-6 (live capabilities unregressed) is **served** by this batch and **closes in batch 3**, where
the whole end-to-end suite runs against this arrangement. This batch still carries its own
non-regression check (INT-3), because between this batch and batch 3 nothing else would notice a
stream that stopped working.

## The two contracts this batch implements to the letter

`.sdd/.archi` ("Serving topology") was written for this change and is binding here:

- the client build is consumed **in place**, from `client/dist`; nothing is copied into the server
  workspace, and `VEXEL_CLIENT_DIST` is the run-time override;
- the directory is resolved **from the server's own module URL**, never from `process.cwd()`;
- the client serving is mounted **last**, after `/health` and every `/api/*` router;
- the history fallback answers **only `GET`/`HEAD` outside `/api`**;
- a missing `client/dist` is **not fatal**: reported once, the server runs API-only;
- **no new dependency** — `express.static` and `res.sendFile` ship with Express 5.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | server, `server/src/` (module `server-app`) | The client-serving unit: resolves the built-interface directory from the server's own module URL, overridden at run time by `VEXEL_CLIENT_DIST` (REQ-10); serves the build's static assets; answers `GET`/`HEAD` requests outside `/api` with the build's entry document (REQ-3), leaving every other method and every non-page request to fail as it would otherwise (REQ-5). When the directory is absent, or holds no entry document, it serves nothing and reports **once** — naming the cause and the remedy, i.e. that the interface has not been built and which root command builds it (REQ-9) — while the server keeps serving its whole API (REQ-8). Adds no dependency and does nothing at start-up that reaches the network or walks the build (REQ-11). **Three traps.** (a) The module-URL resolution must account for the depth of the file that computes it: `../../client/dist` is correct from `server/{src,dist}/index.*` and wrong one level deeper — it must hold identically under `tsx watch src/index.ts` and `node dist/index.js`. (b) It must be a mountable unit with **no import-time side effect and no `listen`**, or INT-3 cannot exercise it. (c) The absence must be decided at mount time and reported once, not probed per request. | REQ-1, REQ-3, REQ-5, REQ-8, REQ-9, REQ-10, REQ-11 | — |
| INT-2 | modify | `server/src/index.ts` | Mount INT-1 **after** `/health` and after every `/api/*` router (the last of them today is `app.use("/api/host-paths", …)`), and **before** `app.listen`. Mount order is the whole requirement: anything registered before `/api` could shadow the API, and an unknown `/api` address must keep failing as the JSON error the API already returns rather than being answered with the interface (REQ-4, REQ-7). The `server.on("upgrade", …)` hook stays exactly as it is and keeps its position — no Express middleware can intercept an upgrade, which is what keeps the interactive sessions untouched (REQ-6). One process, one `listen`, one port, and no authentication, authorisation or transport layer is introduced along the way (REQ-1, REQ-12). | REQ-1, REQ-4, REQ-6, REQ-7, REQ-12 | INT-1 |
| INT-3 | create | server test tree (`server/test/`) | The checks that pin this arrangement, built on an app composed like INT-2's and started with the existing `startApp` helper of `server/test/support/fixtures.ts` (torn down in a `finally`, per the project's testing discipline): an unknown address under `/api` answers as the API's own JSON error and never as the entry document (REQ-4); a `GET` outside `/api` answers with the entry document (REQ-3); a `POST`/`DELETE` outside `/api` does not (REQ-5); with the directory pointed at a missing path through `VEXEL_CLIENT_DIST`, the API and `/health` still answer and the stated reason is reported (REQ-8, REQ-9, REQ-10); with it pointed at a different existing directory, that one is served (REQ-10); and the two live channels survive the new middleware — the `/api/events` stream still streams and an upgrade on an `/api` path is still handled (REQ-6). Any temporary directory the checks create is theirs to remove. | REQ-3, REQ-4, REQ-5, REQ-6, REQ-8, REQ-9, REQ-10 | INT-1, INT-2 |
| INT-4 | create | server test tree (`server/test/`) — same suite as INT-3 | The origin check: with the process bound to a port other than the default, the interface **and** the API answer at that same origin, and the built client carries no configured API origin, base URL or cross-origin arrangement — its calls are relative to wherever it was served from, the exec/attach session URL included, which is what makes the product work behind a reverse proxy or a tunnel without configuration (REQ-2). This is a preservation requirement: the client is not modified by this batch and must not need to be. | REQ-2 | INT-2 |
| INT-5 | modify | `.sdd/modules/server-app/` (index and the `server-bootstrap` spec) | Record the new component and the contract change: the client-serving unit joins the index with its own spec, and the bootstrap spec gains the mount that is now part of its contract — mounted last, after every `/api/*` router, before `listen` — plus the `VEXEL_CLIENT_DIST` override and the API-only degradation. The mount order is load-bearing and the next person to add a router has to read it somewhere. | REQ-1, REQ-4, REQ-9, REQ-10 | INT-2 |

## Out of this batch

The root commands and the project's instructions (batch 2); moving the end-to-end suite onto this
arrangement (batch 3). No client code, no screen, no navigation, no URL routing — the interface has
no per-screen addresses and gains none here. No change to any `/api` route, to the event stream, to
the upgrade handling, or to what is persisted. No authentication, no TLS, no reverse proxy, no
container image. No asset caching or cache-invalidation mechanism beyond what Express does by
default.

## Human acceptance

After `npm run build` at the repository root and starting the server alone, `http://localhost:3000`
serves the complete interface: every screen opens, every operation works, streamed logs, live
statistics, the daemon event stream, an interactive shell session and a filesystem/layer analysis
all behave as they do through the development proxy. Reloading the browser, or pasting the address
with any trailing path, reopens the application on the screen it had persisted as last active —
never a server "not found". `curl` on an unrecognised `/api/...` address returns the API's JSON
error, not HTML; a `POST` to an address outside `/api` that does not exist does not return the
interface. Starting the same process with `PORT` set to another value serves interface and API
together at that one port, with nothing else listening. Deleting `client/dist` and restarting leaves
a server that logs, in one line naming the cause and the command that fixes it, that the interface
has not been built — and whose API still answers every request. Pointing `VEXEL_CLIENT_DIST` at a
copy of the build elsewhere serves that copy. `git diff` shows no new runtime dependency in
`server/package.json` and no change under `client/src/`. `npm run test -w server` passes.
