---
batch: swarm-withdrawn
feature: The swarm area leaves the product, screen to server, and the raw console stays the way to it
closed_req: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19
depends: —
---

# Batch — swarm withdrawn

The requirements are in `../requirements.md` and are cited here by id only.

Two things this batch must not do, stated before the table because they are what a removal gets
wrong: **it does not touch any earlier analysis or plan** (they are a record — knowledge base
`past-analyses-and-plans-are-never-touched`), and **it withdraws a shared element only where swarm
was its last consumer**, which was counted rather than guessed (see `../batches.md`, "Assumptions
and decisions").

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/index.ts` | Stop constructing and mounting the swarm router. The mount order of everything else is load-bearing and does not move; no other router changes. | REQ-1, REQ-5 | — |
| INT-2 | modify | `server/src/swarm/` — `swarm-state-service.ts`, `swarm-nodes-service.ts`, `swarm-services-service.ts`, `swarm-stacks-service.ts`, `swarm-secrets-service.ts`, `swarm-routes.ts` | Withdraw the whole directory. No swarm state, node, service, task, stack, secret or config capability remains on the server, and no `/api/swarm/*` address answers. | REQ-4, REQ-5 | INT-1 |
| INT-3 | modify | `server/src/system/overview-service.ts` | The host overview stops reading the daemon's services for a stack count: `stacks` reports compose projects alone, and the swarm count and its unavailability reason leave the payload. Every other section of the overview is unchanged. | REQ-6 | — |
| INT-4 | modify | `server/scripts/check-list-order-conformance.mjs` | Remove the allow-list entry pinned to the swarm task history in `swarm/swarm-services-service.ts`, which after INT-2 exempts a file that does not exist. The ordering rule itself and every other allow-list entry are unchanged. | REQ-5, REQ-13 | INT-2 |
| INT-5 | modify | `client/src/shell/navigation.ts` | Remove the Swarm entry. Workloads keeps Dashboard, Containers and Compose; the navigation carries twelve entries, and nothing takes the removed one's place — no disabled item, no separator left behind. | REQ-1, REQ-3 | — |
| INT-6 | modify | `client/src/shell/Shell.tsx` | Stop rendering the swarm screen for the `swarm` id and drop its import. **Keep** the existing restore guard — the persisted last screen is restored only when it names a known screen — so a saved `swarm` leaves the default screen (the Dashboard) active, with no notice and no `PlaceholderScreen`. | REQ-1, REQ-3, REQ-9 | INT-5 |
| INT-7 | modify | `client/src/swarm/` — `SwarmScreen.tsx`, `SwarmNodesPanel.tsx`, `SwarmServicesPanel.tsx`, `SwarmSecretsPanel.tsx`, `SwarmConfigsStacksPanel.tsx`, `swarm-formatting.ts` | Withdraw the whole directory: the screen, its four panels, the cluster banner with init/join/leave and the join tokens, and the formatting used by them alone. | REQ-1, REQ-2, REQ-4 | INT-6 |
| INT-8 | modify | `client/src/data/swarm-client.ts`, `client/src/data/use-swarm.ts`, `client/src/data/use-swarm-service-detail.ts` | Withdraw them, together with their event subscriptions and their poll. No client code reads a swarm address any longer. | REQ-4 | INT-7 |
| INT-9 | modify | `client/src/dashboard/DashboardScreen.tsx` | The `Stacks` tile counts compose projects only and its sub-label stops naming swarm — no "· no swarm", no swarm figure, and no residue of the unavailability wording. The tile keeps its place, its navigation and its behaviour. | REQ-6 | INT-10 |
| INT-10 | modify | `client/src/data/system-client.ts` | The overview type follows INT-3: the swarm stack count and its unavailability reason leave it. | REQ-6 | INT-3 |
| INT-11 | modify | `client/src/coverage/coverage-map.ts` | `swarm-cluster`, `swarm-services`, `swarm-secrets` and `swarm-stacks` become `console-only`, each losing its `screenId` and gaining the command that reaches it and the reason it has no screen — the same form as the areas reclassified on 2026-08-07. `swarm-stack-deploy` keeps its state and is reworded so it no longer justifies itself by naming the Swarm screen. The entries are not deleted, no entry is added, and the total does not move. | REQ-12 | INT-5 |
| INT-12 | modify | `client/src/ui/` — `layout/QuadPanelLayout.tsx` and its block in `layout/layout.css`, `controls/RevealableValue.tsx`, and the two exports in `index.ts` | Withdraw exactly these two, swarm having been their last consumer. **Leave untouched** `SecretField` (still the registry login's), `StateSummaryBar` (still the raw console's and the coverage screen's), `Badge`, `DataTable`, `EmptyState`, `SectionHeader` and every other primitive, tokens and the glass material included. | REQ-13, REQ-14 | INT-7 |
| INT-13 | modify | `.sdd/modules/swarm/` | Withdraw the module: its `index.md` and its twelve component specifications. | REQ-16 | INT-15 |
| INT-14 | modify | `.sdd/modules/modules.md` | Remove the swarm row. No other row changes. | REQ-18 | INT-13 |
| INT-15 | modify | `.sdd/modules/ui-library/specs/empty-state.md` | Absorb the DEF-2 account that today lives only in `swarm/specs/swarm-secrets-panel.md` — the name-collision reasoning and the ellipsis question it deliberately leaves open — so it survives its host, and restate its illustrations against surviving screens instead of the swarm inventories and `client/e2e/exclusive/swarm-cluster.spec.ts`. | REQ-17 | — |
| INT-16 | modify | `.sdd/modules/plugins/specs/plugins-screen.md`, `.sdd/modules/builders/specs/builders-screen.md`, `.sdd/modules/contexts/specs/contexts-screen.md`, `.sdd/modules/volumes-networks/specs/volumes-panel.md`, `.sdd/modules/volumes-networks/specs/networks-panel.md` | Repoint each DEF-2 citation at the surviving account from INT-15. Nothing else in these specs changes: the screens themselves are untouched. | REQ-17, REQ-18 | INT-15 |
| INT-17 | modify | `.sdd/modules/app-shell/specs/shell.md`, `.../navigation-data.md`, `.../placeholder-screen.md`; `.sdd/modules/dashboard/specs/dashboard-screen.md`; `.sdd/modules/system/specs/overview-service.md`, `.../system-endpoints.md`; `.sdd/modules/coverage/specs/coverage-map.md`; `.sdd/modules/list-order/specs/list-order-conformance-check.md`; `.sdd/modules/ui-library/specs/content-columns.md`, `.../data-table.md`, `.../badge.md`, `.../state-summary-bar.md`; `.sdd/modules/containers/specs/containers-screen.md` | Carry each code change of this batch into the spec of the component it changed, in the same turn: the twelve navigation entries, the screens the shell renders, the stack tile's sub-label, the overview payload, the coverage entries' states, the list-order allow-list. Where swarm survives only as an **example** — the data-table's list of screens, the badge pair, the state-summary title, the containers screen's enumeration of tables, the content-columns rows for the swarm panels — restate it against a surviving screen rather than deleting the rule. | REQ-16, REQ-18 | INT-1, INT-3, INT-4, INT-5, INT-6, INT-9, INT-11, INT-12 |
| INT-18 | modify | `.sdd/modules/ui-library/index.md`, `.sdd/modules/ui-library/specs/quad-panel-layout.md`, `.sdd/modules/ui-library/specs/revealable-value.md`, `.sdd/modules/system/index.md` | Withdraw the specifications of the two components INT-12 withdrew and their index rows; correct the system index's row for the overview service. No index row is left describing something the application no longer has. | REQ-16, REQ-18 | INT-12, INT-17 |
| INT-19 | modify | `CLAUDE.md` | The "Visual reference" list drops `swarm`. This is the only change to this file. | REQ-19 | — |
| INT-20 | modify | client check tree — `client/e2e/swarm.spec.ts`, `client/e2e/swarm-row-geometry.spec.ts`, `client/e2e/exclusive/swarm-cluster.spec.ts`, `client/e2e/support/swarm-reading.ts`, `client/e2e/support/screen-inventories.ts`, `client/e2e/support/classic-table.ts`, and the unit checks of the withdrawn components | Withdraw the checks whose subject no longer exists and take swarm out of every enumeration a sweep walks — the screen inventories, the classic-table sweep, the nav-rail, truncation, property-column, copy-affordance and closing-invariant sweeps. A sweep loses one screen; it keeps every assertion it makes about the others. | REQ-1, REQ-13 | INT-7, INT-8, INT-12 |
| INT-21 | modify | server check tree — `server/test/unit/swarm-*.test.ts`, `server/test/api/swarm-routes.test.ts`, `server/test/exclusive/swarm-cluster-routes.test.ts`, `server/test/unit/overview-service.test.ts`, `server/test/api/system-overview-routes.test.ts`, `server/test/unit/list-order-conformance-check.test.ts`, `server/test/unit/console-command.test.ts` | Withdraw the checks of the withdrawn services and routes; update the overview checks to the payload INT-3 leaves and the allow-list check to INT-4. **The console-command check keeps its `swarm leave` cases** — they are the safety net of a command that stays executable. | REQ-5, REQ-6, REQ-11, REQ-13 | INT-2, INT-3, INT-4 |
| INT-22 | create | client check tree, e2e | One check that the area is gone and nothing dead is left: the navigation offers no swarm entry and no path reaches a swarm view; no cluster action, join token, node, service, stack, secret or config list is reachable anywhere; the application's swarm addresses answer as unknown addresses; an operator whose saved state named the removed screen lands on the default screen, working, with no error, no blank view and no notice; the Coverage screen still lists the swarm areas, now console-only with their reason. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-9, REQ-12 | INT-6, INT-11 |
| INT-23 | create | client check tree, e2e — the raw console | One check that the escape hatch is intact: a swarm command typed into the console runs, is neither refused nor rewritten, and its output is shown as the daemon returns it; a destructive swarm command still raises the console's warning before it runs; and an inspect payload is still rendered whole, field for field, as the daemon returns it. Real pointer on the visible controls. | REQ-10, REQ-11, REQ-15 | INT-6 |
| ~~INT-24~~ | ~~create~~ | ~~client check tree, e2e exclusive~~ | **Withdrawn on 2026-08-27 by the human's decision — do not implement.** It would have put the daemon into swarm mode for the duration of one check. No check of this project ever initialises a swarm. REQ-7 and REQ-8 are served by INT-25 instead; see "Departures" in `../batches.md` for the cost accepted. | — | — |
| INT-25 | create | client and server source trees — a build-time conformance check, of the same kind as `client/scripts/check-ui-conformance.mjs` and `server/scripts/check-list-order-conformance.mjs`, run by `npm run lint` / `npm run test` | The check fails if any source file of the application reads the daemon's swarm at all: no request to a `/swarm` path, no read of the daemon-info swarm fields or of the `com.docker.stack.namespace` label, no branch on a swarm state, no import from a withdrawn swarm module. **Two files are allow-listed by name, and only two**: `server/src/console/console-command.ts`, whose destructive recognition of `swarm leave` is the console's safety net (REQ-11), and `client/src/coverage/coverage-map.ts`, whose swarm entries REQ-12 requires. It is **not a ban on the word** — the allow-list and this wording are one decision written twice, and they change together. It also proves REQ-8 from the other side: nothing filters a network by driver or a container by label, so what the daemon returns is what is listed. Being a new component, it gets its own specification and index row in the same turn, beside the rule it guards — `list-order` is the precedent for where a check of this kind lives. | REQ-3, REQ-7, REQ-8, REQ-13, REQ-15 | INT-2, INT-7, INT-8, INT-11, INT-12 |

## Human acceptance

### Scenario: Swarm has left the product, and the raw console is still the way to it

- REQ → REQ-1, REQ-2, REQ-3, REQ-10
- Given → the application is open on any screen
- When → the operator looks through the navigation for swarm, and then types `docker node ls` into the raw console
- Then → the navigation offers no swarm entry, nothing disabled and no notice where one used to be, and no screen offers to initialise, join or leave a cluster or to show a join token
- And → the console runs the command and shows the daemon's answer exactly as the daemon gives it

### Scenario: No swarm object can be listed or acted upon

- REQ → REQ-4, REQ-5
- Given → the application is open
- When → the operator looks for a list of nodes, services, tasks, stacks deployed to a cluster, secrets or configs on every screen the product has
- Then → none of them exists anywhere, and the application answers a request for one as it answers any address it does not have

### Scenario: The operator who left the application on the Swarm screen comes back to a working one

- REQ → REQ-9
- Given → the operator's last visit ended on the Swarm screen, and the application has saved that
- When → the operator opens the application again
- Then → the Dashboard is shown, complete and working, with no error, no blank area and no message about a screen that has gone

### Scenario: The dashboard counts only the stacks that are left

- REQ → REQ-6
- Given → the operator is on the Dashboard, on a host with compose projects
- When → the operator reads the Stacks tile
- Then → the tile counts the compose projects and its sub-label speaks of compose alone — no swarm figure, and no "no swarm"
- And → the daemon information the System screen curates says nothing about a cluster either

### Scenario: A daemon that is in a swarm is treated like any other daemon

**Manual only — no automated check arranges this `Given`, by the human's decision of 2026-08-27: no
check of this project ever initialises a swarm.** The automated proof of REQ-7 and REQ-8 is INT-25,
which establishes by construction that the application reads nothing of the daemon's swarm and
filters no network by driver and no container by label. This scenario is what a human performs on a
machine that already has a swarm, if they ever want to see it.

- REQ → REQ-7, REQ-8, REQ-15
- Given → the daemon the application is connected to is part of a swarm and is running a service
- When → the operator moves through the application, opens the networks screen and the containers screen, and inspects one of the objects there
- Then → the interface states nothing about the cluster and offers nothing to do about it, exactly as on a daemon that is in no swarm
- And → the overlay and `ingress` networks are listed with the other networks, the service's task container with the other containers, and the inspect payload still shows every field the daemon puts in it, the swarm ones included

### Scenario: A destructive swarm command is still announced before it runs

- REQ → REQ-11
- Given → the operator is on the raw console
- When → the operator types `docker swarm leave --force` and submits it
- Then → the console warns what the command will do before running it, exactly as it does for a prune or a forced removal

### Scenario: The Coverage screen still admits swarm, and says how it is reached

- REQ → REQ-12
- Given → the operator opens the coverage statement from the About screen
- When → the operator reads the swarm entries
- Then → the swarm cluster and nodes, services, secrets and configs, stacks and stack deployment are all still listed, each marked reachable from the console only, each naming its command and its reason, and none of them pointing at a screen that no longer exists

### Scenario: Every other screen is exactly where it was

- REQ → REQ-13, REQ-14
- Given → the application after the removal
- When → the operator visits containers, images, volumes and networks, compose, registries, builders, contexts, plugins, system and the raw console
- Then → each behaves and looks as it did before, compose projects included
- And → the registry login still offers its masked password field, unchanged

### Scenario: The documented structure no longer describes a screen that is gone

- REQ → REQ-16, REQ-17, REQ-18, REQ-19
- Given → the project's component specifications and their indexes
- When → a reader opens the modules index and follows the cross-references of the surviving screens
- Then → no swarm module and no swarm specification is listed, no surviving specification points at one, the shared graphical decision the builders, contexts and plugins material relies on is found in full in a document that is still there, and the project's instruction file no longer names a swarm screen among the visual references
