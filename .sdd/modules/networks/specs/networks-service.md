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
    network, derived from the per-container `NetworkSettings.Networks` of **the container listing the
    server already holds** (`ContainersService`'s `readHeldContainerList`) and never from a listing
    of this service's own — the networks endpoint's own payload carries no attachment data; empty
    for an unattached network. The application's own internal extraction containers are excluded
    there, so none of them is ever named here.
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
  - **Derived from the container listing**, since `attachedContainers` comes from there: when the
    held container listing is replaced by one that differs by the containers kind's own declaration,
    this kind is marked due and read again **within a grouping window**, rather than holding a list
    built on a copy already gone until its 30 s period ends. It costs no container listing of its
    own — the re-read is served the one already held.
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
  Says **both** the container listing and the network listing have changed.
- `detachContainer(networkId, containerId): Promise<NetworkInspect>` — `POST
  /networks/{networkId}/disconnect` (forced); returns the network's updated inspect/attachment set
  (REQ-74). Says **both** listings have changed, as the attach does.

## Rules and invariants

- Every call rejects with a `DockerDaemonError` carrying the daemon's own message on failure.
- `attachedContainers` is read on every `listNetworks` call from the held container listing, through
  the containers kind's `read()` and never its `peek()`: it covers the operation the application has
  just performed on a container, so a container removed a moment ago is no longer named here.
  `getNetworkInspect` does not use it at all — the inspect payload's own `Containers` map is
  authoritative and stays the source there.
- **A network's `attachedContainers` is never older than the container listing the server holds.** A
  container attached to a network is named by that network within a fraction of a second of the
  daemon holding it, on a server that already holds a listing as much as on one just started — and
  the order in which the lists affected by one event happen to be read again changes nothing, since
  what the re-read follows is the listing being stored and not the event.
- **This service issues no container listing of its own.** Asking for the network list therefore
  counts as asking for the container listing, and keeps it refreshed while the networks screen is
  open — the containers kind's own demand expiry stops it once nothing is asking for either.

### The refresh cache

- `createNetwork`, `removeNetwork`, `pruneNetworks`, `attachContainer` and `detachContainer` say the
  listing has changed once they have succeeded, so the operator's own action shows on the next
  request without waiting for a timer. A failed call marks nothing.
- **An attach or a detach says it of the container listing as well**, and of that one **first**, in
  the same synchronous step. `attachedContainers` is derived from the container listing, so marking
  only the network kind makes it re-read, correctly, a listing nobody refreshed: the attached
  container would appear only once the two independent periods happened to line up. Marking the
  container listing first is what makes the network refresh that immediately follows await a read
  covering the change rather than the one before it.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError
- containers: ContainersService (`readHeldContainerList`)
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
- plan-docker_management_app-refresh_cache/REQ-37
- plan-docker_management_app-refresh_cache/REQ-38
- plan-docker_management_app-refresh_cache/REQ-41
- plan-docker_management_app-refresh_cache/REQ-42
- plan-docker_management_app-refresh_cache/REQ-43
- plan-docker_management_app-refresh_cache/REQ-52
- plan-docker_management_app-refresh_cache/REQ-54
