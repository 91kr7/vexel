---
module: dashboard
component: DashboardScreen
type: UI component
---

# DashboardScreen

**Purpose** → the landing screen: a live overview of the daemon in five summary tiles, the current
container activity, the disk usage broken down by kind, and the most recent daemon events — every
tile and every row leading to the screen that owns what it names.

## Contract

```markdown
<DashboardScreen containers containersLoaded containersError? onRefreshContainers />
```

- `containers` — the live container list, passed in by the shell rather than read a second time
  here; `containersLoaded`, `containersError` and `onRefreshContainers` are that list's own state
  and retry.

Description:

- a row of five summary tiles above two panels side by side — container activity beside disk
  usage — with the daemon event stream across the full width underneath.
- the two panels of that middle row **end at the same y**, whichever of them holds more
  (`plan-ui-coherence-optimisation/REQ-66`). The screen states no height for either: it is the
  arrangement's guarantee, taken from `DashboardLayout`.

Shows:

- five tiles, in this order, each with a label, a value and a sub-label:
  - `Running` → the number of running containers; sub-label `"<n> stopped / paused"`, `n` being
    every container that is neither running nor paused plus the paused ones.
  - `Images` → the number of images; sub-label `"<size> on disk"`.
  - `Volumes` → the number of volumes; sub-label `"<size> on disk"`.
  - `Stacks` → the compose projects; sub-label `"<c> compose"`.
  - `Build cache` → the build cache's size; sub-label `"buildx: <active builder>"`, or
    `"buildx: no active builder"` when none is marked active, or `"buildx unavailable"` (with `—`
    for the value) when buildx could not be read.
  - before the first reading settles every tile shows `—` over `"reading…"`.
- **Container activity** — one row per container, running first, then paused, restarting, created,
  removing, exited, dead, and alphabetically by name within each state. Each row carries a status
  dot coloured by state (running green, paused/restarting amber, dead red, the rest grey), the
  container's name, its state in words, its CPU as `"<n>% cpu"` and its uptime.
  - uptime → the daemon's own uptime text with the leading `"Up "` dropped (e.g. `"3 days"`); a
    container that is not running has none and shows `–`.
  - a CPU reading the daemon has not sampled shows `—`, stated as an absent sample rather than
    drawn as a zero or left blank — which covers a container that is not running, one not yet
    sampled, and one whose reading has gone stale because the sampling gate was shut.
  - no container on the daemon → "No container on this daemon"; before the list settles, "Reading
    the containers…".
- **Disk usage** — one row per category, in the order images, containers, volumes, build cache,
  each with its absolute size and a bar as long as its share of the total; the panel's description
  is the total, and a **legend under the rows names what each of the chart's colours means**
  (`plan-ui-coherence-optimisation/REQ-67`).
  - a category holding nothing reads `0B` and still draws a bar — the zero-length one — so that it
    is told apart from a category that could not be read, which reads `"unavailable"` in place of
    its size and draws the unmeasured track instead of a bar
    (`plan-ui-coherence-optimisation/REQ-68`).
- **Daemon event stream** — the most recent daemon events, newest first, timestamped in local time;
  with none yet, "No daemon events yet.".
- a failed overview reading, and a failed container reading, each show their own error banner with
  the message verbatim and a retry.

Actions:

- activating any of the five tiles, or any disk-usage row → navigates (see below).
- activating a container-activity row → navigates to the Containers screen.

Navigation:

- `Running` tile, `Containers` disk-usage row, any activity row → Containers.
- `Images` tile, `Images` disk-usage row → Images & layers.
- `Volumes` tile, `Volumes` disk-usage row → Volumes & networks.
- `Stacks` tile → Compose.
- `Build cache` tile, `Build cache` disk-usage row → Builders & cache.

## Rules and invariants

- Every tile figure and the disk-usage breakdown come from one server-side reading, so no two of
  them can describe different moments or disagree with the screen the operator lands on.
- The container activity is the shell's own container list, not a second reading: it is already
  refreshed live, and a dashboard that read its own would show a different count from the tile
  beside it.
- The recent events are the application-wide event stream every screen shares; the dashboard adds no
  subscription of its own and formats each entry only for display.
- The uptime is the daemon's own text, never recomputed here: an uptime this screen calculated would
  drift from the one the Containers screen shows.
- Navigation goes through the shared cross-navigation service, the same channel every other
  cross-screen reference uses; the request names the destination screen only. Naming a particular
  object inside it was left out deliberately: of the destinations here, none reveals a named object
  today, and a request no screen acknowledges would sit pending forever.
- Every visual element comes from the UI library; the screen holds no markup and no style of its
  own — including the row of two panels ending level, which is `DashboardLayout`'s answer and not a
  height this screen writes (`plan-ui-coherence-optimisation/REQ-28`, `REQ-66`).
- Every section of the screen is titled by the one section-header treatment, every empty result is
  the empty-state primitive, and the activity list is the object list with **no column contract of
  its own**: it declares its columns and nothing else — no minimum, no breakpoint-conditional set,
  no width written to compensate for one (`plan-ui-coherence-optimisation/REQ-69`).
- **This screen is a consumer of the sampled per-container figures**, exactly as the containers
  list is, and holds the subscription that keeps the daemon being sampled while it is on screen
  (`useStatsSubscription`). The gate is on consumers rather than on one named screen: leaving this
  screen closes it, coming back opens it, and the CPU reading is current here whether or not the
  containers screen was ever opened.
- The daemon event stream is presented **here and nowhere else** in the application
  (`plan-ui-coherence-optimisation/REQ-71`): this screen is the stream's one home, and the shell
  provides the subscription it reads.

## Dependencies

- ui-library: DashboardLayout, MetricTile, UsageBreakdown, DataTable, StatusDotCell, MetaCell, Card,
  SectionHeader, EventStream, EmptyState, ErrorBanner, Stack
- dashboard: useSystemOverview
- containers: useContainers (through the shell), useStatsSubscription
- app-shell: DaemonEventStreamProvider (`useDaemonEventStream`), CrossNavigationProvider
  (`useCrossNavigation`)

## Requirements served

- plan-docker_management_app/REQ-12
- plan-docker_management_app/REQ-14
- plan-docker_management_app/REQ-15
- plan-docker_management_app/REQ-16
- plan-docker_management_app/REQ-17
- plan-docker_management_app/REQ-18
- plan-ui-coherence-optimisation/REQ-66
- plan-ui-coherence-optimisation/REQ-67
- plan-ui-coherence-optimisation/REQ-68
- plan-ui-coherence-optimisation/REQ-69
- plan-docker_management_app-containers_card_view/REQ-45
- plan-docker_management_app-containers_card_view/REQ-52
