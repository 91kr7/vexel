---
batch: 5 · one-rule-everywhere
feature: F5 — The seven already-ordered lists on the same rule, and nothing else moved
closed_req: REQ-23, REQ-24, REQ-25, REQ-26, REQ-27
depends: 1
---

# Batch 5 — The seven already-ordered lists on the same rule

Seven list services already order by name. They do it with a bare `localeCompare` and **no
tiebreaker**, which means they carry both defects this item exists to remove: the order depends on
the host's collation settings (REQ-4), and it is partial — two swarm nodes whose hostnames differ
only in case, two stacks `app-1` and `app-01`, shuffle exactly like the six reported panels. Adopting
the shared rule is a gain, not tidiness.

Requirements are in `../requirements.md` and are cited here by id only.

## The two ways this batch does damage if done carelessly

**By flattening a grouping that is doing work.** Three of the seven order by something *before* the
name, and each of those groupings is deliberate. Only the comparison of names changes (REQ-24):

| Service | Grouping that must survive |
| --- | --- |
| `registries-service.ts` | official entries before host-only ones |
| `swarm-nodes-service.ts` | managers before workers |
| `swarm-stacks-service.ts` | a stack's services stay nested inside their stack |

**By alphabetising something chronological or structural.** These lists are ordered correctly today
and must not be touched (REQ-26): an image's layer stack and build history, log / console / terminal
output, the daemon event stream, command history, the **swarm task history**
(`swarm-services-service.ts` sorts tasks by timestamp descending — that is not a name comparison and
is not in this batch), and every path-ordered or size-ranked output of `image-analysis`
(`image-diff-service.ts`, `filesystem-extraction-service.ts`, `secret-pattern-scan.ts`,
`layer-duplicate-detection.ts`, `layer-waste-analysis.ts`). Batch 1's conformance guard already
allow-lists exactly these; if this batch has to widen that allow-list, something is wrong.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `server/src/swarm/swarm-services-service.ts` | The **service listing** orders by name under batch 1's rule, with the service id as the final comparison. The task history in the same file is untouched. | REQ-23, REQ-25 | — |
| INT-2 | modify | `server/src/swarm/swarm-stacks-service.ts` | Stacks order by name under the rule, and the services nested inside each stack order by name under the same rule. A stack has no identity but its name, so the final comparison is the name compared exactly. The nesting is unchanged. | REQ-23, REQ-24, REQ-25 | — |
| INT-3 | modify | `server/src/swarm/swarm-nodes-service.ts` | **Managers still come before workers**; within a role, hostnames order under the rule, with the node id as the final comparison. | REQ-23, REQ-24, REQ-25 | — |
| INT-4 | modify | `server/src/swarm/swarm-secrets-service.ts` | Secrets and configs order by name under the rule, with the item id as the final comparison. | REQ-23, REQ-25 | — |
| INT-5 | modify | `server/src/plugins/daemon-plugins-service.ts` | Daemon plugins order by name under the rule, with the plugin's own identity as the final comparison. | REQ-23, REQ-25 | — |
| INT-6 | modify | `server/src/plugins/cli-plugins-service.ts` | CLI plugins order by name under the rule; a CLI plugin has no identity but its name, so the final comparison is the name compared exactly. | REQ-23, REQ-25 | — |
| INT-7 | modify | `server/src/registries/registries-service.ts` | **Official entries still come first**; within each group, hosts order under the rule, with the host compared exactly as the final comparison. | REQ-23, REQ-24, REQ-25 | — |
| INT-8 | modify | `server/test/unit/swarm-services-service.test.ts`, `server/test/unit/swarm-stacks-service.test.ts`, `server/test/unit/swarm-nodes-service.test.ts`, `server/test/unit/swarm-secrets-service.test.ts`, `server/test/unit/daemon-plugins-service.test.ts`, `server/test/unit/cli-plugins-service.test.ts`, `server/test/unit/registries-service.test.ts` | For each: a digit-suffixed pair ordered numerically, a tie separated by that list's identity, the payload supplied **both ways round** producing one result (REQ-6's shape), and — for the three that group — an assertion that the grouping still comes first. Any existing assertion that only passed because the stubbed list arrived in the order it was written in is **corrected, never loosened into accepting any order**: a check that accepts any order asserts nothing, which is the state this fix exists to leave behind (REQ-27). | REQ-23, REQ-24, REQ-25, REQ-27 | INT-1 … INT-7 |
| INT-9 | modify | the seven services above, and nothing else under `server/src/` | The negative half, and it is verified rather than assumed: confirm by `git diff` that **no file outside those seven and their tests is touched**, and that no comparison in the meaning-carrying list above has changed. Batch 1's conformance guard passing without its allow-list being widened is the mechanical part of this; reading the diff is the rest. | REQ-26 | INT-1 … INT-8 |

## Done when

- Swarm, Plugins and Registries panels keep their groupings, and digit-suffixed names read `-2`
  before `-10`.
- Layer stacks, histories, logs, the event feed, console history and the analysis trees are
  untouched.
- `npm run test:typecheck -w server` passes and the seven unit files pass, run narrowed: from
  `server/`, `node --experimental-test-module-mocks --import tsx --test-reporter=dot --test test/unit/<file>.test.ts`.
- Batch-scoped runs only. The full unit suite and the e2e suite are not this batch's business.
