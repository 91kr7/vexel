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
- The five metric tiles in the library's `even-row` arrangement: **one track per tile**, so the
  column count is the metric count by construction and no metric can be left alone on a second row.
  The delivered grid fitted four columns to five metrics and orphaned `PIDS`
  (`plan-ui-coherence-optimisation/REQ-63`). Below the phone breakpoint the row becomes one stacked
  column — a stack, which is the only division of five that leaves no orphan.
- **The five tiles are built the same way**: every one of them carries its label, its reading, its
  sub-label, a meter and a sparkline, in that order
  (`plan-ui-coherence-optimisation/REQ-64`). Three of the five metrics have no ceiling to be a
  percentage of, and their meter says so rather than being left out or left empty — an absence the
  delivered build drew as an unfilled bar, indistinguishable from a bar that failed
  (`metric-primitives.md`).

Shows:

- CPU → the current percentage of all available cores, with a meter over a `0…100` scale and a
  sparkline of the recent samples on the same scale.
- Memory → the used amount, sub-labelled with the limit and the percentage of it, with a meter and
  a sparkline scaled to the limit; when the container has no memory limit the sub-label says so, the
  meter is the no-measurable-maximum one and the sparkline falls back to a neutral, unscaled
  rendering.
- Net I/O → received / sent bytes since the container started, with the no-measurable-maximum meter
  and a sparkline of the recent total (received plus sent), which rises because the reading is
  cumulative.
- Block I/O → bytes read / written since the container started, with the no-measurable-maximum meter
  and a sparkline of the recent total (read plus written), likewise cumulative.
- PIDs → the number of processes and threads, with the no-measurable-maximum meter and a sparkline
  of the recent counts.
- a "Waiting for the first sample…" placeholder until the first sample arrives.
- a failure banner carrying the stream error message verbatim, with a retry, when the stream fails.
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
- A tile carrying no meter, or a meter drawn only on the tiles that have a limit, is a defect and not
  a variant: what distinguishes a bounded reading from an unbounded one is the meter's own drawn
  state, never the presence or absence of a row inside the tile.
- The arrangement is stated as a shape and never as a count of columns or a width: the grid derives
  its tracks from the tiles placed in it, so adding or removing a metric cannot leave the two out of
  step.

## Dependencies

- useContainerStats
- ui-library: MetricTile, Meter, Sparkline, Grid, Stack, ErrorBanner, EmptyState

## Requirements served

- plan-docker_management_app/REQ-32
- plan-ui-coherence-optimisation/REQ-63
- plan-ui-coherence-optimisation/REQ-64
