---
module: ui-library
component: PageHeader
type: UI component
---

# PageHeader

**Purpose** → the screen-level header: current screen title, one-line description and trailing
global/screen actions (live-events indicator, search, console, …).

## Contract

- `<PageHeader title description? actions? />`

## Rules and invariants

- The title/description block and the `actions` row wrap onto their own line (`flex-wrap: wrap`)
  rather than overflowing when the header is narrower than their combined content width — added
  2026-08-06 so the header stays usable on the mobile/tablet breakpoints Frame now supports. The
  caller's `actions` content (typically a `Row`) needs its own `wrap` where it holds more than one
  or two items, since PageHeader only wraps at the top level.

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-6
- plan-docker_management_app/REQ-117
