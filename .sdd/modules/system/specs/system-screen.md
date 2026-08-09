---
module: system
component: SystemScreen
type: UI component
---

# SystemScreen

**Purpose** → the System & prune screen: the daemon's information beside the reclaimable-space
breakdown, with a prune per category and a scoped system prune — the most destructive screen of the
application.

## Contract

Description:
- Two panels side by side, as in `.sdd/analysis/ui-mock/system_prune.png`: "Daemon info" on the
  left, "Reclaim disk space" on the right, the latter holding one row per category and, in its
  header, the system-prune action.

Shows:
- Daemon info: Docker version, Engine API version, BuildKit version (or "not reported"), storage
  driver, cgroup driver with its version, OS/kernel/architecture, root directory and the container
  count with how many are running — the daemon of the active context (REQ-94's reading, reused).
  While it is being read: a placeholder; when it fails: the failure with a retry.
- Reclaim disk space: the total reclaimable size in the header, then one row per category —
  "Stopped containers", "Dangling images", "Unused volumes", "Unused networks", "Build cache" —
  each with a line saying what it holds, its size, and a red "Prune" action:
  ```
  stopped-containers → "N containers not running"           / "No container is stopped"
  dangling-images    → "N images untagged and unreferenced" / "No untagged, unreferenced image"
  unused-volumes     → "<name> is unattached" (exactly one) / "N volumes unattached"
                       / "Every volume is attached to a container"
  unused-networks    → "N networks with no attached endpoint"
                       / "Every network has an attached container"
  build-cache        → "N records of BuildKit cache from past builds"
                       / "No reclaimable BuildKit record"
  a category that could not be read → the reason, in place of the line, and a size of "—"
  ```
- A standing warning under the rows: destructive actions are always confirmed and marked in red,
  and other tools sharing this daemon are affected (REQ-97).
- After a prune, a "Last prune" summary: the total space reclaimed as its headline, then one line
  per category of the run — how many objects went and how much it freed, or that it failed and why.
  It stays until the next prune replaces it.
- When the reading fails: the failure with a retry; the rest of the screen stays usable.

Actions:
- "Prune" on a row → confirms first, naming the category, what it holds and its size, stating that
  nothing removed can be brought back and that the daemon is shared with the other tools on the
  machine (REQ-97). Once confirmed, that one category is pruned; the breakdown re-reads and the
  summary and a toast report the space actually reclaimed.
- The row's action is disabled while the category is empty, while it could not be read, and while
  a prune is running.
- "System prune…" (red, in the panel header) → confirms with the scope: one checkbox per category,
  each with what it holds and its size, every non-empty category pre-selected and a category that
  could not be read not selectable. The same shared-daemon statement is made. Confirming prunes
  exactly the selected categories in one run; cancelling, or confirming with nothing selected,
  prunes nothing.
- "System prune…" is disabled while there is nothing prunable at all, and while a prune is running.
- A category that failed inside a run is reported as an application error naming it, alongside the
  summary of what the rest of the run did.

## Rules and invariants

- No prune ever runs without passing through the application's confirmation service first (REQ-6),
  and every confirmation states that the daemon is shared and other tools are affected (REQ-97).
- The reclaimed space reported is the daemon's own figure for the run, never the estimate the
  breakdown showed before it (REQ-96).
- The screen reads and prunes; it never removes a single object by itself.

## Dependencies

- ui-library: Grid, Card, SectionHeader, Stack, Button, StorageUsageRow, ResultSummary, Callout,
  DefinitionList, EmptyState, ErrorBanner, useToast
- system: useDiskUsage, System client
- contexts: useDaemonInfo
- app-shell: ConfirmationService (`confirm`, `confirmScope`), ErrorReportingService, ProgressService

## Requirements served

- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-96
- plan-docker_management_app/REQ-97
