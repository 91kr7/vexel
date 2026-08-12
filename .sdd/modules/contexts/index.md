# contexts — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| ContextsService | backend service | `server/src/contexts/contexts-service.ts` | Docker context inventory in name order (name, endpoint, kind, TLS, active) covering every endpoint kind, plus create for the local-socket and SSH kinds, select-active and remove through the CLI channel and the local Docker configuration | `specs/contexts-service.md` |
| DaemonInfoService | backend service | `server/src/contexts/daemon-info-service.ts` | Daemon information of the active context: versions, BuildKit, storage/cgroup drivers, OS/architecture, root directory and container counts | `specs/daemon-info-service.md` |
| Contexts endpoints | REST endpoint | `server/src/contexts/contexts-routes.ts` | Exposes the context inventory, create/use/remove and the daemon reading to the client | `specs/contexts-endpoints.md` |
| Contexts client | frontend data client | `client/src/data/contexts-client.ts` | Typed `fetch` wrapper for the contexts and daemon-information endpoints | `specs/contexts-client.md` |
| Active-context broadcast | frontend data client | `client/src/data/active-context.ts` | Announces the active-context switch so every cached view drops the previous daemon's data | `specs/active-context-broadcast.md` |
| useContexts | frontend hook | `client/src/data/use-contexts.ts` | Reads the context inventory on a bounded poll; drives create/remove/select-active and announces the switch | `specs/use-contexts.md` |
| useDaemonInfo | frontend hook | `client/src/data/use-daemon-info.ts` | Reads the daemon information of the active context, re-reading it on every switch | `specs/use-daemon-info.md` |
| ContextsScreen | UI component | `client/src/contexts/ContextsScreen.tsx` | The Contexts screen: context list with endpoint and active marker, create form (local socket / SSH), "use" to switch, remove with confirmation, and the daemon panel of the active context | `specs/contexts-screen.md` |
