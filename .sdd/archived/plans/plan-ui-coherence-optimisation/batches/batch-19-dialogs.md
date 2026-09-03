---
batch: 19
feature: F19 — dialogs, and the programme's closing invariants
closed_req: [REQ-78, REQ-79, REQ-80, REQ-81, REQ-83, REQ-84, REQ-85, REQ-86, REQ-87, REQ-88, REQ-89, REQ-90, REQ-91, REQ-92]
depends: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
---

# Batch 19 — dialogs

Section 5's last item, and **the batch that closes the programme's cross-screen invariants**. Two
jobs, and the second is the larger one.

**The dialogs.** Each field group is its own nested sub-card, which in a narrow dialog produces a long
vertical scroll of boxes inside boxes; the field labels (`IMAGE`, `ENTRYPOINT`, `COMMAND`) are a
fourth section-header treatment; and `Add variable` and `Add port mapping` are bare text acting as
controls.

**The invariants.** REQ-81 (one answer to each of the five questions) and REQ-92 (a screen not yet
written has no design decisions left) are false until the last screen adopts them, and the constraint
requirements REQ-83 to REQ-91 are judged over the whole programme. They close here.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, dialogs | The check, written and run **first**: open the container create/run form at 1280×800 and assert its content height is **measurably less** than the delivered build's; assert no field group renders as a nested card; assert each field label renders in the one treatment. Then operate the privileged toggle with a **real pointer click at the visible control's own coordinates** and assert the dialog's **viewport box is unchanged** and the control is still inside the viewport. Report the heights and the boxes before and after. | REQ-78, REQ-79, REQ-80 | — |
| INT-2 | modify | `client/src/ui/controls/FormSection.tsx`, `client/src/ui/feedback/FormSheet.tsx`, `client/src/ui/feedback/FormDialog.tsx` and their stylesheets | A field group stops being its own nested sub-card: one form, sectioned by the one section-header treatment, in the library where every dialog inherits it at once. | REQ-78, REQ-79 | INT-1 |
| INT-3 | modify | `client/src/ui/controls/KeyValueEditor.tsx`, `client/src/ui/controls/RepeatableRowList.tsx`, `client/src/ui/controls/Chip.tsx` | `Add variable`, `Add port mapping` and the chip group's add affordance become controls of the action cluster — controls that look like controls (REQ-27's rule, observed here). Each still adds the row it adds. | REQ-80 | INT-1 |
| INT-4 | modify | `client/src/containers/ContainerCreateForm.tsx` and the other screens' create/pull/tag forms | Consume the changed dialog shell: no local field-group card, no local label treatment, every field keeping its label, its association with its input and its validation behaviour, and the daemon's refusal still shown while the entered values are kept. | REQ-78, REQ-79, REQ-80 | INT-2, INT-3 |
| INT-5 | create | client e2e suite, cross-screen | **The programme's closing check.** Walk all thirteen screens at 1440×1000, 1280×800 and 375×812 and assert the counts: one list paradigm, one detail-panel shape, one empty-state treatment, one section-header treatment, one action rule. Assert `grep` finds no `CardList`, no second list component and no hand-built list, panel, empty state or section header in feature code. Assert the last migrated screen added **no new primitive, variant or prop** to the library — the evidence for REQ-92. | REQ-81, REQ-92 | INT-4 |
| INT-6 | create | client e2e suite, cross-screen | **The non-regression sweep over section 6 and the certified predecessors**: the glass material, background and token discipline consistent everywhere; the two-column property grid intact; destructive actions red-tinted and prune rows correctly distinguished; the callout one style used twice. Then bug-1 to bug-5 each exercised on the surface it delivered, by name, and each still behaving as certified. | REQ-86, REQ-87 | INT-4 |
| INT-7 | modify | `.sdd/modules/ui-library/specs/form-section.md`, `specs/form-sheet.md`, `specs/form-dialog.md`, `specs/key-value-editor.md`, `specs/repeatable-row-list.md`, `specs/chip.md`, `.sdd/modules/containers/specs/container-create-form.md` | Record the dialog's new shape and the add-affordance rule. English only. | REQ-78, REQ-79, REQ-80 | INT-2 … INT-4 |
| INT-8 | modify | client unit and e2e suites covering the dialogs | Update the coverage the change invalidates; keep every assertion about validation, refusal handling, create-only versus create-and-start, and the dialog sizing rules `plan-docker_management_app-dialog_sizing` delivered. | REQ-78, REQ-80 | INT-2 … INT-4 |
| INT-9 | create | client build-check and test tree, cross-cutting | **The constraint sweep, run over the whole programme's diff rather than over this batch's.** `check-ui-conformance.mjs` passing, and its **blur half unmodified** — diffed against its state before batch 1, with `blurAllowedOverlaySelectors` byte-identical. Exactly **one** planned change to that file is admissible across the whole programme: the `CardList` call-site budget added in batch 5 and **removed again in batch 13**, so by this batch the file differs from its pre-batch-1 state in nothing at all. Any other edit to it is the signal something went elsewhere; no `backdrop-filter` or `filter: blur(...)` outside the allow-list and none valued anything but `var(--blur-overlay)`; no raw DOM tag, `className` carrying visual utilities, `style` prop or CSS import anywhere outside `client/src/ui/`; no colour, radius, spacing, shadow, font size or z-index hard-coded outside `tokens.css`; no animation, transition or filter on the backdrop or on a surface that scrolls with the content. Then the evidence half: **every batch's check was observed failing first, with its figures**, and the before/after measurements are collected in one place. This intervention builds nothing — it is how the nineteen diffs are judged, and it is the reason the constraint requirements are requirements. | REQ-83, REQ-84, REQ-85, REQ-88, REQ-89, REQ-90, REQ-91 | INT-5, INT-6 |

## Constraints on this batch — and on every batch of this plan

These are the constraints the whole programme is judged against; they are restated in every batch file
and they **close here**, when the last batch has been judged against them.

- **The UI boundary holds absolutely** (REQ-83). No file outside `client/src/ui/` emits a raw DOM tag,
  imports or declares CSS, carries a `style={{…}}`, or hard-codes a colour, radius, blur, spacing,
  shadow, font size or z-index. Every primitive, variant, token and prop was added to the library and
  exported **before** any feature consumed it. The one escape hatch is used only with a comment on the
  spot stating why the library could not cover it.
- **The blur allow-list is unchanged** (REQ-84). `check-ui-conformance.mjs` passes and its **blur half
  is not modified**; **`blurAllowedOverlaySelectors` is byte-identical** to its pre-batch-1 state —
  the half a green run cannot show. Its boundary half carried exactly one planned addition, the
  call-site budget of REQ-94, which batch 13 removed again. The scrims still dim without blurring; the session-ended overlay still declares
  `backdrop-filter: none`; no blur sits on a surface element rather than its `::before`.
- **The background stays static and pre-blurred** (REQ-85); nothing added animates the backdrop and no
  primitive introduces a filter, transition or animation on a surface that scrolls with the content.
- **Every interaction is driven with a real pointer at the visible control's coordinates** (REQ-88) —
  never `element.click()`, never a dispatched event, never a visually hidden target. The privileged
  toggle in INT-1 is the case that paid for the rule.
- **A check for "the layout broke" asserts geometry, not content** (REQ-89): viewport boxes before and
  after, the operated control still inside the viewport, and the batch's own measurements — track
  widths, box intersections, row heights, column left edges, card heights — at all three viewports.
- **Each check was observed failing on the delivered build, with its figures** (REQ-90), reported
  before beside after.
- **Verified against the real daemon under the project's test discipline** (REQ-91): own fixtures with
  the ownership labels, cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon, no
  inherited application state, its own data directory, no test reaching Docker Hub, every spec passing
  on its own. English only; kebab-case for every new file and folder.
