---
module: ui-library
component: ErrorBanner
type: UI component
---

# ErrorBanner

**Purpose** → shows an operation failure inline, together with the daemon's own error message,
without breaking the surrounding screen.

## Contract

- `<ErrorBanner title detail? onDismiss? />`
  - `title` — short, human-readable summary of the failure.
  - `detail` — the raw upstream message, rendered verbatim in a monospace block (no truncation, no
    reformatting).
  - `onDismiss` — when provided, renders a dismiss IconButton.

## Rules and invariants

- Rendering an ErrorBanner never replaces or hides the rest of the screen's content (REQ-7).

## Dependencies

- Surface, IconButton, Row

## Requirements served

- plan-docker_management_app/REQ-7
