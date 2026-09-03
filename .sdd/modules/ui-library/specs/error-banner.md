---
module: ui-library
component: ErrorBanner
type: UI component
---

# ErrorBanner

**Purpose** → shows an operation failure inline, together with the daemon's own error message,
without breaking the surrounding screen.

## Contract

- `<ErrorBanner title detail? onDismiss? onRetry? retryLabel? />`
  - `title` — short, human-readable summary of the failure.
  - `detail` — the raw upstream message, rendered verbatim in a monospace block (no truncation, no
    reformatting).
  - `onDismiss` — when provided, renders a dismiss IconButton.
  - `onRetry` — when provided, renders a retry Button (label `retryLabel`, default `"Retry"`) next
    to the dismiss action.

## Rules and invariants

- Rendering an ErrorBanner never replaces or hides the rest of the screen's content (REQ-7).
- **It has exactly one call site left in the product**: the daemon's refusal of a container creation
  the operator submitted, beside the form that submitted it
  (`containers/specs/container-create-form.md`). No screen reports a failure in its body any more
  (plan-docker_management_app-inline_error_panels/REQ-1) — a failed read is a toast, and where it
  leaves a surface with nothing, `FailedReadEmptyState` stands in the data's place. A second call
  site is a decision about the product, not a use of this component.

## Dependencies

- Surface, Button, IconButton, Row

## Requirements served

- plan-docker_management_app/REQ-7
- plan-docker_management_app/REQ-10
- plan-docker_management_app-inline_error_panels/REQ-1
