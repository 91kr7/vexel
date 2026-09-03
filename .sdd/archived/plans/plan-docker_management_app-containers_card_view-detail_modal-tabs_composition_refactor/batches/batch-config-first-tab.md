---
batch: config-first-tab
feature: F1b — Config is the first tab and the one active on open
closed_req: [REQ-11, REQ-12]
depends: [stable-detail-height, detail-identity-header]
---

# Batch — The tab drawn first and the tab opened on become the same one

The smallest point of the nine, and one the mock states inside its F1 section rather than beside it.
Today the detail opens on Config while Logs is drawn first: either it opens on the first tab, or
Config moves to the head. The mock takes the second, because Config is the most frequent reason to
open the detail at all.

**The muted `Exec` and `Attach` in four of the mock's figures are a drafting device**, marking the two
tabs it makes no proposal about — confirmed by the mock's author. They are not a permanent
de-emphasis, and REQ-12 exists so nobody builds one from the drawing.

It depends on `detail-identity-header` for one reason only: both rewrite the same checks, and doing
them in the other order rewrites them twice.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/containers/ContainerDetailPanel.tsx` | Config becomes the first entry of the tab row, the others following it as Logs, Stats, Processes, Inspect and — for a running container — Exec, Attach; the tab active when the detail opens is that same first one. The seven are declared alike, none of them passed a disabled, ghosted or otherwise lesser presentation. | REQ-11, REQ-12 | — |
| INT-2 | modify | `client/e2e/containers.spec.ts`, `client/e2e/container-detail-density.spec.ts`, `client/e2e/container-stats-processes.spec.ts`, `client/e2e/container-logs.spec.ts`, `client/e2e/container-exec-attach.spec.ts`, `client/test/unit/container-detail-panel.test.tsx` | Every check that reaches a tab by its position, or that assumes the opened-on tab is not the first, is rewritten against the new order rather than deleted; one of them asserts that the seven tabs are drawn alike with only the active one distinguished, on a running container. | REQ-12, REQ-43, REQ-44, REQ-45 | INT-1 |

**Standing constraints on every intervention above** — REQ-38, REQ-39, REQ-40, REQ-41, REQ-42. They
are closed in the plan's last batch and honoured in this one.

## Human acceptance

### Scenario: the detail opens on the tab it draws first

- REQ → REQ-11
- Given → any container in the list
- When → the operator opens its detail
- Then → Config is the leftmost tab and it is the one showing, followed by Logs, Stats, Processes,
  Inspect and — for a running container — Exec and Attach

### Scenario: no tab is presented as a lesser one

- REQ → REQ-12
- Given → a running container's detail, open
- When → the operator looks at the tab row
- Then → the seven tabs are drawn the same way, with only the tab currently showing marked as such;
  Exec and Attach are not dimmed, greyed or otherwise set apart
