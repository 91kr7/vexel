# contexts — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| ContextsService | backend service | `server/src/contexts/contexts-service.ts` | Docker context inventory in name order (name, endpoint, kind, TLS, active) covering every endpoint kind, plus create for the local-socket and SSH kinds, select-active and remove through the CLI channel and the local Docker configuration — each marking the inventory changed — with that inventory registered as a refresh-cache kind, discarded like every other held value when the active context changes | `specs/contexts-service.md` |
| DaemonInfoService | backend service | `server/src/contexts/daemon-info-service.ts` | Daemon information of the active context: versions, BuildKit, storage/cgroup drivers, OS/architecture, root directory and container counts | `specs/daemon-info-service.md` |
| Contexts endpoints | REST endpoint | `server/src/contexts/contexts-routes.ts` | Exposes the context inventory answered from the refresh cache, plus create/use/remove and the daemon reading | `specs/contexts-endpoints.md` |
| Contexts client | frontend data client | `client/src/data/contexts-client.ts` | Typed `fetch` wrapper for the contexts and daemon-information endpoints | `specs/contexts-client.md` |
| Active-context broadcast | frontend data client | `client/src/data/active-context.ts` | Announces the active-context switch so every cached view drops the previous daemon's data | `specs/active-context-broadcast.md` |
| useContexts | frontend hook | `client/src/data/use-contexts.ts` | Reads the context inventory on a bounded poll; drives create/remove/select-active and announces the switch | `specs/use-contexts.md` |
| useDaemonInfo | frontend hook | `client/src/data/use-daemon-info.ts` | Reads the daemon information of the active context, re-reading it on every switch | `specs/use-daemon-info.md` |
| ContextsScreen | UI component | `client/src/contexts/ContextsScreen.tsx` | The Contexts screen: contexts in the one object list, edge to edge in an unpadded card with the section header and toolbar above it (marker, name/kind, endpoint, TLS, description, state), each row revealing its detail with the endpoint in full, create form (local socket / SSH), "Use" and "Remove" in the row's action cluster; the daemon block lives on System & prune | `specs/contexts-screen.md` |
