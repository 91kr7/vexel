---
module: volumes
component: VolumesService
type: backend service
---

# VolumesService

**Purpose** → talks to the Docker Engine API to list local volumes with their size and mounting
containers, read a volume's full inspect data, create, remove and prune unused volumes.

## Contract

- `listVolumes(): Promise<VolumeSummary[]>` — every volume via `GET /volumes`.
  - `VolumeSummary`: `{ name, driver, mountpoint, scope, createdAt, labels, options, sizeBytes?,
    mountedBy }`.
  - `sizeBytes` — from `GET /system/df`'s per-volume `UsageData.Size`; `undefined` when the daemon
    has not computed disk usage for that volume yet.
  - `mountedBy` — names of every container (running or stopped) whose own mounts reference the
    volume, derived from `GET /containers/json?all=true`; empty for an unattached volume.
- `getVolumeInspect(name): Promise<VolumeInspect>` — via `GET /volumes/{name}`; rejects with the
  daemon's own 404 for an unknown name.
  - `VolumeInspect`: `VolumeSummary & { raw }`; `raw` is the full inspect payload exactly as
    received.
- `createVolume(input): Promise<VolumeSummary>` — `POST /volumes/create` (REQ-71).
  - `input`: `{ name?, driver?, driverOpts?, labels? }`; an empty/blank `name` lets the daemon
    generate one; an empty/blank `driver` defaults to the daemon's own default (`local`).
- `removeVolume(name): Promise<void>` — `DELETE /volumes/{name}?force=true`.
- `pruneVolumes(): Promise<VolumePruneResult>` — `POST /volumes/prune?filters={"all":["true"]}`;
  prunes every currently unused volume, named or anonymous, not just anonymous ones.
  `VolumePruneResult`: `{ removedNames: string[], reclaimedBytes: number }`.

## Rules and invariants

- Every call rejects with a `DockerDaemonError` carrying the daemon's own message on failure.
- `sizeBytes` and `mountedBy` are computed fresh on every `listVolumes`/`getVolumeInspect` call, not
  cached: they reflect other containers' mounts and the daemon's own disk-usage bookkeeping at call
  time.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError

## Requirements served

- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-71
