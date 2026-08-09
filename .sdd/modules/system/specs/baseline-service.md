---
module: system
component: BaselineService
type: backend service
---

# BaselineService

**Purpose** → the Docker baseline the application's coverage statement was written against, next to
the versions of the daemon currently connected, so a divergence between the two can be seen rather
than guessed.

## Contract

- `getBaselineReport(): Promise<BaselineReport>`
  - `BaselineReport`: `{ declared, daemon?, daemonUnavailableDetail?, comparison }`.
  - `declared`: `{ engineApiVersion, cliVersion }` — the Engine API version this application was
    written against (the Docker access layer's own `CLIENT_MAX_API_VERSION`, so the number exists
    once in the product), and the docker CLI release line that ships it.
  - `daemon`: `{ version, apiVersion, minApiVersion? }` — the connected daemon's own Docker version,
    the highest Engine API it serves, and the oldest it accepts. Absent exactly when the daemon
    could not be read.
  - `daemonUnavailableDetail` — the failure's own message; present exactly when `daemon` is absent.
  - `comparison`: `"match" | "daemon-newer" | "daemon-older" | "unknown"`, computed from
    `daemon.apiVersion` against `declared.engineApiVersion`:
    ```
    no daemon reading, or either version not "<major>.<minor>" → unknown
    same major and minor                                        → match
    daemon above the declared baseline                          → daemon-newer
    daemon below the declared baseline                          → daemon-older
    ```

## Rules and invariants

- An unreachable daemon never fails the reading: what the application declares is true whether or
  not a daemon answers, and the coverage screen must still be able to state it. The failure travels
  in `daemonUnavailableDetail`, and `comparison` is then `unknown` (REQ-106).
- The daemon's versions come from the existing daemon-information reading of the active context, so
  the version is never queried a second way and can never disagree with what the Contexts and
  System screens show for the same daemon.
- The declared Engine API baseline is read from the Engine client's own maximum, never restated:
  the version the product talks and the version it claims coverage for are one number.
- The reading is read-only: it starts, changes and removes nothing on the daemon.
- The baseline is a property of the application, not of the operator's installation: no
  configuration, preference or environment variable changes it.

## Dependencies

- contexts: DaemonInfoService (`getDaemonInfo`)
- docker-access: Engine API client (`CLIENT_MAX_API_VERSION`)

## Requirements served

- plan-docker_management_app/REQ-106
