---
batch: 12
feature: F12 — swarm
closed_req: [REQ-52, REQ-53, REQ-54, REQ-55, REQ-56]
depends: [5]
---

# Batch 12 — swarm

The screen that states one fact **five times**. With the daemon not in a swarm, a banner reads `Swarm
inactive · not part of a swarm` with the two actions, and **each of the four panels** then repeats
`No cluster to read — This daemon is not part of a swarm. Initialise a swarm or join an existing one
to see its nodes, services, stacks, secrets and configs.` Five statements of one fact, and the
actions that would resolve it are in the banner rather than in the empty states.

It also misaligns its bottom row: `Configs & stacks` carries a `CONFIGS` sublabel that `Secrets` does
not, so the two empty states in that row sit at different heights.

Five `CardList` call sites across the four panels (`SwarmNodesPanel:137`, `SwarmSecretsPanel:130`,
`SwarmServicesPanel:261`, `SwarmConfigsStacksPanel` for configs and for stacks).

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, swarm area | The check, written and run **first**, on a daemon that is **not** a swarm — the state the analysis measured, and the one every machine can reach. Count the statements of the inactive condition on screen: **exactly one**. Assert the two resolving actions are inside that statement's surface. Assert the two bottom-row cards' contents **start at the same y**. Report the count and the two y values before and after. | REQ-52, REQ-53, REQ-54 | — |
| INT-2 | modify | `client/src/swarm/SwarmScreen.tsx` | State the inactive condition **once**, on one surface, through the empty-state primitive, with `Initialise a swarm` and `Join an existing one` **in it** rather than in a banner above four repetitions. Both actions still do exactly what they do, with the same confirmations. The four panels stop each rendering the paragraph. | REQ-52, REQ-53 | INT-1 |
| INT-3 | modify | `client/src/swarm/SwarmNodesPanel.tsx`, `SwarmServicesPanel.tsx`, `SwarmSecretsPanel.tsx`, `SwarmConfigsStacksPanel.tsx` | Migrate all five list call sites to the object list's comfortable variant, deleting the row-content builders. Nodes managers-first then hostname order; services in name order with image, mode, replicas and ports; stacks with their nested services; secrets and configs in name order with their age. | REQ-55 | INT-1 |
| INT-4 | modify | `client/src/swarm/SwarmConfigsStacksPanel.tsx`, `client/src/swarm/SwarmSecretsPanel.tsx` | Use the section header's sublabel so that supplying one to `Configs & stacks` **does not shift `Secrets`' baseline** — the primitive guarantees it from batch 5, and this is where it is observed. | REQ-54 | INT-3 |
| INT-5 | modify | the four swarm panels | Reveal detail through the detail-panel primitive: a service with its tasks, a node, a secret's or a config's metadata — full width, two-column grid, one open at a time. **No value is ever returned or displayed** for a secret or a config; that is a security contract, not a presentation choice. | REQ-55 | INT-3 |
| INT-6 | modify | `.sdd/modules/swarm/specs/*.md`, `.sdd/modules/swarm/index.md` | Record the screen's new shape and, explicitly, that the inactive condition is stated once and carries its own actions — so the next reader does not restore a banner. English only. | REQ-52, REQ-53, REQ-55 | INT-2 … INT-5 |
| INT-7 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates. Checks that require a **swarm manager** — node inventory, service create/update/remove, stack removal, secret and config creation, the join tokens — **skip with their reason stated** rather than being quietly dropped, exactly as the certified sibling plans' did. The inactive presentation is checked unconditionally. | REQ-55, REQ-56 | INT-2 … INT-5 |

## Constraints on this batch

- **Nothing here initialises a swarm on the operator's daemon.** It is his machine and his work runs
  on it; a test that makes a manager of it has broken the first rule of the suite.
- The join tokens keep everything `plan-docker_management_app-remove_copy_controls/REQ-21` left them
  with: masked by default, revealed only by `Show`, rotatable, and **not takeable without being
  displayed**. No copy affordance returns.
- **Lower the `CardList` call-site budget in `client/scripts/check-ui-conformance.mjs` by the five
  sites removed here** — this is the largest single drop in the programme. The check fails if the
  count is higher **or** lower than expected, so the budget is lowered deliberately or the batch does
  not go green.
- Feature code composes library components and nothing else.
