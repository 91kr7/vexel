---
slug: docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload
date: 2026-08-27
spec: .sdd/analysis/docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload.md
requirements: requirements.md
status: validated
---

# Batches — The Inspect tab becomes the whole payload

**One batch**, by the human's instruction of 2026-08-27. Requirement ids are this plan's
(`requirements.md`); intervention ids are local to the batch file.

Requirements validated by the human on 2026-08-27, with four decisions answered and folded into the
requirement text; the REQ ↔ INT coverage validated the same day, without corrections. The batch's
`Status` below is advanced only by the later phases' orchestrators.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| `inspect-full-payload` | F1 … F8 — the whole plan | REQ-1 … REQ-35 | — | todo | Every field `docker inspect` returns is on screen, section by section |

## Departures

Two, both deliberate, and **neither of them contradicts the spec** — so nothing here asks for a
correction to the business spec.

1. **One batch instead of one per feature.** The workflow's rule is one batch per feature, and this
   plan has eight of them; the human instructed on 2026-08-27 that the work go in a single batch.
   Recorded because the batch table below therefore says nothing about build order — that order lives
   in the `Depends` column of the batch's own interventions, which are still cut one per point of the
   system.
2. **`plan-ui-coherence-optimisation/REQ-60` is not applied on this tab.** "A group holding a
   collection is drawn only when it holds something" is exactly what REQ-6 refuses here: a field the
   daemon sent is drawn whether or not it holds anything, marked empty. That rule was already amended
   once for this panel's Config tab (`…-tabs_composition_refactor/REQ-51`) and stands untouched
   everywhere else.

## What this plan supersedes, by name

Stated in full at the head of `requirements.md` and repeated in the batch file so the implementer
does not have to find it:

1. **`…-tabs_composition_refactor/REQ-34`** — the ten curated properties under `Identity` and
   `Lifecycle`. Superseded outright; the ten facts survive as fields of the payload-derived sections
   (REQ-5).
2. **`…-tabs_composition_refactor/REQ-37`** — the raw payload as one collapsible section among the
   others. Superseded in its *position* only: pinned last (REQ-12), still collapsed on entry, still
   selectable, still unaltered.
3. **The order clause of `…-tabs_composition_refactor/REQ-11`** — "Logs, Stats, Processes, Inspect,
   Exec, Attach". REQ-1 moves Inspect to second; Config drawn first *and* active on entry is
   untouched.

**Preserved and re-asserted rather than superseded**, because a reader could expect them to be at
risk: `plan-ui-coherence-optimisation/REQ-65` (the raw payload as real selectable text),
`plan-docker_management_app-remove_copy_controls/REQ-19` and `REQ-23` (hand-selection as the only
route to a value, and no copy affordance anywhere), and every requirement of
`…-tabs_composition_refactor` about the dialog's stable height, its identity-bearing header and the
uniform treatment of the seven tabs — restated as REQ-22, REQ-24 and REQ-26 and checked by INT-10 and
INT-12.

## Assumptions and decisions

1. **The payload is already in the client, so this costs the daemon nothing** (REQ-25).
   `containers/specs/containers-service.md` contracts the inspect result's `raw` field as "the full
   inspect payload exactly as received, unmodified", and the delivered tab already prints it in its
   last section. The rebuild renders what the tab is already holding. No endpoint, no option, no
   cadence, and the server's own inspect coverage is untouched.
2. **The generic rendering is a new component of the UI library, not an extension of `TreeView` or
   `DefinitionList`.** `DefinitionList` is a band of label→value pairs of one object and refuses a
   caller-stated column count; `TreeView` is a filesystem tree with virtualisation and selection. A
   payload of sections, nested groups and counted lists is neither, and forcing it into either would
   be the near-duplicate the library's own rule forbids. What it **composes** is the delivered
   primitives — `CollapsibleSection`, `SectionHeader`, `Badge`, `DefinitionList` / `FieldList`,
   `SearchField`, `CodeViewer`, `EmptyState` — so nothing about the material is invented (REQ-27).
3. **The reading of the shape is separated from the drawing of it** (INT-1 against INT-2). The
   classification — composite or scalar, empty or zero, how many items, what the key path is — is
   what the completeness check of INT-11 and the filter of INT-4 both read, and a pure module is what
   makes "every key accounted for" checkable at all rather than asserted by eye.
4. **Which key means what stays in feature code** (INT-5, REQ-27). The library component takes an
   optional per-field reading from its caller and knows nothing about `NanoCpus`, `StartedAt` or
   `PortBindings`. The state pill and the danger-toned exit code come from the module's existing
   `container-status.ts` reading, not from a second one.
5. **`CollapsibleSection` gains a controlled open** rather than the new component owning a disclosure
   of its own (INT-3). The filter has to open the sections holding its matches, and clearing it has to
   put them back; a second disclosure idiom beside the library's own is how two components come to
   look 90% alike. Every delivered caller keeps the uncontrolled behaviour it has.
6. **Sentinel annotation is kept deliberately narrow** (REQ-18). Only where the meaning is documented
   and unambiguous — `0` as "no limit" on a resource field. The spec's own risk is a formatter that
   misleads on the one tab whose purpose is exactness, and the mitigation is to annotate less.
7. **Environment variables are shown in full, unmasked** (REQ-35) — the human's decision of
   2026-08-27, against the spec's "secrets become easy to find" risk. The reason is in
   `requirements.md`: this is the surface that exists to state what a field exactly says.
8. **Responsiveness is measured, not asserted** (REQ-23). Hundreds of nodes plus a live filter inside
   a modal is, by the spec's own reckoning, the first thing in this dialog with a real chance of
   feeling slow. If the measurement fails, the answer is inside the library component — rendering the
   closed sections' contents only when they open, and filtering over the flattened entries of INT-1
   rather than over the drawn tree — not a narrowing of what is rendered.
9. **The test trees are not in the indexes**, which map components. The e2e and unit paths in INT-9,
   INT-10, INT-11 and INT-12 were located directly. Same note as the two predecessor plans', for the
   same reason.
10. **The e2e suite runs once, at the end, and the human runs the unfiltered pass themselves** — the
    standing instruction carried over from the predecessor plan. The batch is certified on its own
    unit and boundary checks plus the specs it rewrites; `npm run test:e2e -w client` with no filter
    remains the human's. Until it has run, the plan is complete pending their verification and no
    report may call it more than that.
11. **The component specs and the module indexes are updated by the implementer, in the same turn as
    the change** (knowledge base, `every-change-updates-spec-requirements-plan`):
    `containers/specs/container-detail-panel.md` and the new feature rule's own spec under
    `containers/`, plus the new library component's spec and rows under `ui-library/`. No intervention
    is written for it here because it is not optional work that could be planned away.

## Carried risks

- **Completeness regressing invisibly** — the spec's first risk, and the reason INT-11 compares what
  is rendered against the payload itself and never against a list of names. A check written the other
  way passes on the developer's container and drops fields on the operator's.
- **A prettier raw dump.** Several hundred labelled rows in one scroll is a different failure from
  the one being fixed. The sections, the counts, the entry state of REQ-11 and the find are what
  stand between the two, and they are the parts most likely to be cut for time.
- **Deleting the coverage takes certified assertions with it.** INT-9 deletes this tab's spec, and
  INT-9 and INT-10 together are what re-establish the property band's geometry, the absence of a copy
  control and the detail's certified behaviours. A rewrite that only covers what is new has lost
  them.
- **The reorder breaks every check that names a tab by position**, here and in the predecessor's
  coverage. INT-10 rewrites them; a check quietly weakened into passing is the failure mode.

## Coverage check

**Every REQ is served by at least one INT.** All of them in `inspect-full-payload`:

| REQ | INT |
| --- | --- |
| REQ-1 | INT-7 |
| REQ-2 | INT-7, INT-10 |
| REQ-3 | INT-2, INT-6, INT-11 |
| REQ-4 | INT-1, INT-6, INT-11 |
| REQ-5 | INT-6, INT-9 |
| REQ-6 | INT-1, INT-2 |
| REQ-7 | INT-1, INT-2 |
| REQ-8 | INT-1, INT-2 |
| REQ-9 | INT-2, INT-3 |
| REQ-10 | INT-1, INT-2 |
| REQ-11 | INT-2, INT-3, INT-6 |
| REQ-12 | INT-8 |
| REQ-13 | INT-2 |
| REQ-14 | INT-1, INT-2 |
| REQ-15 | INT-2, INT-5 |
| REQ-16 | INT-5, INT-6 |
| REQ-17 | INT-2, INT-5 |
| REQ-18 | INT-5 |
| REQ-19 | INT-3, INT-4 |
| REQ-20 | INT-4 |
| REQ-21 | INT-1, INT-4 |
| REQ-22 | INT-6, INT-12 |
| REQ-23 | INT-2, INT-4, INT-12 |
| REQ-24 | INT-2, INT-8, INT-10 |
| REQ-25 | INT-6, INT-12 |
| REQ-26 | INT-10, INT-12 |
| REQ-27 | INT-2, INT-5, INT-12 |
| REQ-28 | INT-12 |
| REQ-29 | INT-2, INT-12 |
| REQ-30 | INT-9 |
| REQ-31 | INT-10 |
| REQ-32 | INT-9, INT-12 |
| REQ-33 | INT-9, INT-11, INT-12 |
| REQ-34 | INT-11 |
| REQ-35 | INT-2, INT-9 |

**Every INT serves at least one REQ.** No intervention here is enabling-only, and there is no
declared exception — INT-1 and INT-3, the two that read as enablers, each close requirements of their
own (the empty/zero reading and the section derivation for INT-1; the counted, independently
collapsible section and the filter's opening of it for INT-3).

**Every REQ closes in this batch**, there being only one, and the table above, the batch's
frontmatter and its `REQ` columns carry the same list. The thirteen cross-cutting requirements of F8
(REQ-22 … REQ-34) are standing conditions on every intervention rather than work of their own; they
are closed by INT-9 … INT-12, which state them over the finished tab.
