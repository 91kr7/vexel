---
module: ui-library
component: CrossReference, CrossReferenceList
type: UI component
---

# CrossReference, CrossReferenceList

**Purpose** → a reference to another object: a compact chip that leads to it when the reference can
be followed, and — when the reference genuinely does not exist — the stated reason in its place, so
a missing relation is shown as an explanation rather than as blankness.

## Contract

- `<CrossReference kind? label? onNavigate? unavailableReason? />`
  - `kind?` — what sort of object is referenced, shown ahead of the label.
  - `label?` — the referenced object's own label.
  - `onNavigate?` — follows the reference; without it the reference is shown but is inert.
  - `unavailableReason?` — when given, takes precedence over `label`/`onNavigate`: the reference is
    rendered muted and inert, with the reason as its text and as its tooltip.
- `<CrossReferenceList items unavailableReason? emptyLabel? />`
  - `items: { key, kind?, label, onNavigate? }[]` — each rendered as a `CrossReference`.
  - `unavailableReason?` — when given, replaces the whole set with one unavailable reference
    carrying that reason.
  - `emptyLabel?` — shown when `items` is empty and no `unavailableReason` was given.

Shows:
- available and followable → the kind, the label and a trailing "leads to" glyph, in the accent
  treatment.
- available but not followable → the kind and the label, without the glyph, inert.
- unavailable → the kind and the reason text, in a muted, dashed-outline treatment, inert.
Actions:
- selecting a followable reference → calls its `onNavigate`.
- an unavailable reference is never selectable and exposes no action.

## Rules and invariants

- A reference is never rendered blank: without a followable target it always shows either its
  reason, or the list's empty label.
- Domain-agnostic: `kind` and `label` are caller-supplied text; the component knows nothing of
  images, layers or build caches.

## Requirements served

- plan-docker_management_app/REQ-68
- plan-docker_management_app/REQ-69
