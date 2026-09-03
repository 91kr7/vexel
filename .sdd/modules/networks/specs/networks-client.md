---
module: networks
component: Networks client
type: frontend data client
---

# Networks client

**Purpose** → typed `fetch` wrapper for the networks endpoints.

## Contract

- `fetchNetworkInspect(id): Promise<NetworkInspect>` — `GET /api/networks/:id/inspect`.
- `createNetwork(input): Promise<NetworkSummary>` — `POST /api/networks`.
- `removeNetwork(id): Promise<void>` — `DELETE /api/networks/:id`.
- `pruneNetworks(): Promise<NetworkPruneResult>` — `POST /api/networks/prune`.
- `attachContainer(networkId, containerId): Promise<NetworkInspect>` — `POST
  /api/networks/:networkId/attach`.
- `detachContainer(networkId, containerId): Promise<NetworkInspect>` — `POST
  /api/networks/:networkId/detach`.
- Every call rejects with an `Error` carrying the server's own `{ error }` message (falling back to
  a generic HTTP-status message) on a non-`ok` response.

## Requirements served

- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-73
- plan-docker_management_app/REQ-74
