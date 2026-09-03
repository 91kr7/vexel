---
batch: 34 · key-value-editor-naming
feature: KeyValueEditor — a field says which editor it belongs to (remediation)
closed_req: []
depends: [10]
---

# Batch 34 — Two boxes called "Key 1" in one form

Remediation batch, opened 2026-08-09 while sweeping ambiguous e2e locators. It touches the UI
library and one feature form; it closes no new REQ — REQ-27 (container creation with environment
variables and labels) is certified in batch 10.

## Why

`client/src/ui/controls/KeyValueEditor.tsx` names its rows `Key N` / `Value N`, with nothing saying
which editor instance they belong to. The container create/run sheet mounts two of them —
`Environment` (`client/src/containers/ContainerCreateForm.tsx:328`) and `Labels` (`:432`) — so one
sheet contains two textboxes with the accessible name `Key 1` and two named `Value 1`.

A sighted operator separates them by the section heading above. A screen-reader user hears
"Key 1, edit text" twice with nothing to tell them apart, and cannot know whether they are typing an
environment variable or a label — two things with very different consequences on a container. Any
automation is in the same position, which is how this was found: the e2e spec had to be scoped to
the section to address the right field at all.

Note the distinction that makes this a product defect rather than a test one. Two panels that each
legitimately own a `Prune` button are a test problem, solved by scoping the locator. Two fields with
the same name inside one form are indistinguishable to a real operator, and scoping the test would
only hide that.

## What a fix must establish

- Within one form, no two fields share an accessible name.
- `KeyValueEditor` stays domain-agnostic, per `CLAUDE.md`: the library must not know what
  "Environment" means. The distinguishing name is supplied by the caller — the component already
  takes a `keyPlaceholder`, so the API has a natural place for a name prefix.
- The change is in the library, not worked around in the feature code, and not duplicated into a
  near-identical second component.

## Interventions

| ID | Type | Where | What | Depends |
| --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/controls/KeyValueEditor.tsx` + `.sdd/modules/ui-library/specs/key-value-editor.md` | Spec first: state that each row's accessible name is qualified by a caller-supplied label, and that two instances in one form are therefore distinguishable. Then the code. | — |
| INT-2 | modify | `client/src/containers/ContainerCreateForm.tsx` | Pass the qualifier from both mount sites, so the rows read as the Environment ones and the Labels ones. | INT-1 |
| INT-3 | modify | `client/e2e/container-create-run.spec.ts` | The spec was scoped to the `Environment` form section to work around the ambiguity; the scoping may be relaxed once the names are unique. Optional — leaving it costs nothing. | INT-2 |

## Human acceptance

On the container create/run sheet, the environment rows and the label rows carry distinct accessible
names; a screen reader announces which editor a field belongs to; no other consumer of
`KeyValueEditor` regressed.
