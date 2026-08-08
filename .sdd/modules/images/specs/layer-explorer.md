---
module: images
component: LayerExplorer
type: UI component
---

# LayerExplorer

**Purpose** → the layer explorer for one image: its layer stack in build order, shared-layer
markers, and — once analysed — each selected layer's added/modified/deleted paths, with a cost
warning and cancellable progress before analysis starts (REQ-47–51); also marks layers carrying
efficiency/secret-signal findings and can be entered pre-selected at a given layer, already
analyzing (REQ-65, REQ-67).

## Contract

- `<LayerExplorer image open onClose initialSelectedLayerIndex? autoAnalyze?
  layersWithFindings? />` — `image: ImageSummary`; `open` shows the explorer; loads the layer stack
  only while `open` (via `useImageLayerStack(open ? image.id : undefined)`).
  - `initialSelectedLayerIndex` — selects this layer once the explorer opens (e.g. arriving from a
    signals finding); re-applied whenever it changes while open.
  - `autoAnalyze` — starts the changeset analysis immediately on open, bypassing the cost warning;
    the caller uses this only when the changeset job is already known to be cached (LayerEfficiencyView
    always is, since it shares the same job).
  - `layersWithFindings` — `Map<layerIndex, findingCount>` from LayerEfficiencyView; layers present in
    it show a `findings · <count>` marker in the layer table.

Description:
- A large `Modal` holding a `DataTable` of layers (index, an instruction bar sized proportionally to
  the layer's uncompressed size among the stack, a shared/empty marker, a signals-findings marker,
  uncompressed and compressed size), selectable, expanding below the selected row into the changeset
  view for that layer.
Shows:
- Before analysis: an `EmptyState` inviting the operator to analyze changesets, with a button that
  opens the cost-warning confirmation.
- After analysis: the selected layer's added/modified/deleted paths in a table (status marker, full
  path, size — `unavailable` with a reason for a deleted path's size).
- A compressed-size column showing `unavailable` with the reason, since the local daemon does not
  report it (REQ-48).
Actions:
- "Analyze changesets…" → opens a `ConfirmDialog` naming the image and stating the estimated time
  and temporary disk cost; confirming starts the analysis stream (REQ-51).
- The analysis progress dialog offers Cancel while active and Close once it ends (successfully or
  not); these are not equivalent:
  - Cancel stops the analysis server-side and discards it: the dialog closes with no result, and the
    "not analyzed yet" prompt is shown again — a deliberate, expected end (REQ-51).
  - Close, once the analysis finished, is only an acknowledgement: it dismisses the dialog, but the
    computed changeset stays and is what the layer selection below browses (REQ-49) — an operator who
    runs the analysis, is told it finished, and dismisses that notice must still be able to browse
    what it produced. Only Cancel or starting a new analysis replaces it.
  - Close, once the analysis failed, dismisses the dialog and clears it (there is nothing to keep),
    so "Analyze changesets…" is offered again.
- Selecting a layer row shows that layer's changeset once analysis has completed and its dialog has
  been dismissed (Close does not hide the result, only the dialog); before that, or while a run is
  active, the same "not analyzed yet" prompt is shown regardless of which layer is selected (analysis
  covers the whole image at once).

## Rules and invariants

- The layer stack reloads only while the explorer is open, so a closed explorer performs no fetch.
- A previously analyzed image's changesets are served from the analysis cache with no export step
  and no progress events beyond the immediate result.
- The analysis stream/result and the progress dialog's visibility are independent: dismissing the
  dialog after a successful run never re-fetches or discards the result, so browsing it costs nothing
  further and a later re-open of the same image still serves it from the cache.

## Dependencies

- ui-library: Modal, DataTable, ProportionBarCell, Badge, MetaCell, IdentifierCell, ConfirmDialog,
  TransferProgressDialog, EmptyState, ErrorBanner, Button, Stack
- useImageLayerStack, useImageChangesetStream, Image layers client

## Requirements served

- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-48
- plan-docker_management_app/REQ-49
- plan-docker_management_app/REQ-50
- plan-docker_management_app/REQ-51
- plan-docker_management_app/REQ-65
- plan-docker_management_app/REQ-67
