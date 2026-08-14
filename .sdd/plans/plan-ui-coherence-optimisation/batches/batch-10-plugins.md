---
batch: 10
feature: F10 — plugins
closed_req: [REQ-46, REQ-47, REQ-48]
depends: [5]
---

# Batch 10 — plugins

Two `CardList` call sites (`PluginsScreen.tsx:223` CLI plugins, `:245` daemon plugins). Two defects of
its own: the `enabled` pill is **not column-aligned** — it is positioned relative to the version
string, so a row with a longer version such as `v0.36.0-desktop.1` pushes its pill left of its
neighbours' and the column reads ragged; and `No daemon plugins` is **bare text on no surface**,
floating in the layout with no card, no title treatment and no suggested action.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, plugins area | The check, written and run **first**: with plugins of differing version-string lengths present, assert **every `enabled` pill has the same left edge** — the measurement, not the impression. Then assert the empty result renders on a surface with a title and one line. Report the pills' left edges before and after. | REQ-47, REQ-48 | — |
| INT-2 | modify | `client/src/plugins/PluginsScreen.tsx` (:223, `cliRow` at :45) | Migrate the CLI plugin list to the object list's comfortable variant, deleting the row-content builder. Name, version and availability keep their values, and **the version and the state become columns**, which is what makes the pill align by construction rather than by luck. | REQ-46, REQ-47 | INT-1 |
| INT-3 | modify | `client/src/plugins/PluginsScreen.tsx` (:245, `daemonRow` at :190) | The same for the daemon plugin list: name, interface in words, enabled/disabled state, the enable/disable switch, the inline inspect and the destructive removal. | REQ-46, REQ-47 | INT-1 |
| INT-4 | modify | `client/src/plugins/PluginsScreen.tsx` | Express both empty results — `No daemon plugins`, and the **stated reason** each inventory degrades to when the installation or the daemon exposes none — through the empty-state primitive: a title, one line, and the resolving action where there is one. The stated reason is content, and it must survive the change of container. | REQ-48 | INT-2, INT-3 |
| INT-5 | modify | `.sdd/modules/plugins/specs/plugins-screen.md`, `.sdd/modules/plugins/index.md` | Record the screen's new shape. English only. | REQ-46, REQ-48 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates; keep every assertion about the privilege reading, the install that **runs only once exactly those privileges are granted**, enable, disable, inspect and remove — none of them forced. | REQ-46 | INT-2 … INT-4 |

## Constraints on this batch

- **The privilege grant is a safety behaviour, not a form step.** The install must still refuse unless
  exactly the privileges asked for are granted, and nothing here may make the grant implicit, remembered
  or skippable.
- The two inventories degrade to a **stated reason** rather than to emptiness when they are not
  exposed. An empty state that replaces a reason with a generic "nothing here" has destroyed
  information (REQ-48 asks for the primitive, not for the loss of the sentence).
- **Lower the `CardList` call-site budget in `client/scripts/check-ui-conformance.mjs` by the two
  sites removed here.** The check fails if the count is higher **or** lower than expected, so the
  budget is lowered deliberately or the batch does not go green.
- Feature code composes library components and nothing else.
