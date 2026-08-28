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
  - **Ordered by network name** under the list-order rule (`compareNames`), with the network's `id`
    as the final comparison: `net-2` before `net-10`, and two networks carrying the **same name** —
    Docker does not guarantee network-name uniqueness — ordered by their ids rather than shuffled.
  - The same networks produce the **same sequence on every read**, whatever order the daemon
    supplied them in.
- `networkListCache` — the refresh-cache kind the listing is held under: key `networks`, period
  30 s, marked due by `network` **and `container`** daemon events — a container attaching or leaving
  changes what the list shows (see `refresh-cache.md`, module `refresh-cache`). `listNetworks` is
  its read; the listing above is unchanged by this. `getNetworkInspect` is **not** held: a detail
  read stays direct.
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

### The refresh cache

- `createNetwork`, `removeNetwork`, `pruneNetworks`, `attachContainer` and `detachContainer` say the
  listing has changed once they have succeeded, so the operator's own action shows on the next
  request without waiting for a timer. A failed call marks nothing.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError
- list-order: List order (`byNameThenIdentity`)
- refresh-cache: Refresh cache (`registerRefreshKind`)

## Requirements served

- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-73
- plan-docker_management_app/REQ-74
- plan-docker_management_app-list_ordering/REQ-9
- plan-docker_management_app-list_ordering/REQ-12
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-11
- plan-docker_management_app-refresh_cache/REQ-12
- plan-docker_management_app-refresh_cache/REQ-13
