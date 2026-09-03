---
batch: 3
feature: F3 — the header offers only working controls, and no second route
closed_req: [REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-93]
depends: []
---

# Batch 3 — header-truthful

Every screen's header carries a `⌘K Search` button. It is an enabled `ui-button--ghost` with **no
`onClick`** (`client/src/shell/Shell.tsx:218`), and there is no keyboard handler for `⌘K` — or for
any key — anywhere in the client. Verified by real pointer clicks on two screens, by the keystroke,
and in source. It is displayed on all thirteen screens.

Beside it, `Console` (`Shell.tsx:221`) calls `selectScreen('raw-console')` — the same destination as
the `Raw console` navigation entry, presented as a different kind of thing.

**Decided at the requirements gate**: the control and its badge are **removed**, not built into a
palette; a command palette is a recommended follow-up report with requirements of its own. The
`Console` button goes and the rail is the single route.

**Checked at Step 3 and load-bearing here**: `KeyHint` has **exactly one consumer in the whole
client** — `Shell.tsx:219`. Removing the badge orphans the component, and an unused library component
is the product still shipping the affordance where the operator cannot see it.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, shell area | The check, written and run **first**. On at least two screens: a **real pointer click** on every header control, each one producing an observable effect; the `⌘K` keystroke producing none and no badge advertising it; and the raw console reachable from the rail. Then a source-level assertion that no enabled control in the header is rendered without a handler. Report what it measured before and after. | REQ-12, REQ-13, REQ-15 | — |
| INT-2 | modify | `client/src/shell/Shell.tsx` (:218 search control and its `KeyHint` at :219, :221 console action) | Remove the search control, its badge and the header console action, with the `selectScreen('raw-console')` call behind the latter and the `KeyHint` import at :10. Close the space up rather than leaving a gap; the remaining controls keep their delivered order, spacing and height. Nothing replaces either: no disabled control, no tooltip, no placeholder field. | REQ-12, REQ-13, REQ-14, REQ-15, REQ-16 | INT-1 |
| INT-3 | modify | `client/src/ui/controls/KeyHint.tsx`, `client/src/ui/index.ts:43` | Delete the component, its props type and its export. Its only consumer left in INT-2; a palette plan re-adds it in one file, which is cheaper than carrying a dead export until then. | REQ-93 | INT-2 |
| INT-4 | modify | `.sdd/modules/ui-library/index.md` (the `KeyHint` row), `.sdd/modules/ui-library/specs/key-hint.md`, `.sdd/modules/app-shell/specs/shell.md` | Delete the index row and the spec of the removed component — a spec for a deleted component is the same orphan as an unused file — and amend the shell's spec, which states that it "switches … to the Raw console from the header's console action". English only. | REQ-93, REQ-15 | INT-2, INT-3 |
| INT-5 | modify | client unit and e2e suites, wherever the header's search control, its badge or its console action is asserted | Remove the coverage of the removed behaviour, and **keep, move or restate** the assertions around it that cover the header's other controls. Coverage is removed only where the behaviour it covered is removed — never neutered to make a run go green, never deleted wholesale along with a file's unrelated neighbours. | REQ-12, REQ-16, REQ-93 | INT-2, INT-3 |

## Constraints on this batch

- **Nothing else in the header changes** (REQ-16): no control added, relabelled, re-ordered or
  restyled; the header's height, background treatment and scroll behaviour measured before and after
  at all three viewports and identical.
- **No route to the raw console is lost.** The rail entry, the phone drawer entry and any
  programmatic or cross-navigation route to it keep working; only the header's second presentation
  goes.
- `grep` for `KeyHint`, `⌘K` and the header console action across `client/src`, `client/test` and
  `client/e2e` must return nothing when the batch ends.
