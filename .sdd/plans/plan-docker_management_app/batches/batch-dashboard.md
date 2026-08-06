---
batch: 25 · dashboard
feature: F3 — Dashboard
closed_req: [REQ-14, REQ-15, REQ-16, REQ-17, REQ-18]
depends: [2, 4, 9, 18, 20, 21]
---

# Batch 25 — Dashboard

Placed after the areas it aggregates (containers, images, volumes, stacks, build cache, events), so
its tiles carry real numbers rather than placeholders. Mostly composition: the metric, meter, list
and event surfaces already exist.

Visual reference: `.sdd/analysis/ui-mock/dashboard.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Dashboard layout variant: a row of equal metric tiles above a two-column panel grid, and a clickable/navigable variant of the metric tile and of the list row. | REQ-14, REQ-18 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Proportional usage-breakdown block: labelled rows with a colour-coded bar showing each category's share and its absolute size. | REQ-16 | — |
| INT-3 | create | server, system area | Overview aggregation in one payload: running/stopped/paused container counts, image count and size, volume count and size, stack counts split compose/swarm, build-cache size with the active builder, and the disk-usage breakdown. | REQ-14, REQ-16 | — |
| INT-4 | create | client, data-access layer | Overview query plus the container-activity and event subscriptions feeding the dashboard live. | REQ-14, REQ-15, REQ-16, REQ-17 | INT-3 |
| INT-5 | create | client, dashboard feature area | Dashboard screen: the five summary tiles, live container activity with state, CPU and uptime, the disk-usage breakdown, the recent daemon events panel, and navigation from any tile or row to the screen owning that object. | REQ-14, REQ-15, REQ-16, REQ-17, REQ-18 | INT-1, INT-2, INT-4 |
| INT-6 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the Dashboard placeholder with the real screen and make it the default landing screen when no persisted screen exists. | REQ-14 | INT-5 |
