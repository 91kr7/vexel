---
module: app-shell
component: FailedReadEmptyState
type: UI component
---

# FailedReadEmptyState

**Purpose** → the one thing a screen shows in place of the data it could not read: one sentence,
shared by every screen and every cause.

## Contract

```markdown
<FailedReadEmptyState compact? />
FAILED_READ_TITLE: string
```

Shows:
- the sentence "This data could not be loaded", and nothing else.
Actions:
- none: it carries no control at all.

- `compact` → the library's compact empty-state presentation, for a placeholder inside a pane
  rather than a screen.
- `FAILED_READ_TITLE` is the same sentence as a string, for the rare surface that takes a title
  rather than an empty state (the About screen's baseline strip).

## Rules and invariants

- **One wording for every screen and every cause** (plan-docker_management_app-inline_error_panels
  /REQ-3), the lost connection included: what failed is never named here, and a screen that invents
  its own sentence for a failed read is the divergence this component exists to prevent.
- **It states no cause**: no message, no error text, no reason — those go to a toast, when they go
  anywhere (…/REQ-2, …/REQ-5).
- **It carries no control**, and gains none: the retry is the header's, so a control here would be
  a second one (…/REQ-4). The prop set makes that structural — there is nothing to pass a control
  through.
- It is not a failure panel: it stands **in the data's place**, only where a surface has nothing to
  show, never beside data that was read (…/REQ-1).

## Dependencies

- ui-library: EmptyState

## Requirements served

- plan-docker_management_app-inline_error_panels/REQ-2
- plan-docker_management_app-inline_error_panels/REQ-3
- plan-docker_management_app-inline_error_panels/REQ-4
