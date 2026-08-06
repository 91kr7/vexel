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
- a responsive grid of metric tiles, one per metric.

Shows:

- CPU → the current percentage of all available cores, with a meter over a `0…100` scale and a
  sparkline of the recent samples on the same scale.
- Memory → the used amount, sub-labelled with the limit and the percentage of it, with a meter and
  a sparkline scaled to the limit; when the container has no memory limit the sub-label says so and
  both meter and sparkline fall back to a neutral, unscaled rendering.
- Net I/O → received / sent bytes since the container started.
- Block I/O → bytes read / written since the container started.
- PIDs → the number of processes and threads.
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

## Dependencies

- useContainerStats
- ui-library: MetricTile, Meter, Sparkline, Grid, Stack, ErrorBanner, EmptyState

## Requirements served

- plan-docker_management_app/REQ-32
