# builders — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| BuildersService | backend service | `server/src/builders/builders-service.ts` | buildx builder inventory (name, driver, endpoint, platforms, status, cache size, active builder) and create/remove/select-active through the CLI channel | `specs/builders-service.md` |
| BuildCacheService | backend service | `server/src/builders/build-cache-service.ts` | Build-cache inventory (id, type, size, usage state) and prune through the CLI channel, reporting the space reclaimed | `specs/build-cache-service.md` |
| Builders endpoints | REST endpoint | `server/src/builders/builders-routes.ts` | Exposes builder listing/create/remove/use and build-cache listing/prune to the client | `specs/builders-endpoints.md` |
| Builders client | frontend data client | `client/src/data/builders-client.ts` | Typed `fetch` wrapper for the builders and build-cache endpoints | `specs/builders-client.md` |
| useBuilders | frontend hook | `client/src/data/use-builders.ts` | Reads the builder list, re-reading on a bounded poll; drives create/remove/select-active | `specs/use-builders.md` |
| useBuildCache | frontend hook | `client/src/data/use-build-cache.ts` | Reads the build-cache inventory, re-reading on a bounded poll; drives prune | `specs/use-build-cache.md` |
| BuildersScreen | UI component | `client/src/builders/BuildersScreen.tsx` | The Builders & cache screen: builder inventory with active-builder switching, create/remove, and build-cache inventory with usage state and prune | `specs/builders-screen.md` |
