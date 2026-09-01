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

## Rules and invariants

- The overview is read when the dashboard is opened, when the operator asks for a refresh and on a
  context switch — and at no other moment. A daemon event triggers nothing, so between those
  moments the tiles show what was last read, and nothing on screen says so
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-10).
- It does not poll: the reading behind it is the daemon's own disk-usage accounting, expensive on a
  large host, and a dashboard left open all day must not keep the daemon busy computing it.
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
- contexts: active-context broadcast (`subscribeToActiveContextChange`)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-14
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2
- plan-docker_management_app/REQ-16
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
