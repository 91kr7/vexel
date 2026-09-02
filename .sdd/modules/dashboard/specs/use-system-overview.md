---
module: dashboard
component: useSystemOverview
type: frontend hook
---

# useSystemOverview

**Purpose** → holds the host overview the dashboard's tiles and disk-usage breakdown are built
from.

## Contract

- `useSystemOverview(): { overview?, loaded, error?, refresh }`
  - `overview` — the last successfully read `SystemOverview`; `undefined` until the first read
    succeeds.
  - `loaded` — `true` once a read has settled, successfully or not.
  - `error` — the failure message of the last read; cleared by the next successful one, which also
    replaces the overview.
  - `refresh()` — re-reads the overview.
- The clock: one interval of **3 000 ms**, declared through the client's timing scale as
  `cadence(3000)` — started when the hook mounts and
  cleared when it unmounts.

## Rules and invariants

- The overview is read when the dashboard is opened, on the clock, when the operator asks for a
  refresh and on a context switch — and at no other moment. A daemon event triggers nothing
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-19).
- **The clock runs only while the hook is mounted**, exactly as a list screen's does: leaving the
  dashboard stops it (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-17).
- **It polls at the same period as the container list under the tiles** — 3 000 ms — so the two
  halves of one screen never show the same fact at two different times. It is affordable because the
  server assembles the overview from the values it already holds: a tick is an in-memory read and one
  HTTP round trip, and no daemon-facing rate depends on how many windows are open
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-16,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-18,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-22). This replaces the
  earlier rule that it does not poll at all, which stood while every read cost the daemon its whole
  disk-usage accounting.
- **The figures change in place and nothing announces the clock**: no indicator, no "last updated",
  no control, no setting
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-20).
- What changes fast — a container's state, its CPU, its uptime — is not read here at all: the
  container list hook already follows that live, and the dashboard uses that same list rather than
  a second one of its own.
- A context switch drops what is held and re-reads at once: the overview belongs to a daemon, not
  to the screen (REQ-93).
- A read that settles after the hook is unmounted updates nothing.
- Re-reads on the manual reload signal, and that signal waits for this read: when the
  operator's refresh ends, the screen is already showing the reloaded data. The read replaces
  the data in place — nothing is closed, navigated or reset (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- system: System client (`fetchSystemOverview`)
- timing-scale: Client timing scale (`cadence`)
- contexts: active-context broadcast (`subscribeToActiveContextChange`)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-14
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2
- plan-docker_management_app/REQ-16
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-16
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-17
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-18
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-19
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-20
