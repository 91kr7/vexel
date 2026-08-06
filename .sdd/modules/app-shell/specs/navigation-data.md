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
  Plugins, System & prune; Full coverage → Raw console, Coverage matrix (REQ-1).
- Every `id` is unique.

## Requirements served

- plan-docker_management_app/REQ-1
