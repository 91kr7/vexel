---
slug: docker_management_app-swarm_removal
date: 2026-08-27
spec: .sdd/analysis/docker_management_app-swarm_removal.md
status: validated
---

# Batches — swarm removal

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| swarm-withdrawn | The swarm area leaves the product, screen to server, and the raw console stays the way to it | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19 | — | implemented | Swarm has left the product, and the raw console is still the way to it |

One batch, so no execution order to declare. The order inside it is carried by the `Depends` column
of the batch file.

## Assumptions and decisions

- **One batch by the human's explicit instruction, and the dogma is departed from deliberately.**
  The requirements carry seven feature sections; a removal is one vertical and is verified in one
  piece, because a half-removed area is neither the old product nor the new one. See Departures.
- **The past is not touched.** `.sdd/analysis/docker_management_app.md` keeps Swarm among the areas
  it lists, and `plan-docker_management_app` and `plan-ui-coherence-optimisation` (with its
  `batch-12-swarm.md`) keep every word they have. They record what was decided and built then.
  `.sdd/analysis/ui-mock/swarm.png` lives inside `.sdd/analysis/` and stays for the same reason.
  Knowledge base: `past-analyses-and-plans-are-never-touched`.
- **Component specifications and indexes are the opposite and follow the application**, which is what
  REQ-16, REQ-17 and REQ-18 state. `CLAUDE.md` is neither an analysis nor a plan but the live
  instruction file, and its visual-reference list is the single line REQ-19 removes from it.
- **The shared elements were counted, not guessed** (REQ-14). Consumers outside `client/src/swarm/`:
  - `SecretField` → `client/src/registries/RegistriesScreen.tsx:377` (the registry login). **Stays**,
    untouched. This is the spec's own case in point.
  - `StateSummaryBar` → `client/src/console/RawConsoleScreen.tsx:182` and
    `client/src/coverage/CoverageMatrixScreen.tsx:146`. **Stays**, untouched; only the swarm wording
    of its example in the spec is restated against a surviving consumer.
  - `QuadPanelLayout` → none. Swarm was its last consumer, so it is **withdrawn**, CSS block
    included.
  - `RevealableValue` → none (`client/src/swarm/SwarmScreen.tsx:357,368`, the join tokens, was the
    only one). **Withdrawn.**
  - `Badge`, `DataTable`, `EmptyState`, `SectionHeader` and every other primitive keep consumers
    across the product and are **untouched**; their specs only stop using swarm as the example.
- **REQ-9 rests on a guard that already exists** and the batch's job is to keep it and prove it, not
  to build a fallback: `app-shell/specs/shell.md` contracts that the persisted `lastScreenId`
  restores the active screen *only if it names a known screen*, otherwise `defaultScreenId` (the
  Dashboard) stays. Once the swarm entry leaves the navigation data, a saved `swarm` names no known
  screen and the operator lands on the Dashboard. No notice, no placeholder, no migration of the
  stored value — an unknown id is already a normal state for the store to read.
  **`PlaceholderScreen` must not become the landing**: it renders for an active id naming no screen,
  and a fallback that reached it would be exactly the empty screen REQ-3 forbids.
- **The raw console is not touched at all** (REQ-10, REQ-11, REQ-15).
  `server/src/console/console-command.ts` keeps `swarm` + `leave` and `/swarm/leave` in its
  destructive recognition, and keeps its rule that everything else — `stack deploy` included — is not
  destructive. Nothing is filtered anywhere: the console renders the daemon's answer as it comes, and
  an inspect payload keeps its swarm fields. Those are checks to write, not code to change.
- **The build-time list-order guard loses one allow-list entry**, not a rule:
  `server/scripts/check-list-order-conformance.mjs` pins an exemption to the swarm task history in
  `swarm/swarm-services-service.ts`. When that file goes, the entry points at nothing; it is removed
  with it, and the rule itself is unchanged.
- **No check of this project ever initialises a swarm** (human's decision, 2026-08-27 — see
  Departures). `client/e2e/exclusive/swarm-cluster.spec.ts` and
  `server/test/exclusive/swarm-cluster-routes.test.ts` are withdrawn and nothing replaces them: a
  straight saving of daemon time, which is the point the business goal makes. REQ-7 and REQ-8 are
  proved instead by INT-25, a build-time conformance check of the kind this project already uses
  twice.
- **Why a conformance check is a real proof of REQ-7, and not a consolation prize.** REQ-7 says the
  application behaves identically on a swarm daemon and on any other. The application can only
  behave differently if it *reads* something that differs — a `/swarm` endpoint, the daemon-info
  swarm fields, the `com.docker.stack.namespace` label, a branch on a swarm state. INT-25 fails the
  build if any source file does any of those, so identical behaviour follows from the absence of
  every input that could make it differ — and it holds for **every screen at once and for every
  future one**, which no single e2e run on one swarm daemon could ever have said. REQ-8 comes from
  the same check read the other way: no listing filters a network by driver or a container by
  label, so an overlay network and a task container are listed for the same reason `bridge` is.
- **The one thing INT-25 does not prove, stated plainly**: that the daemon in swarm mode returns
  what we expect it to return. That is Docker's behaviour, not the product's, and observing it is
  what the withdrawn check would have cost a swarm on the operator's machine.
- **The coverage entries were read, not inferred.** `client/src/coverage/coverage-map.ts` holds
  `swarm-cluster`, `swarm-services`, `swarm-secrets` and `swarm-stacks` as `dedicated-screen` with
  `screenId: 'swarm'`, plus `swarm-stack-deploy`, already `console-only`, whose reason ends "…is
  covered by the Swarm screen". The map's own invariant — every `screenId` names an entry of the
  navigation data — makes reclassifying the four compulsory the moment the navigation entry goes,
  and REQ-12 makes the fifth's wording go with them.
- **`countCoverage` is not touched**: `total` does not move, four entries change state. The About
  screen keeps reporting the same total with four fewer dedicated screens.

## Departures

- **One batch, not seven.** The method's dogma is one batch per feature and this plan carries seven
  feature sections. The human instructed a single batch: "la rimozione è una sola verticale, va
  eseguita e verificata in un colpo solo". This is a departure from the **method**, not from the
  spec, so **nothing here asks for a correction to the business spec**. The cost accepted: no part of
  the removal can be certified on its own, and the batch closes only when the whole vertical is green.
- **No check of this project ever initialises a swarm — the human's decision, taken on 2026-08-27 at
  the coverage validation, not the planner's.** The plan as first written carried one exclusive
  check (INT-24) that put the daemon into swarm mode for its duration and took it out again, because
  REQ-7 and REQ-8 cannot be *observed* otherwise: an overlay network cannot be created without a
  swarm and `ingress` does not exist without one. The human was shown that and chose the other
  option: nothing in this suite ever touches the operator's daemon's swarm membership. INT-24 is
  withdrawn; INT-25 replaces it.

  **The cost accepted, in plain terms, for whoever reads this in six months.** This is a renunciation
  of observability, and it is deliberate. What was given up: nobody will ever *see* the product
  running against a swarm daemon under an automated check. If Docker one day reports an overlay
  network or a task container in a shape the generic screens mishandle, no check of ours will catch
  it — the first to notice will be an operator with a swarm. What was kept: INT-25 proves, at build
  time and across the whole source tree, that the application reads nothing of the daemon's swarm
  and filters no network by driver and no container by label, which is a **stronger** guarantee than
  the withdrawn check gave on the one thing that is actually ours to get wrong, and a weaker one on
  the one thing that is not. The manual scenario stays in the batch file, marked manual, so the
  observation is available to a human who has a swarm and wants it.

  Reinstating INT-24 is a decision about what the suite may do to the operator's machine, not a
  technical oversight to be quietly corrected: do not add a swarm-initialising check back because
  this coverage looks thin.
- **No departure from the spec is recorded.** Every decision above sits inside what the spec states
  or explicitly assumes; both departures are departures from the **method** or from the plan's own
  first draft, so **nothing here asks for a correction to the business spec**.

## Coverage check

Every REQ is served by at least one INT:

| REQ | Served by | Closes in |
|-----|-----------|-----------|
| REQ-1 | INT-1, INT-5, INT-6, INT-7, INT-20, INT-22 | swarm-withdrawn |
| REQ-2 | INT-7, INT-22 | swarm-withdrawn |
| REQ-3 | INT-5, INT-6, INT-22, INT-25 | swarm-withdrawn |
| REQ-4 | INT-2, INT-7, INT-8, INT-22 | swarm-withdrawn |
| REQ-5 | INT-1, INT-2, INT-4, INT-21, INT-22 | swarm-withdrawn |
| REQ-6 | INT-3, INT-9, INT-10, INT-21, INT-22 | swarm-withdrawn |
| REQ-7 | INT-25 | swarm-withdrawn |
| REQ-8 | INT-25 | swarm-withdrawn |
| REQ-9 | INT-6, INT-22 | swarm-withdrawn |
| REQ-10 | INT-23 | swarm-withdrawn |
| REQ-11 | INT-21, INT-23 | swarm-withdrawn |
| REQ-12 | INT-11, INT-22 | swarm-withdrawn |
| REQ-13 | INT-4, INT-12, INT-20, INT-21, INT-25 | swarm-withdrawn |
| REQ-14 | INT-12 | swarm-withdrawn |
| REQ-15 | INT-23, INT-25 | swarm-withdrawn |
| REQ-16 | INT-13, INT-17, INT-18 | swarm-withdrawn |
| REQ-17 | INT-15, INT-16 | swarm-withdrawn |
| REQ-18 | INT-14, INT-16, INT-17, INT-18 | swarm-withdrawn |
| REQ-19 | INT-19 | swarm-withdrawn |

Every INT serves at least one REQ — INT-1 to INT-23 and INT-25, with **no enabling intervention**
among them. **INT-24 is withdrawn** (see Departures) and its number is not reused: ids are stable,
and a struck row is clearer than a silent gap to whoever implements this.

No REQ is split across batches: there is one batch, and all nineteen close in it.

**Three notes on the shape of this coverage, deliberate.**

- **Four requirements are prohibitions**, and a prohibition is served by an intervention that proves
  the thing did not move, not by one that changes it. REQ-13 (no other area changes) is carried by
  INT-12, INT-20, INT-21 and INT-25 — the interventions that decide what is *not* withdrawn and keep
  the surviving checks green; REQ-15 (the faithful views keep the daemon's swarm fields) by INT-23,
  which observes that an inspect payload and the console output are still rendered whole, and by
  INT-25, which establishes that no filter exists to remove a field. Nothing in the batch edits an
  inspect view or a console filter, and that absence is the requirement being met.
- **REQ-7 and REQ-8 rest on one intervention each, INT-25, and on a proof of a different nature** —
  by construction at build time rather than by observation on a running swarm. That is the human's
  decision of 2026-08-27 and its cost is written out in Departures. It is named here rather than
  hidden: if INT-25 is not written, those two requirements have nothing behind them and the batch
  does not close by declaring them obvious.
- **Checked after INT-24's withdrawal, not assumed**: REQ-15 was its third requirement and it holds
  without it — INT-23 observes the whole payload and INT-25 forbids the filter. No other requirement
  named INT-24 anywhere in this plan.
