---
module: system
component: SystemOverviewService
type: backend service
---

# SystemOverviewService

**Purpose** → the whole reading a dashboard needs about the host, in one payload: container counts
by state, images, volumes, stacks, build cache and the occupied-space breakdown.

## Contract

- `getSystemOverview(): Promise<SystemOverview>`
  - `SystemOverview`: `{ containers, images, volumes, stacks, buildCache, diskUsage }`.
  - `containers`: `{ total, running, paused, stopped }` — counted from the container listing the
    server already holds, never from a listing of this service's own. `stopped` is every container
    that is neither running nor paused (created, restarting, removing, exited, dead), so
    `running + paused + stopped === total`. This application's own internal
    filesystem-extraction containers are excluded on the held listing, so they are counted nowhere.
  - `images`: `{ count, sizeBytes }` — `count` from the held image listing, `sizeBytes` the disk the
    image store occupies with shared layers counted once, from the held disk accounting.
  - `volumes`: `{ count, sizeBytes }` — `count` from the held volume listing, `sizeBytes` from the
    held disk accounting.
  - `stacks`: `{ compose, total }` — `total` is every kind of stack this application knows, which
    since 2026-08-27 is the compose projects alone, so the two figures are equal.
    - `compose` — the number of compose projects discovered on the host.
  - `buildCache`: `{ sizeBytes, activeBuilder?, unavailableDetail? }`.
    - `sizeBytes` — every build-cache record, whatever its usage state.
    - `activeBuilder` — the name of the builder `docker buildx build` uses by default; absent when
      no builder is marked active.
    - `unavailableDetail` — present exactly when the **cache inventory** could not be read;
      `sizeBytes` is then `0` and no builder is named. Reading which builder is active is a
      separate call to the same tool: in the ordinary case buildx is either there or not and the
      two agree, but if only that second call fails the section stays available and simply names
      no builder — a size that was read is still worth showing, and "no active builder" is what an
      operator can act on either way.
  - `diskUsage` — the occupied-space breakdown as `DiskUsageTotals` (images, containers, volumes,
    build cache), unchanged from the disk-usage service.
  - The payload's shape is exactly what it was before the figures behind it became held values: no
    field added, removed or renamed
    (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-23).

## Rules and invariants

- A capability the host does not have reports its reason in its own section rather than failing the
  payload: no buildx, no compose plugin — the rest of the overview is still returned. A
  daemon that cannot be reached at all does reject: there is then nothing to report, and the
  application already says so on its own. A listing this payload counts objects from rejects for the
  same reason the disk accounting does — it is the daemon that is gone, not a capability.
- A host without the compose plugin contributes `0` compose stacks rather than a reason: a missing
  plugin is a fact about the tooling, not about the host's stacks, and the Compose screen is the
  place that explains it.
- Every number comes from the service that already owns it — the container listing, the disk-usage
  accounting, the image and volume listings, the compose discovery, the build-cache and builder
  inventories — so the overview can never disagree with the screen the operator lands on after
  activating a tile. It reads nothing on its own at all: the one reading it used to take for itself
  was the daemon's service list, for a swarm stack count, and that left with the area on 2026-08-27
  (plan-docker_management_app-swarm_removal/REQ-6).
- **Every figure is assembled from a value the server already holds, so a repeated caller asks the
  daemon and the CLI for nothing.** The overview is read on the Dashboard's clock and by every open
  window, and each of those readings would otherwise be one `/system/df` and three CLI spawns. Each
  source is read through its kind's `read()` and never its `peek()`, so the overview covers the
  operation the application has just performed and asking for it counts as asking for those values,
  keeping them refreshed while the Dashboard is open
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-22).
- **Only the very first call waits for the disk accounting**, so a freshly started server paints
  real figures rather than zeros. Afterwards the reading held is answered at once and a read is asked
  for without being waited on: no repeated call ever waits for `/system/df`.
- **A count and a size shown side by side may describe different moments.** The counts follow the
  listings, which daemon events mark due, so they move as fast as their own screens; the sizes follow
  the disk accounting, held on a five-minute period, so one tile can show a count that has moved
  beside a size that has not. It is the price of adding no `/system/df` rate, and the operator's
  refresh control closes the gap on demand. This replaces the earlier guarantee that no two figures
  in one payload described the same moment.
- The reading never removes anything and never starts anything on the daemon.

## Dependencies

- system: DiskUsageService (`getDiskUsageTotals`)
- containers: ContainersService (`readHeldContainerList`)
- images: ImagesService (`imageListCache`)
- volumes: VolumesService (`volumeListCache`)
- compose: ComposeDiscoveryService (`composeProjectsCache`)
- builders: BuildersService (`builderListCache`), BuildCacheService (`buildCacheListCache`)

## Requirements served

- plan-docker_management_app/REQ-14
- plan-docker_management_app/REQ-16
- plan-docker_management_app-refresh_cache/REQ-37
- plan-docker_management_app-refresh_cache/REQ-38
- plan-docker_management_app-refresh_cache/REQ-41
- plan-docker_management_app-refresh_cache/REQ-42
- plan-docker_management_app-refresh_cache/REQ-43
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-22
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-23
