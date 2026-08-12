# registries — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| RegistriesService | backend service | `server/src/registries/registries-service.ts` | Registry inventory from the local Docker configuration and the daemon's registry settings, official entry first then in host order (host, account, credential store, authentication state, plain-http flag), plus login and logout delegated to the host credential store through the CLI channel | `specs/registries-service.md` |
| RegistryCatalogService | backend service | `server/src/registries/registry-catalog-service.ts` | Repository search and tag listing with per-tag size against a configured registry (Docker Hub and Distribution v2) — a catalog in repository-name order and tags in tag-name order, a Hub search keeping Hub's own ranking — and the reference a selected tag is pulled by | `specs/registry-catalog-service.md` |
| Registries endpoints | REST endpoint | `server/src/registries/registries-routes.ts` | Exposes the inventory, login/logout and repository/tag browsing; the only place a secret is accepted, and never returned | `specs/registries-endpoints.md` |
| Registries client | frontend data client | `client/src/data/registries-client.ts` | Typed `fetch` wrapper for the registry endpoints; keeps no credential | `specs/registries-client.md` |
| useRegistries | frontend hook | `client/src/data/use-registries.ts` | Reads the configured registries on a bounded poll and drives log in / log out | `specs/use-registries.md` |
| useRegistryRepositories | frontend hook | `client/src/data/use-registry-repositories.ts` | Debounced repository search over a registry, then each repository's tags with their sizes | `specs/use-registry-repositories.md` |
| RegistriesScreen | UI component | `client/src/registries/RegistriesScreen.tsx` | The Registries screen: registries with account/credential store/authentication state, log in and log out, repository and tag browser with search and sizes, and pull of a selected tag | `specs/registries-screen.md` |
