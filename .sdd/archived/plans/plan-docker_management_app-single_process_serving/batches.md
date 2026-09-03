---
slug: docker_management_app-single_process_serving
date: 2026-08-10
spec: .sdd/analysis/docker_management_app-single_process_serving.md
requirements: .sdd/plans/plan-docker_management_app-single_process_serving/requirements.md
status: validated
---

# Batches — Single-process serving

Evolution of a certified, working product. Three features in the spec, three batches; none is an
enabling batch. Order is the reading order of the table, and each dependency is a real one: the
server has to be able to serve the interface before a command can promise it (2 depends on 1), and
the end-to-end suite stands the product up with those very commands (3 depends on 1 and 2). A stop
after batch 1 leaves a product an operator can already run by hand; a stop after batch 2 leaves the
delivered form working but verified only by hand.

Batch numbers and `REQ-n` ids are **local to this plan**. `REQ-1` here is not
`plan-docker_management_app/REQ-1`; requirements of the reference plan are always cited with their
path prefix.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · single-origin-serving | F1 — The server is the whole application: one process, one origin | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12 | — | certified | After `npm run build` and starting the server alone, `http://localhost:3000` serves the complete interface: every screen, every operation, streamed logs, live statistics, the event stream, an interactive session and a long analysis all behave as they do through the development proxy. A browser reload, or the address with any trailing path, reopens the application on the persisted last-active screen — never a server "not found". `curl` on an unrecognised `/api/...` address returns the API's JSON error, not HTML; a `POST` outside `/api` to a non-existent address does not return the interface. With `PORT` set elsewhere, interface and API answer together at that one port and nothing else listens. With `client/dist` deleted, the server still answers every API request and logs, in one line naming cause and remedy, that the interface has not been built; with `VEXEL_CLIENT_DIST` pointed at a copy of the build, it serves that copy. No new runtime dependency in `server/package.json` and no change under `client/src/`. `npm run test -w server` passes. |
| 2 · one-command-and-instructions | F2 — One command builds it, one runs it; the development loop is untouched | REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18 | 1 | certified | From a checkout with `client/dist` and `server/dist` removed, `npm start` at the root builds the client, then the server, then serves the complete application on one port, with nothing else to start; that one line is the whole instruction set. A deliberately broken client build makes `npm start` fail and **not** serve the previous build. `npm run serve` starts an existing build with no rebuild. `npm run dev:server` and `npm run dev:client` behave exactly as before — hot reload, an edit visible without a build or a restart, the API, event stream and interactive sessions still reached through the proxy — and neither arrangement needs a step of the other. `CLAUDE.md` states the two arrangements separately, says which belongs to the operator and which to the developer, and nothing in the repository still presents the development flow as the way to run the product. No *new* operator manual was created: the root `README.md` predates this plan as the project's licensing/attribution document — the acceptance line originally read "No root `README.md` exists", written in the mistaken belief that the repository had none; its "Running it" section, which told the reader to start the product with the development pair, was corrected rather than the file deleted. |
| 3 · delivered-form-verification | F3 — The delivered form is the form that is verified | REQ-6, REQ-19, REQ-20, REQ-21, REQ-22 | 1, 2 | certified | `npm run test:e2e -w client` builds the product, starts one process serving it, and runs the whole suite against that single origin; no Vite server starts and nothing listens on 5173 during the run. Every specification that passed before passes now, the live ones included (logs, statistics, event stream, interactive session, long analysis). The suite still runs on one worker, still wipes and recreates its own throwaway data directory before any specification (leaving `~/.vexel` untouched), still pulls the three base images once up front, and still runs the destructive `exclusive` specifications last and apart; a single specification file run alone still passes. A developer's `npm run dev:server` on port 3000 neither disturbs the run nor is disturbed by it. Breaking either new specification on purpose — an unknown `/api` address answered with the interface, a page request answered with a 404 — turns it red. `npm run test` from the root passes, with the server passes and the client's unit, typecheck and UI-boundary passes unchanged. `.sdd/.archi` no longer claims the suite targets the development flow. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

## Assumptions and decisions

- **The plan is written against the committed state, `HEAD = 1e9e3cb`.** Two artefacts of this change
  are already committed and were confirmed as **binding target contracts** at validation: the root
  `package.json` scripts (`start` = `npm run build && npm run serve`, `serve` = `npm start -w server`,
  `build` = client then server) and the `.sdd/.archi` "Serving topology" section. Nothing in
  `server/src/` serves anything static yet — there is no `express.static`, no `res.sendFile`, no
  reference to `client/dist` or `VEXEL_CLIENT_DIST` anywhere in the server. Batch 1 is therefore the
  whole of the mechanism, and batch 2 verifies, orders and documents commands it does not invent.
- **No client code is modified by this plan, in any batch.** The interface already addresses the API
  relative to its origin, the exec/attach session URL included (it is built from the browser's own
  host), so single-origin serving needs nothing of it. This was fixed at validation: the change is a
  pure serving-topology change and must not touch the app shell or its navigation.
- **No screen has a URL and none gains one.** Screens are internal state restored from the persisted
  last-active preference (`plan-docker_management_app/REQ-115`). REQ-3 is consequently a statement
  about the server never answering a page request with "not found", not about per-screen addresses;
  client-side routing is out of scope by the human's decision at validation.
- **The end-to-end suite moves onto the delivered form rather than being duplicated.** The human's
  decision, on the reasoning that removing one of the two servers means everything — the tests
  included — runs on the one that remains. The alternatives put to them (a second, small
  delivered-form check beside the existing suite; a second Playwright project running everything
  twice) were rejected: one delivered form, verified once, and it is the one that ships.
- **Accepted consequence: every end-to-end run pays a client build.** Planned into the suite's own
  start-up (batch 3, INT-1) rather than left to the developer to remember.
- **Accepted consequence: the development flow is no longer covered by any automated check.** The
  spec's "silent divergence" risk now points at the development arrangement instead of the delivered
  one. That is the deliberate trade: the arrangement nobody ships is the one left to manual use, and
  REQ-16's acceptance is a human one.
- **The end-to-end run uses a dedicated port and does not reuse a running server.** A reused process
  would serve whatever build it happens to hold, under the operator's own data directory — two
  silent failures of REQ-19 and REQ-21 at once. A dedicated port also keeps a developer's server on
  3000 and the suite out of each other's way. Decided at the coverage gate: the port is **3100**, set
  through `PORT`, with `reuseExistingServer: false`.
- **Batch 1's checks are unit-level and live in the server test tree; batch 3's are end-to-end.**
  The overlap on the failure modes is deliberate and is the spec's own argument: "we did not touch
  the API" is not evidence that requests still arrive at it the same way, and only exercising the
  delivered form proves it. Batch 1's checks are the fast feedback; batch 3's are the evidence.
- **`CLAUDE.md` is the project's instruction file; no root `README.md` is created.** Fixed at
  validation. The spec asks for no operator-facing document and excludes distribution artefacts.
- **REQ-12 is kept as a requirement, not demoted to an assumption.** Fixed at validation: "one port
  means one exposure decision" is a stated hard property of the delivered arrangement, even though
  it is closed by the absence of anything new.
- **No new dependency, and nothing copied between workspaces.** `express.static` and `res.sendFile`
  ship with Express 5; `client/dist` is consumed in place, git-ignored, with `VEXEL_CLIENT_DIST` as
  the packaging seam. Both follow `.sdd/.archi` and both are what keeps REQ-11 true.
- **Nothing persisted changes.** No preference, no analysis-cache entry, no data directory layout,
  no migration; an operator upgrading finds the product as they left it.

## Departures from the spec

**None from the spec.** One from the architecture note, created by a decision taken at validation:

- **`.sdd/.archi` currently states that the end-to-end suite keeps targeting the development flow on
  port 5173, and records "repointing it is a test-strategy decision that can be made later" as an
  assumption.** The human decided the opposite at validation — the suite moves onto the delivered
  single-process form. The plan follows the human, and batch 3's INT-4 corrects both statements in
  `.sdd/.archi`. Flagged here so the correction is a deliberate act rather than an implementer's
  improvisation. The business spec itself needs no correction: it already requires the delivered form
  to be the verified one.

## Coverage check

**Every REQ is served by at least one INT.** Each closes in a single batch; the one requirement
completed across batches is declared below.

| REQ | Closes in batch | Interventions serving it |
| --- | --- | --- |
| REQ-1 | 1 | INT-1, INT-2, INT-5 |
| REQ-2 | 1 | INT-4 |
| REQ-3 | 1 | INT-1, INT-3 |
| REQ-4 | 1 | INT-2, INT-3, INT-5 |
| REQ-5 | 1 | INT-1, INT-3 |
| REQ-6 | **3** | batch 1 INT-2, batch 1 INT-3 (the middleware intercepts neither stream nor upgrade); batch 3 INT-1 (the live specifications run against the delivered form) |
| REQ-7 | 1 | INT-2 |
| REQ-8 | 1 | INT-1, INT-3 |
| REQ-9 | 1 | INT-1, INT-3, INT-5 |
| REQ-10 | 1 | INT-1, INT-3, INT-5 |
| REQ-11 | 1 | INT-1 |
| REQ-12 | 1 | INT-2 |
| REQ-13 | 2 | INT-1, INT-2 |
| REQ-14 | 2 | INT-1, INT-2 |
| REQ-15 | 2 | INT-1, INT-2 |
| REQ-16 | 2 | INT-1, INT-3 |
| REQ-17 | 2 | INT-1 |
| REQ-18 | 2 | INT-3, INT-4 |
| REQ-19 | 3 | INT-1, INT-4 |
| REQ-20 | 3 | INT-3 |
| REQ-21 | 3 | INT-1, INT-2 |
| REQ-22 | 3 | INT-1, INT-2 |

**One requirement is completed across batches**: REQ-6 (no regression in live behaviour). Batch 1
must not break it and carries the check that says so; it **closes in batch 3**, when the live
specifications actually run against the delivered form. Every other requirement closes in the batch
that lists it.

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none.

| Batch | INT | REQ served |
| --- | --- | --- |
| 1 | INT-1 | REQ-1, REQ-3, REQ-5, REQ-8, REQ-9, REQ-10, REQ-11 |
| 1 | INT-2 | REQ-1, REQ-4, REQ-6, REQ-7, REQ-12 |
| 1 | INT-3 | REQ-3, REQ-4, REQ-5, REQ-6, REQ-8, REQ-9, REQ-10 |
| 1 | INT-4 | REQ-2 |
| 1 | INT-5 | REQ-1, REQ-4, REQ-9, REQ-10 |
| 2 | INT-1 | REQ-13, REQ-14, REQ-15, REQ-17 |
| 2 | INT-2 | REQ-13, REQ-14, REQ-15 |
| 2 | INT-3 | REQ-16, REQ-18 |
| 2 | INT-4 | REQ-18 |
| 3 | INT-1 | REQ-6, REQ-19, REQ-21, REQ-22 |
| 3 | INT-2 | REQ-21, REQ-22 |
| 3 | INT-3 | REQ-20 |
| 3 | INT-4 | REQ-19 |

**Three notes on preservation requirements**, so they are not read as thin coverage:

- REQ-2, REQ-7, REQ-12, REQ-16, REQ-17 and REQ-22 are requirements whose whole content is "this must
  still be true afterwards". No intervention *adds* them; they are closed by the intervention that
  keeps them true and by the check or acceptance that says so. That is why REQ-2 is served by a check
  alone and REQ-12 by the mount that introduces no authentication layer.
- REQ-7 (the API surface is unchanged) is additionally guaranteed by the existing server API suite,
  which is not modified by any batch and whose passing is part of batch 1's acceptance. The plan adds
  no assertion duplicating it.
- REQ-20 re-pins, in the delivered form, three behaviours batch 1 already checks at unit level. The
  duplication is the point: the spec's "false confidence from an unchanged API" risk is exactly the
  claim that a unit-level check settles how requests arrive at the server.
