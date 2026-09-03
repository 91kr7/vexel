---
module: containers
component: ContainerStatsView
type: UI component
---

# ContainerStatsView

**Purpose** → a container's live resource usage: CPU, memory, network and block I/O readings that
keep updating while the view is open, each with the recent history of the metric.

## Contract

Description:

- `<ContainerStatsView container />` — `container` is the `ContainerSummary` being measured.
- **Two groups, not one row of five**: CPU and Memory on a row of two, then Net I/O, Block I/O and
  PIDs on a row of three beneath them. Each group is the library's `even-row` arrangement — **one
  track per tile**, so a group's track count is its tile count by construction and no metric can be
  left alone on a row the others do not share. Below the phone breakpoint each row becomes one
  stacked column, exactly as the single row did.
- The division is what the metrics are, not a shape chosen for the width: **the first group has a
  ceiling and the second has none**. Five equal tiles said the opposite — that the five are the same
  kind of reading — which is what a bar on every one of them followed from
  (`plan-ui-coherence-optimisation/REQ-63`, `REQ-64`, both superseded here by
  `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-13`
  … `REQ-15`; REQ-63's own reason survives, since 2 + 3 orphans no metric either).
- **CPU and Memory carry a meter**, filled against the ceiling each of them has, and a sparkline of
  the recent window on that same scale.
- **Net I/O, Block I/O and PIDs carry no meter at all** — not a bar, and not the meter's
  no-measurable-maximum state of one. They are cumulative counters: they have no maximum **in
  principle**, so there is no ceiling for a bar to be unknown about, and what tells their story is
  the shape of their history. The library's rule is untouched by this and is not widened: a caller
  that asks for a `Meter` with no maximum still gets the state that says so
  (`metric-primitives.md`); these three stop asking.

Shows:

- CPU → the current percentage of all available cores, with a meter over a `0…100` scale and a
  sparkline of the recent samples on the same scale.
- Memory → the used amount, sub-labelled with the limit and the percentage of it, with a meter and
  a sparkline scaled to the limit; when the container has no memory limit the sub-label says so, the
  meter is the no-measurable-maximum one and the sparkline falls back to a neutral, unscaled
  rendering.
- Net I/O → the bytes received and the bytes sent since the container started, as **two readings,
  each labelled (`in`, `out`) and drawn apart from the other**, never one `a / b` string in which
  the two differ only by position; and a sparkline of the recent **inbound** window.
- Block I/O → the bytes read and the bytes written since the container started, as the same two
  labelled, distinguished readings (`read`, `written`); and a sparkline of the recent **read**
  window.
- PIDs → the number of processes and threads, with a sparkline of the recent counts.
- Each of the three sparklines plots **the one series its tile is named for**, not the two summed:
  inbound, read, and the count. A sum of two directions is a curve nothing in the tile reads.
- a "Waiting for the first sample…" placeholder until the first sample arrives.
- the shared "could not be loaded" placeholder in the tiles' place when the stream fails before a
  first sample arrived.
- for a container that is neither running, paused nor restarting: a placeholder stating that the
  daemon reports usage only while a container is up, and no stream is opened at all.

Rendering of values:

- byte amounts are shown in binary units (`B`, `KB`, `MB`, `GB`, `TB`), one decimal above `1KB`.
- percentages are shown with one decimal below `10%` and rounded above it.
- CPU and memory readings are toned: neutral up to `70%`, warning from `70%`, danger from `90%`.

## Rules and invariants

- The readings update on their own for as long as the view stays mounted; leaving the view closes
  the subscription, which stops the daemon-side stream (REQ-32).
- The view never polls and never redraws on a timer: it repaints when a sample arrives.
- Which tiles carry a meter is decided by the metric and not by the moment: CPU and Memory always
  ask for one, the other three never do. A meter that appears on Net I/O, Block I/O or PIDs — in any
  of its states — is the defect, and so is a Memory tile that drops its meter when the container
  turns out to have no limit set (there the maximum is unknown, and the meter's own unbounded state
  is the answer).
- The arrangement is stated as a shape and never as a count of columns or a width: each group
  derives its tracks from the tiles placed in it, so adding or removing a metric cannot leave the two
  out of step.
- **No failure panel** (plan-docker_management_app-inline_error_panels/REQ-1): a failed statistics
  stream is reported as one toast through `useFailureReport`, and where it leaves nothing to show
  the shared "could not be loaded" placeholder stands in its place — no cause named, no control
  (…/REQ-3). The retry is the header's; none is offered here (…/REQ-4).

## Dependencies

- useContainerStats
- ui-library: MetricTile, MetricReadingPair, Meter, Sparkline, Grid, Stack, EmptyState
- app-shell: useFailureReport, FailedReadEmptyState

## Requirements served

- plan-docker_management_app/REQ-32
- plan-ui-coherence-optimisation/REQ-63 (superseded)
- plan-ui-coherence-optimisation/REQ-64 (superseded)
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-13
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-14
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-15
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-17
- plan-docker_management_app-inline_error_panels/REQ-1
- plan-docker_management_app-inline_error_panels/REQ-3
- plan-docker_management_app-inline_error_panels/REQ-4
