---
batch: 2 · no-error-panel-in-the-page
feature: F1 — The page body stops reporting errors
closed_req: REQ-1, REQ-2, REQ-3, REQ-4
depends: 1
---

# Batch 2 — no-error-panel-in-the-page

Requirements: `.sdd/plans/plan-docker_management_app-inline_error_panels/requirements.md`. Ids cited,
never copied. Batch 1 must be done first: the reporting path and the failed-read reporter are what
every screen here reports through.

**The same change, 32 times.** Every intervention below removes `ErrorBanner` call sites and applies
one rule, so the rule is written once, here:

1. **A read that failed only because the connection is down raises nothing.** That is the case of
   every list fed by the live channel — containers, images, volumes, networks, compose projects,
   registries, plugins, builders, build cache, contexts: their `error` is set only while the channel
   is not delivering. The screen shows the empty state of INT-1 and stays silent (REQ-2, REQ-13).
2. **Any other failed read is handed to the failed-read reporter** of batch 1, which raises the toast
   and drops it when the connection is down (REQ-5, REQ-13).
3. **A screen with no data shows the empty state of INT-1**, with no cause and no control (REQ-3).
4. **The panel's `onRetry` is not replaced by a new control** (REQ-4, INT-11).

**One panel stays**, and it is the only `ErrorBanner` left in feature code: the creation refusal in
`client/src/containers/ContainerCreateForm.tsx`. It is the daemon's answer to a command, standing
beside the form that sent it (decision D2 in `batches.md`, REQ-1). The transfer failures that used to
stay with it became toasts in batch 1.

## What this batch builds

- **The "could not be loaded" empty state wording** — one sentence, shared by every screen, for a
  screen that has no data because its read failed. Written once so twenty screens do not each invent
  their own, and so no cause and no control can creep back into it.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, app-shell area | One wording, used by every screen that has no data because its read failed: it says the data could not be loaded, names no cause and carries no control. | REQ-3 | — |
| INT-2 | modify | `client/src/containers/ContainersScreen.tsx`, `ContainerDetailPanel.tsx`, `ContainerLogsView.tsx`, `ContainerStatsView.tsx`, `ContainerProcessesView.tsx` | Remove the five panels. The list is rule 1; the inspect read, the log stream, the stats stream and the process listing are rule 2. | REQ-1, REQ-2, REQ-3 | INT-1 |
| INT-3 | modify | `client/src/images/ImagesScreen.tsx` (the list panel only), `ImageDetailPanel.tsx`, `LayerExplorer.tsx`, `LayerEfficiencyView.tsx`, `FilesystemBrowser.tsx` | Remove the six panels. The image list is rule 1; the inspect read, the layer stack, the build-cache association, the efficiency analysis and the entry read are rule 2. | REQ-1, REQ-2, REQ-3 | INT-1 |
| INT-4 | modify | `client/src/volumes-networks/VolumesPanel.tsx`, `NetworksPanel.tsx` | Remove the four panels. Each panel's list is rule 1; each inspect read is rule 2. | REQ-1, REQ-2, REQ-3 | INT-1 |
| INT-5 | modify | `client/src/compose/ComposeScreen.tsx` | Remove the three panels. The project list is rule 1; the compose file read and the log stream are rule 2. | REQ-1, REQ-2, REQ-3 | INT-1 |
| INT-6 | modify | `client/src/registries/RegistriesScreen.tsx` (the two reading panels only), `client/src/builders/BuildersScreen.tsx` | Remove the five panels. The registry, builder and build-cache lists are rule 1; the repository browse and the related-images read are rule 2. | REQ-1, REQ-2, REQ-3 | INT-1 |
| INT-7 | modify | `client/src/contexts/ContextsScreen.tsx`, `client/src/plugins/PluginsScreen.tsx` | Remove the three panels. The context and plugin lists are rule 1; the plugin inspect is rule 2. | REQ-1, REQ-2, REQ-3 | INT-1 |
| INT-8 | modify | `client/src/system/SystemScreen.tsx`, `client/src/dashboard/DashboardScreen.tsx` | Remove the four panels. The dashboard's container list is rule 1; the daemon reading, the disk usage and the host overview are rule 2. | REQ-1, REQ-2, REQ-3 | INT-1 |
| INT-9 | modify | `client/src/console/RawConsoleScreen.tsx`, `client/src/coverage/CoverageMatrixScreen.tsx` | Remove the two panels. The console history read and the coverage baseline read are rule 2. | REQ-1, REQ-3 | INT-1 |
| INT-10 | modify | `client/src/shell/Shell.tsx` | Drop the screen props that existed only to feed a removed panel, and the hook readings behind them, where nothing else uses them. | REQ-1 | INT-2, INT-3, INT-5 |
| INT-11 | modify | every screen touched above | Check, screen by screen, that a retry is still reachable without leaving it — its own refresh control, or the header's. Report any screen where none is, and add none. | REQ-4 | INT-2, INT-3, INT-4, INT-5, INT-6, INT-7, INT-8, INT-9 |
| INT-12 | modify | the component specs and `index.md` of the modules touched above | Record, per component, that it draws no failure panel, how it reports a failed read, and what it shows when it has no data. | REQ-1, REQ-3 | INT-11 |

## Human acceptance

### Scenario: a screen with no data says so, without an error panel

- REQ → REQ-1, REQ-2, REQ-3
- Given → the Docker daemon is stopped
- When → the operator opens the Containers screen
- Then → the screen says its data could not be loaded, with no cause and no control
- And → no panel and no toast appear, and the header report is the only place the lost connection is
  stated

### Scenario: a read that fails on a working daemon

- REQ → REQ-1
- Given → the Docker daemon is reachable and the operator is on the Images & layers screen
- When → the operator opens an image whose layer stack cannot be read
- Then → a failure toast appears, and the page shows no panel

### Scenario: retry without leaving the screen

- REQ → REQ-4
- Given → the operator is on a screen whose data could not be loaded
- When → the operator uses the refresh control of the header
- Then → the screen reads its data again and shows it
