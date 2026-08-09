---
batch: 3 · delivered-form-verification
feature: F3 — The delivered form is the form that is verified
closed_req: [REQ-6, REQ-19, REQ-20, REQ-21, REQ-22]
depends: [1, 2]
---

# Batch 3 — The suite moves onto the delivered form

The end-to-end suite stops driving the development server and drives the product as it ships: the
client is built, the single Express process serves it, and every existing specification runs against
that. The human's reasoning at validation, recorded verbatim in intent: *if we remove one of the two
servers, then by force everything runs on the new server — the tests too.*

This is what closes REQ-6. Batch 1 proved the middleware does not intercept the streams; only the
suite running against the built application proves that log follow, live statistics, the daemon event
stream, interactive sessions and the long analyses behave identically there.

**The accepted cost**, stated once so nobody treats it as an obstacle: every end-to-end run now pays
a client build first. It belongs in the suite's own start-up, not in the developer's habits.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/playwright.config.ts` | Point the suite at the delivered form. `baseURL` becomes the single process's origin; the two `webServer` entries collapse into **one**, which builds the product and then starts the built server — the Vite entry goes, and with it the last specification targeting port 5173 (REQ-19). Every specification keeps running unchanged: they address the application through `baseURL` and relative paths, so none of them has to know the arrangement changed. **Four traps.** (a) The build cannot live in `globalSetup` — Playwright starts the web servers *before* that hook, as the hook's own comment records; it has to be part of the `webServer` command. (b) The readiness `url` must be the server's own liveness address, and the `timeout` must cover a full client **and** server build, not the 30 s that sufficed for a dev server. (c) The port: the delivered process runs on **port 3100** through `PORT`, not the developer's 3000, and `reuseExistingServer` is **off** — a reused process would serve whatever build it happens to hold, under the operator's own data directory, and both failures are silent. (d) Everything that makes the suite trustworthy stays exactly as it is: one worker, `fullyParallel: false`, the dot reporter, `globalSetup`, the `chromium` project and the `exclusive` project depending on it so the destructive specifications run last and apart (REQ-21). Nothing outside the end-to-end wiring is touched — no unit, typecheck, UI-boundary or server pass changes (REQ-22). | REQ-6, REQ-19, REQ-21, REQ-22 | — |
| INT-2 | modify | `client/e2e/support/global-setup.ts` | Keep the two isolation guarantees true in the new arrangement and say so where they are implemented: the throwaway data directory is still removed **and recreated** before any specification runs — the built server, like the dev one, creates it on import, so emptying it is not enough — and the three base images are still pulled once up front (REQ-21). The comment must name the arrangement it now describes, or the next reader will debug against a description of a flow that no longer exists (REQ-22). | REQ-21, REQ-22 | INT-1 |
| INT-3 | create | client end-to-end tree (`client/e2e/`) | The specifications that pin the failure modes this change introduces, against the process the suite now runs (REQ-20): an unrecognised address under `/api` answers as the API's JSON error and never as the interface's page; an ordinary page request to an arbitrary path answers with the interface, and the application opens on the screen it persisted as last active rather than a server "not found" (REQ-3 in the delivered form); and a server started with its interface directory pointed at a missing path serves its API and reports the stated reason — spawned by the specification on a spare port and killed in a `finally`, since the suite's own process always has a build. These are the exact defects the analysis calls the most expensive to diagnose later, and they cannot be caught by a suite that only clicks through screens. | REQ-20 | INT-1 |
| INT-4 | modify | `.sdd/.archi` (the "Commands" section and the "Single-process serving" assumptions) | Correct the two statements the human's decision superseded: that the end-to-end suite drives the development flow and points `baseURL` at 5173, and the assumption that it keeps targeting that flow with repointing left as a later decision. Both must state what is now true — the suite drives the delivered single-process form, and the development flow survives for manual work with hot reload only. Left as they are, the architecture file would contradict the repository on the one point this change exists to settle. | REQ-19 | INT-1 |

## Out of this batch

No specification is rewritten, split, retimed or removed to suit the new arrangement: if one fails
because it depended on the development server, that is a finding about the delivered form, not a
specification to adjust. No second Playwright project running the same specifications twice, and no
suite left behind on the development flow — one delivered form, verified once. No change to the
server's own passes (typecheck, unit, API, exclusive), to the client's unit, typecheck or
UI-boundary passes, to the sweep and base-image scripts, or to the ownership-label discipline.

## Human acceptance

`npm run test:e2e -w client` builds the product, starts one process serving it on port 3100, and
runs the whole suite against that single origin — no Vite server is started at any point, and
nothing listens on 5173 during the run. Every specification that passed before passes now, including the live ones:
streamed logs, live statistics, the daemon event stream, an interactive session and a long analysis.
The suite still runs with one worker, still wipes and recreates its own throwaway data directory
before any specification (leaving `~/.vexel` untouched), still pulls the three base images once up
front, and still runs the destructive `exclusive` specifications last and apart. Running a single
specification file on its own still passes. A developer with `npm run dev:server` already running on
port 3000 does not disturb the run, and the run does not disturb them. New specifications fail
usefully when broken on purpose: an unknown `/api` address answered with the interface, or a page
request answered with a 404, each turns its own specification red. `npm run test` from the root
passes end to end, with the server passes and the client's unit, typecheck and UI-boundary passes
unchanged. `.sdd/.archi` no longer says the end-to-end suite targets the development flow.
