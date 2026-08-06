# containers — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| ContainersService | backend service | `server/src/containers/containers-service.ts` | Lists containers over the Engine API, runs lifecycle operations and prune, samples CPU/memory for running containers at a bounded rate, and reads/updates a container's full configuration (in place or by recreating it) | `specs/containers-service.md` |
| Containers endpoints | REST endpoint | `server/src/containers/containers-routes.ts` | Exposes container listing, lifecycle, rename, prune, inspect and configuration update to the client | `specs/containers-endpoints.md` |
| ContainerLogsService | backend service | `server/src/containers/container-logs-service.ts` | Streams a container's logs over the Engine API (stream selection, follow, timestamps, tail, since/until) as discrete lines, cancellable on consumer disconnect | `specs/container-logs-service.md` |
| Container logs endpoint | REST endpoint | `server/src/containers/containers-routes.ts` | Exposes the container log stream to the client as server-sent events | `specs/container-logs-endpoint.md` |
| Container logs client | frontend data client | `client/src/data/container-logs-client.ts` | Typed log-line/option shapes and the log stream URL builder | `specs/container-logs-client.md` |
| useContainerLogs | frontend hook | `client/src/data/use-container-logs.ts` | Subscribes to a container's log stream with a bounded, batch-flushed buffer, reconnection and a buffer snapshot | `specs/use-container-logs.md` |
| Containers client | frontend data client | `client/src/data/containers-client.ts` | Typed `fetch` wrapper for the containers endpoints | `specs/containers-client.md` |
| useContainers | frontend hook | `client/src/data/use-containers.ts` | Reads the container list, re-reading on a bounded poll and on `container` daemon events | `specs/use-containers.md` |
| useContainerDetail | frontend hook | `client/src/data/use-container-detail.ts` | Reads a single container's inspect data, re-reading on `id` change and on `container` daemon events | `specs/use-container-detail.md` |
| ContainersScreen | UI component | `client/src/containers/ContainersScreen.tsx` | The Containers screen: toolbar, filterable/searchable table, per-row lifecycle actions, inline rename, bulk prune, row selection opening the detail panel | `specs/containers-screen.md` |
| ContainerDetailPanel | UI component | `client/src/containers/ContainerDetailPanel.tsx` | Container detail surface: Logs, Config (view/edit restart policy, limits, env, ports, mounts, health check, warning before a recreate) and Inspect (structured data plus the raw payload, copyable) tabs | `specs/container-detail-panel.md` |
| ContainerLogsView | UI component | `client/src/containers/ContainerLogsView.tsx` | The Logs tab: stream controls, live tail, search with highlighted matches, copy and download of the buffered log | `specs/container-logs-view.md` |
