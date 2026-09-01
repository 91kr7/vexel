---
module: app-shell
component: Client bootstrap
type: configuration
---

# Client bootstrap

**Purpose** → the browser entry point: it settles the clock the page will run on, then mounts the
application.

## Contract

- On load, in this order:
  1. reads the factor the serving process is using, under the reader's own bounded wait
  2. adopts it as the page's timing scale
  3. reaches the application and renders it into the `root` element
- The page renders in every case: a server that refuses the factor, fails, or never answers leaves
  the application mounted at factor `1` after a short, fixed wait, never a blank page.

## Rules and invariants

- **The order is load-bearing.** A client cadence is a module-level constant, computed the moment
  its module is first imported. Any static import of an application module here would fix every one
  of them at the shipped value before the factor could arrive, so the application is reached through
  a dynamic import and nothing above it imports an application module — only React, the stylesheet
  and the timing area, none of which holds a cadence.
- The factor is read over HTTP and never from the build environment, so the bundle a suite exercises
  is byte for byte the one an operator runs.
- Nothing else is decided here: the entry point mounts the application and holds no application
  state of its own.

## Dependencies

- app-shell: App
- timing-scale: Client timing scale, Timing-scale reader

## Requirements served

- plan-docker_management_app-timing_scale/REQ-8
- plan-docker_management_app-timing_scale/REQ-9
- plan-docker_management_app-timing_scale/REQ-13
