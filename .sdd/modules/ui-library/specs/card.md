---
module: ui-library
component: Card
type: UI component
---

# Card

**Purpose** → the everyday content block: a padded Surface with an optional eyebrow title, used
for dashboard tiles, list panels and grouped content.

## Contract

- `<Card title? elevation? children?>`
  - `title` — optional uppercase eyebrow label above the content.
  - `elevation` — forwarded to the underlying Surface (default `'flat'`).

## Dependencies

- Surface

## Requirements served

- plan-docker_management_app/REQ-3
