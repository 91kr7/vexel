---
batch: 17
feature: F14 — containers: the expanded detail stops fighting for room
closed_req: [REQ-62, REQ-63, REQ-64, REQ-65]
depends: [5]
---

# Batch 17 — containers-detail

Section 5 of the analysis — density and rhythm — kept in this plan by the gate's decision and
scheduled here so that it can be dropped as a whole batch without disturbing anything upstream.

Two measured defects, both inside an expanded row where room is scarcest:

- **the logs toolbar is three stacked rows** — stdout/stderr, timestamps, line count, since, until;
  then the filter with previous/next; then **`Download` alone on a third row**, right-aligned. The
  heaviest toolbar in the product, inside an expanded row.
- **the stats tiles are five metrics in a four-column grid**, leaving `PIDS` orphaned on a second row;
  and the first two tiles carry a progress bar while the others do not.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, containers area | The check, written and run **first**: count the toolbar's rows and assert **no row holds a single control**; assert every one of its controls is still present and hit-testable at its own centre with a **real pointer**. Then the stats grid: assert no metric is alone on a final row at 1440×1000 and 1280×800. Report the row counts and the grid's shape before and after. | REQ-62, REQ-63 | — |
| INT-2 | modify | `client/src/containers/ContainerLogsView.tsx` | Rearrange the toolbar into fewer rows with **no row holding a single button**. Every control keeps its function and its delivered behaviour — stream selection, timestamps, tail size, since/until, the search with its match count and previous/next, and `Download`, which must still deliver the **whole** buffer and not the rendered window. An arrangement change, not a capability change. | REQ-62 | INT-1 |
| INT-3 | modify | `client/src/containers/ContainerStatsView.tsx` | Make the grid's column count and the metric count agree, so `PIDS` is not orphaned; and make the tiles uniform, so that a tile without a measurable maximum does not read as a tile whose bar failed to render. The live CPU, memory, network, block-I/O and pid readings, their meters and their sparklines all keep their values and their update behaviour. | REQ-63, REQ-64 | INT-1 |
| INT-4 | modify | `client/src/containers/ContainerDetailPanel.tsx` | Adopt the detail-panel primitive, keeping every tab — Logs, Stats, Config, Processes, Inspect, and Exec/Attach for running containers — the two-column property grid, and the raw payload as selectable text. Apply the empty-section rule: a `Labels` section with a count of `0` is absent. No header actions return; the filesystem export stays in the row's menu. | REQ-65 | INT-2, INT-3 |
| INT-5 | modify | `.sdd/modules/containers/specs/container-logs-view.md`, `specs/container-stats-view.md`, `specs/container-detail-panel.md` | Record the new arrangements. English only. | REQ-62, REQ-63, REQ-65 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering the container detail | Update the coverage the rearrangement invalidates; keep every assertion about streaming, following, filtering, downloading, the stats samples, the process listing, the config edit with its recreate warning, and the exec/attach sessions. | REQ-62, REQ-63, REQ-65 | INT-2 … INT-4 |

## Constraints on this batch

- **Four certified predecessors touch this surface and none may move**: bug-1's progress dialog,
  bug-4's property column rule (identical column counts at the same measured section width), bug-5's
  absence of any copy affordance and of anything reaching the clipboard, and the `Download` that
  replaced putting a log on the clipboard — verified still delivering the whole buffer.
- The log stream is virtualised; nothing here may make the toolbar's rearrangement change what is in
  the DOM or how much of the buffer is rendered.
- The stats stream and the logs stream are cancelled on consumer disconnect; a re-arrangement that
  re-mounts a view on every render would leak a subscription per interaction.
- Feature code composes library components and nothing else.
