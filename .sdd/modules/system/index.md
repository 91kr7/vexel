# system — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| DiskUsageService | backend service | `server/src/system/disk-usage-service.ts` | Reclaimable disk space broken down by stopped containers, dangling images, unused volumes, unused networks and build cache, each with its size and what it holds | `specs/disk-usage-service.md` |
| PruneService | backend service | `server/src/system/prune-service.ts` | Per-category prune and scoped system-wide prune through the existing per-area prunes, reporting what was removed and the space actually reclaimed | `specs/prune-service.md` |
| System endpoints | REST endpoint | `server/src/system/system-routes.ts` | Exposes the reclaimable-space breakdown and the scoped prune to the client | `specs/system-endpoints.md` |
| System client | frontend data client | `client/src/data/system-client.ts` | Typed `fetch` wrapper for the disk-usage and prune endpoints | `specs/system-client.md` |
| useDiskUsage | frontend hook | `client/src/data/use-disk-usage.ts` | Holds the reclaimable-space breakdown, re-reading it after every prune and on the daemon events that change it; drives the prunes | `specs/use-disk-usage.md` |
| SystemScreen | UI component | `client/src/system/SystemScreen.tsx` | The System & prune screen: daemon information beside the reclaimable-space breakdown, per-category prune and scoped system prune, each confirmed with the shared-daemon warning and reporting the space reclaimed | `specs/system-screen.md` |
