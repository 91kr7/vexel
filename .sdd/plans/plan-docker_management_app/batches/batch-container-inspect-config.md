---
batch: 5 · container-inspect-config
feature: F5 — Container inspection and configuration
closed_req: [REQ-24, REQ-25, REQ-26]
depends: [4]
---

# Batch 5 — Container inspection and configuration

Introduces the detail-drawer and form families of the UI library, reused by every later "select an
object, see and edit it" flow.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Detail-surface primitives: side drawer / detail panel with header and sticky actions, tab set, definition list (label → value rows with copy affordance), collapsible section, and a read-only code/JSON viewer with copy. | REQ-24, REQ-26 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Form primitives: text field, number field, select, toggle, key-value pair editor, repeatable row list (for ports and mounts), field-level validation message, and a form footer with save/cancel and a dirty indicator. | REQ-25 | — |
| INT-3 | create | server, containers area | Container inspect endpoint returning the full payload (identity, image, command/entrypoint, dates, state and exit code, restart policy, resource limits, environment, ports, mounts, networks, labels, health-check configuration and latest results) plus the raw payload as received. | REQ-24, REQ-26 | — |
| INT-4 | create | server, containers area | Configuration update operations: in-place update where the Engine API allows it (restart policy, resource limits) and a recreate path preserving identity, mounts and networks where Docker requires it, reporting which path was taken and the outcome. | REQ-25 | INT-3 |
| INT-5 | create | client, data-access layer | Container detail query and configuration mutations, invalidated by the container's own daemon events. | REQ-24, REQ-25 | INT-3, INT-4 |
| INT-6 | create | client, containers feature area | Container detail view opened from the list: inspect data organised in sections/tabs, an editable configuration form warning before a recreate and reporting the result, and the raw inspect payload with copy. | REQ-24, REQ-25, REQ-26 | INT-1, INT-2, INT-5 |
| INT-7 | modify | client, containers feature area (created by `batch-containers-lifecycle`) | Open the detail view from a row of the containers table and keep the list in sync with what the detail view changes. | REQ-24 | INT-6 |
