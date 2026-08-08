# volumes — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| VolumesService | backend service | `server/src/volumes/volumes-service.ts` | Lists volumes over the Engine API (name, driver, mountpoint, size, mounting containers), reads a volume's full inspect data, creates, removes and prunes unused volumes | `specs/volumes-service.md` |
| Volumes endpoints | REST endpoint | `server/src/volumes/volumes-routes.ts` | Exposes volume listing, inspect, create, remove and prune to the client | `specs/volumes-endpoints.md` |
| Volumes client | frontend data client | `client/src/data/volumes-client.ts` | Typed `fetch` wrapper for the volumes endpoints | `specs/volumes-client.md` |
| useVolumes | frontend hook | `client/src/data/use-volumes.ts` | Reads the volume list, re-reading on a bounded poll and on `volume`/`container` daemon events | `specs/use-volumes.md` |
| useVolumeInspect | frontend hook | `client/src/data/use-volume-inspect.ts` | Reads a single volume's inspect data, re-reading on `name` change and on `volume`/`container` daemon events | `specs/use-volume-inspect.md` |
