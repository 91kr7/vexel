---
module: app-shell
component: Navigation data
type: configuration
---

# Navigation data

**Purpose** → the single source of truth for the application's thirteen screens: which group they
belong to, their rail glyph and their page-header title/description.

## Contract

- `screens: ScreenDefinition[]` — one entry per screen: `{ id, label, glyph, group, title,
  description }`.
- `navGroupOrder: NavGroupName[]` — `['Workloads', 'Artifacts', 'Environment', 'Full coverage']`,
  the display order of the groups.
- `defaultScreenId` — `'dashboard'`, the screen active on load.

## Rules and invariants

- Exactly thirteen entries: Workloads → Dashboard, Containers, Compose, Swarm; Artifacts →
  Images & layers, Volumes & networks, Registries, Builders & cache; Environment → Contexts,
  Plugins, System & prune; Full coverage → Raw console, About (REQ-1).
- Every `id` is unique.
- The entry the application dedicates to itself is labelled "About", with the matching `title` and a
  one-line `description`, and it is the last of the "Full coverage" group.
- That entry's `id` is `coverage-matrix` and no rename touches it: it is the value an earlier
  version persisted as the last active screen, so the label may change while the identity may not.
- That entry's `description` names the functional coverage matrix as well as the product's identity
  and licence — with the label no longer advertising the matrix, the description is the only place
  the navigation says the matrix is on this screen.

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app-about_license_notice/REQ-1
- plan-docker_management_app-about_license_notice/REQ-2
- plan-docker_management_app-about_license_notice/REQ-4
