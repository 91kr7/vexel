---
module: images
component: LayerEfficiencyView
type: UI component
---

# LayerEfficiencyView

**Purpose** → an image's efficiency and secret-signal view: wasted bytes and efficiency score,
deleted-later/overwritten files, duplicated content and flagged credential-looking paths, each
navigating to the layer it concerns, under an explicit heuristic disclaimer (REQ-65, REQ-66,
REQ-67).

## Contract

- `<LayerEfficiencyView image open onClose onNavigateToLayer onFindingsChange? />`
  - `image: ImageSummary`; `open` shows the view.
  - `onNavigateToLayer(layerIndex)` — called when a finding's "View layer" action is chosen; the
    caller closes this view and opens the layer explorer at that layer.
  - `onFindingsChange(layersWithFindings: Map<layerIndex, count>)` — called every time a new result
    arrives, so the caller can pass the same map to LayerExplorer's `layersWithFindings`.

Description:
- A large `Modal`: a `Callout` disclaimer, then — once analysed — a metrics row (efficiency score with
  its gauge, duplicated-content bytes, flagged-path count) and three object lists in the comfortable
  variant (wasted files, duplicated content groups, flagged paths), each row expanding into a "View
  layer" action.
- **The three lists are the one object list** (`ui-library/data-table.md`, `variant="comfortable"`),
  never a second list component beside it (`plan-ui-coherence-optimisation/REQ-82`): these were the
  last three call sites of the retired card list, and they are the reason a programme migrating "the
  nine list screens" would have left it alive — this is a `DataTable` screen. Each fact a delivered
  row carried in a subtitle is a **column** here, named in the header:
  - wasted files → `PATH`, `WRITTEN AT`, `REASON` (`overwritten` / `deleted`), `SUPERSEDED AT`,
    `SIZE`;
  - duplicated content → `DUPLICATE` (how many copies, and the size of each), `PATHS`, `WASTED`;
  - flagged paths → `PATH`, `PATTERN`, `INTRODUCED AT`, `REMOVED AT` (`still present` when it was
    never removed).
Shows:
- Before analysis: an `EmptyState` inviting the operator to analyze, naming that it reuses the layer
  explorer's own changeset job.
- The `Callout`: states plainly that every finding below is a heuristic path/size signal, not a
  security verdict, and that no file content is read to produce the secret-pattern findings.
- Efficiency score gauge (a `Meter`) and reading; total wasted bytes over total bytes written;
  duplicated-content bytes and group count; flagged-path count.
- Each wasted file: path, the layer that wrote it, the layer and reason (`overwritten` | `deleted`)
  that superseded it, its size.
- Each duplicate group: the paths sharing identical content, the per-copy size, the bytes wasted
  across the copies past the first.
- Each secret finding: path, matched pattern name, introducing layer, and — when applicable — the
  removing layer.
Actions:
- "Analyze layer efficiency…" → opens a `ConfirmDialog` stating the estimated cost, then a
  cancellable progress dialog (mirrors LayerExplorer's own analysis flow, REQ-51).
- Once the analysis succeeds that dialog states `Completed` — the shared surface's own wording — and
  **dismisses itself** a second later, revealing the findings: this view asks the surface for that
  (`autoCloseOnDone`), its result being rendered behind the dialog rather than in it. No completion
  wording, state or timer of this view's own; its `formatCaption` keeps describing the in-flight
  phase only. A failed analysis never dismisses itself.
- Selecting a finding expands it inside its own row; its "View layer" action calls
  `onNavigateToLayer`. Selecting it again collapses it, and at most one finding is expanded per
  list.

## Rules and invariants

- Shares the changeset job and cache of LayerExplorer/ChangesetService (batch 13): analyzing either
  view first serves the other's underlying job from cache.
- The analysis stream/result and the progress dialog's visibility are independent, same as
  LayerExplorer: dismissing the dialog after a successful run never discards the result.
- `onFindingsChange` fires only once a result exists — the layer explorer shows no markers until this
  view has been analyzed at least once.

## Dependencies

- ui-library: Modal, Callout, MetricTile, Meter, DataTable, BadgeListCell, MetaCell, TwoLineCell,
  ConfirmDialog, TransferProgressDialog, EmptyState, ErrorBanner, Button, Grid, SectionHeader, Stack
- useImageSignalsStream, Image signals client

## Requirements served

- plan-docker_management_app/REQ-65
- plan-docker_management_app/REQ-66
- plan-docker_management_app/REQ-67
- plan-docker_management_app-progress_completion_autoclose/REQ-5
- plan-docker_management_app-progress_completion_autoclose/REQ-12
- plan-docker_management_app-progress_completion_autoclose/REQ-15
- plan-docker_management_app-progress_completion_autoclose/REQ-16
- plan-ui-coherence-optimisation/REQ-82
