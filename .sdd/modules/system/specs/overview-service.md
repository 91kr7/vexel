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
  - `containers`: `{ total, running, paused, stopped }` — `stopped` is every container that is
    neither running nor paused (created, restarting, removing, exited, dead), so
    `running + paused + stopped === total`. This application's own internal
    filesystem-extraction containers are counted nowhere.
  - `images`: `{ count, sizeBytes }` — every image the daemon lists, and the disk the image store
    occupies with shared layers counted once.
  - `volumes`: `{ count, sizeBytes }`.
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

## Rules and invariants

- A capability the host does not have reports its reason in its own section rather than failing the
  payload: no buildx, no compose plugin — the rest of the overview is still returned. A
  daemon that cannot be reached at all does reject: there is then nothing to report, and the
  application already says so on its own.
- A host without the compose plugin contributes `0` compose stacks rather than a reason: a missing
  plugin is a fact about the tooling, not about the host's stacks, and the Compose screen is the
  place that explains it.
- Every number comes from the service that already owns it — the container listing, the disk-usage
  accounting, the compose discovery, the builder inventory — so the overview can never disagree
  with the screen the operator lands on after activating a tile. It reads nothing on its own at
  all: the one reading it used to take for itself was the daemon's service list, for a swarm stack
  count, and that left with the area on 2026-08-27
  (plan-docker_management_app-swarm_removal/REQ-6).
- The tile numbers and the disk-usage breakdown come from one reading each, taken together, so no
  two figures in the same payload describe different moments.
- The reading never removes anything and never starts anything on the daemon.

## Dependencies

- system: DiskUsageService (`getDiskUsageTotals`)
- containers: ContainersService (`listContainers`)
- compose: ComposeDiscoveryService (`listComposeProjects`)
- builders: BuildersService (`listBuilders`)

## Requirements served

- plan-docker_management_app/REQ-14
- plan-docker_management_app/REQ-16
