# containers — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| ContainersService | backend service | `server/src/containers/containers-service.ts` | Lists containers over the Engine API, runs lifecycle operations and prune, samples CPU/memory for running containers at a bounded rate, and reads/updates a container's full configuration (in place or by recreating it) | `specs/containers-service.md` |
| Containers endpoints | REST endpoint | `server/src/containers/containers-routes.ts` | Exposes container listing, lifecycle, rename, prune, inspect and configuration update to the client | `specs/containers-endpoints.md` |
| Containers client | frontend data client | `client/src/data/containers-client.ts` | Typed `fetch` wrapper for the containers endpoints | `specs/containers-client.md` |
| useContainers | frontend hook | `client/src/data/use-containers.ts` | Reads the container list, re-reading on a bounded poll and on `container` daemon events | `specs/use-containers.md` |
| useContainerDetail | frontend hook | `client/src/data/use-container-detail.ts` | Reads a single container's inspect data, re-reading on `id` change and on `container` daemon events | `specs/use-container-detail.md` |
| ContainersScreen | UI component | `client/src/containers/ContainersScreen.tsx` | The Containers screen: toolbar, filterable/searchable table, per-row lifecycle actions, inline rename, bulk prune, row selection opening the detail panel | `specs/containers-screen.md` |
| ContainerDetailPanel | UI component | `client/src/containers/ContainerDetailPanel.tsx` | Container detail surface: Config tab (view/edit restart policy, limits, env, ports, mounts, health check, warning before a recreate) and Inspect tab (structured data plus the raw payload, copyable) | `specs/container-detail-panel.md` |
