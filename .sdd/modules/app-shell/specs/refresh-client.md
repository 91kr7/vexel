---
module: app-shell
component: Refresh client
type: frontend data client
---

# Refresh client

**Purpose** → the typed call behind the manual reload endpoint.

## Contract

- `requestServerReload() → Promise<{ ok, reloaded, skipped, failed }>`
  - `POST /api/refresh`, no body
  - resolves only when the server has finished reloading; `ok` is false when at least one held value
    could not be read again, and `failed` names each one with its cause
  - a non-2xx answer rejects with the HTTP status in the message

## Requirements served

- plan-docker_management_app-refresh_cache-manual_refresh/REQ-7
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-9
