---
batch: 2 · one-command-and-instructions
feature: F2 — One command builds it, one runs it; the development loop is untouched
closed_req: [REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18]
depends: [1]
---

# Batch 2 — One command, and instructions that say which one

Batch 1 made the server capable of being the whole application. This batch is what an operator
actually sees of that: one command at the root that builds and runs it, one that runs an existing
build, the development commands untouched beside them, and a written statement of which is which.

**The command names are not open.** The human fixed at validation that the root scripts already
committed (`start` = `npm run build && npm run serve`, `serve` = `npm start -w server`, `build` =
client then server) and the `.sdd/.archi` "Commands" section are the **target contract**. This batch
verifies, orders and documents them; it does not rename or redesign them. Where a script already
satisfies its requirement, the intervention is to establish that it does — and to fix it if it does
not — not to rewrite it.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | root `package.json` (scripts) | Establish that the four operator-facing scripts hold the contract, and correct whatever does not. `start` builds then serves, in that order, and does not serve when the build failed — the chain must propagate failure, so a broken build can never leave the operator looking at the previous build as if the command had worked (REQ-13, REQ-15). `build` builds the client **before** the server, since the server serves the client's output (REQ-15). `serve` runs the built process without rebuilding, so restarting costs no build time (REQ-14). None of them starts a second process, and none of the development scripts is touched, renamed or reordered (REQ-16, REQ-17). Keep the explanatory `//` keys next to the scripts they justify; they are the reason the order is not "cleaned up" by the next reader. | REQ-13, REQ-14, REQ-15, REQ-17 | — |
| INT-2 | create | server test tree (`server/test/unit/`) — or the smallest place a check of repository metadata belongs | A check that the delivered command chain still says what it means: the root `start` script builds before it serves, `build` builds the client before the server, and `serve` invokes the built server without a build step. A drift here is silent and expensive — a reordered chain serves the previous build and every symptom looks like an application defect. Cheap to assert, since all three are strings in the root `package.json`. | REQ-13, REQ-14, REQ-15 | INT-1 |
| INT-3 | modify | `CLAUDE.md` (repository root) | Replace the single flat command list with the two arrangements, plainly separated and each labelled with who runs it (REQ-18): **running the product** — one root command that builds and runs it, one that runs an existing build, one port, the `PORT` and `VEXEL_CLIENT_DIST` knobs, and the fact that a server started without a build runs API-only and says so; **developing** — the two-process Vite flow with hot reload, for manual work only, no longer what any automated check drives (REQ-16). State the ordering fact once, where it will be read: the client is built before the server because the server serves the client's output. Nothing else in `CLAUDE.md` moves — the UI-library rule and the testing rule are untouched by this change. | REQ-16, REQ-18 | INT-1 |
| INT-4 | modify | repository instruction files outside `CLAUDE.md` (`client/README.md`, and any other instruction text a search turns up) | Sweep for anything still presenting the two-process development flow as the way to *run* the product, and correct only that (REQ-18). `.sdd/.archi` is already written for the target arrangement and is not rewritten here (its one stale sentence about the end-to-end suite belongs to batch 3, which is what makes it stale). `client/README.md` is the stock Vite template text: leave it alone unless it actually instructs someone to run the application that way. **No root `README.md` is created** — the human ruled it out at validation, and the spec asks for no operator-facing document. | REQ-18 | INT-3 |

## Out of this batch

Any new script name, any process manager, any packaging artefact (container image, service unit,
published package) — all out, by the spec. No root `README.md`. No change to the development
scripts' behaviour, ports or proxy. No change to the test scripts: batch 3 owns those.

## Human acceptance

From a clean checkout with `client/dist` and `server/dist` removed, `npm start` at the repository
root builds the client, then the server, then serves the complete application on one port, with
nothing else started and no ordering to know; the operator's whole instruction set is that one line.
Breaking the client build on purpose makes `npm start` stop with a failure and **not** serve — it
never falls back to the previous build. `npm run serve` on an existing build starts the process
immediately, with no rebuild. `npm run dev:server` and `npm run dev:client` still behave exactly as
before: two processes, hot reload, an edit to a client source file visible in the browser without a
build and without restarting anything, the development interface still reaching the API, the event
stream and an interactive session through its proxy; and the development flow still needs no
`client/dist`, while `npm start` needs no Vite server. `CLAUDE.md` states the two arrangements
separately, says which is the operator's and which is the developer's, and no instruction anywhere
in the repository still tells someone to run the product with the development flow. There is no root
`README.md`.
