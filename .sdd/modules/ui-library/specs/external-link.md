---
module: ui-library
component: ExternalLink
type: UI component
---

# ExternalLink

**Purpose** → a route to a document outside the application: followed in one step, and — when no
label is given — legible as the URL itself, so it stays useful where following it is impossible (a
host with no outbound network, a screenshot, a printed page).

## Contract

- `<ExternalLink href label? />`
  - `href` — the absolute URL the route leads to.
  - `label?` — the text shown in place of the URL; omitted, the URL is shown verbatim.

Shows:
- the label, or the URL itself when none was given, in the accent treatment, underlined, followed by
  a "leaves the application" glyph carrying no text of its own.
- a long URL wraps inside its container instead of overflowing it.
Actions:
- selecting it → opens `href`, in one step, in a separate browsing context, leaving the application
  as it was.
Navigation:
- leads outside the application only; it never changes the active screen.

## Rules and invariants

- Rendering it performs no network request: the destination is contacted only once the operator
  follows it (plan-docker_management_app-about_license_notice/REQ-19).
- The destination cannot reach back into the opening document: the route is opened without a
  referrer and without a handle on its opener.
- Without a `label`, the shown text is `href` character for character, so the destination can be
  read and copied by hand.
- Domain-agnostic: `href` and `label` are caller-supplied; the component knows nothing of what it
  points at.
- Its text colour has the same luminance as the library's secondary-text token, so it meets the
  documented minimum contrast over the whole range of the Backdrop
  (plan-docker_management_app/REQ-4).

## Requirements served

- plan-docker_management_app-about_license_notice/REQ-11
- plan-docker_management_app-about_license_notice/REQ-14
