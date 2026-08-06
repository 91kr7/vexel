# containers — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| ContainersService | backend service | `server/src/containers/containers-service.ts` | Lists containers over the Engine API, runs lifecycle operations and prune, and samples CPU/memory for running containers at a bounded rate | `specs/containers-service.md` |
| Containers endpoints | REST endpoint | `server/src/containers/containers-routes.ts` | Exposes container listing, lifecycle, rename and prune to the client | `specs/containers-endpoints.md` |
| Containers client | frontend data client | `client/src/data/containers-client.ts` | Typed `fetch` wrapper for the containers endpoints | `specs/containers-client.md` |
| useContainers | frontend hook | `client/src/data/use-containers.ts` | Reads the container list, re-reading on a bounded poll and on `container` daemon events | `specs/use-containers.md` |
| ContainersScreen | UI component | `client/src/containers/ContainersScreen.tsx` | The Containers screen: toolbar, filterable/searchable table, per-row lifecycle actions, inline rename, bulk prune | `specs/containers-screen.md` |
