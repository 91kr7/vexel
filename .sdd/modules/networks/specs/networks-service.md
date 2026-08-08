---
module: networks
component: NetworksService
type: backend service
---

# NetworksService

**Purpose** → talks to the Docker Engine API to list networks with their attached containers, read a
network's full inspect data, create, remove and prune unused networks, and attach/detach a container.

## Contract

- `listNetworks(): Promise<NetworkSummary[]>` — every network via `GET /networks`.
  - `NetworkSummary`: `{ id, name, driver, scope, subnet?, gateway?, ipRange?, labels, options,
    attachedContainers }`.
  - `subnet`/`gateway`/`ipRange` — from the network's own `IPAM.Config[0]`; `undefined` when the
    network carries no IPAM configuration.
  - `attachedContainers` — names of every container (running or stopped) currently attached to the
    network, derived from `GET /containers/json?all=true`'s per-container `NetworkSettings.Networks`
    (the listing endpoint's own payload carries no attachment data); empty for an unattached network.
- `getNetworkInspect(id): Promise<NetworkInspect>` — via `GET /networks/{id}`; rejects with the
  daemon's own 404 for an unknown id/name.
  - `NetworkInspect`: `NetworkSummary & { raw }`; `raw` is the full inspect payload exactly as
    received; `attachedContainers` here is read from the inspect payload's own `Containers` map
    (authoritative, unlike the listing).
- `createNetwork(input): Promise<NetworkSummary>` — `POST /networks/create` (REQ-73).
  - `input`: `{ name, driver?, subnet?, gateway?, ipRange?, options?, labels? }`; an empty/blank
    `driver` defaults to the daemon's own default (`bridge`).
- `removeNetwork(id): Promise<void>` — `DELETE /networks/{id}`.
- `pruneNetworks(): Promise<NetworkPruneResult>` — `POST /networks/prune`; prunes every network not
  currently used by a container. `NetworkPruneResult`: `{ removedNames: string[] }`.
- `attachContainer(networkId, containerId): Promise<NetworkInspect>` — `POST
  /networks/{networkId}/connect`; returns the network's updated inspect/attachment set (REQ-74).
- `detachContainer(networkId, containerId): Promise<NetworkInspect>` — `POST
  /networks/{networkId}/disconnect` (forced); returns the network's updated inspect/attachment set
  (REQ-74).

## Rules and invariants

- Every call rejects with a `DockerDaemonError` carrying the daemon's own message on failure.
- `attachedContainers` is computed fresh on every `listNetworks`/`getNetworkInspect` call, not
  cached.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError

## Requirements served

- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-73
- plan-docker_management_app/REQ-74
