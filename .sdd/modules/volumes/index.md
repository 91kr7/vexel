# volumes — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| VolumesService | backend service | `server/src/volumes/volumes-service.ts` | Lists volumes over the Engine API named-first in name order with the anonymous ones grouped last, newest first (name, driver, mountpoint, size, mounting containers), reads a volume's full inspect data, creates, removes and prunes unused volumes — each marking the listing changed — registers that listing as a refresh-cache kind marked due by `volume` and `container` events, and holds the per-volume sizes as a kind of their own (5 min, marked due by a removal or a prune) that the listing and the inspect join in without ever waiting for it | `specs/volumes-service.md` |
| Volumes endpoints | REST endpoint | `server/src/volumes/volumes-routes.ts` | Exposes volume listing answered from the refresh cache, plus inspect, create, remove and prune | `specs/volumes-endpoints.md` |
| Volumes client | frontend data client | `client/src/data/volumes-client.ts` | Typed `fetch` wrapper for the volumes endpoints | `specs/volumes-client.md` |
| useVolumes | frontend hook | `client/src/data/use-volumes.ts` | Reads the volume list, re-reading on a bounded poll and on `volume`/`container` daemon events | `specs/use-volumes.md` |
| useVolumeInspect | frontend hook | `client/src/data/use-volume-inspect.ts` | Reads a single volume's inspect data, re-reading on `name` change, on `volume` daemon events about that same volume and on every `container` event | `specs/use-volume-inspect.md` |
