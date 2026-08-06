# local-persistence — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| LocalStore | backend service | `server/src/persistence/local-store.ts` | Per-user application-data directory created on first run; namespaced, schema-versioned JSON records with serialized (safe concurrent) writes | `specs/local-store.md` |
| AnalysisCacheStore | backend service | `server/src/persistence/analysis-cache-store.ts` | Content-addressed cache for extraction/analysis artifacts keyed by image content digest: lookup, insert, invalidate, total size, clear, orphan reclaim | `specs/extraction-cache-store.md` |
| HostPathValidator | backend service | `server/src/host-fs/host-path-validator.ts` | Single entry point validating an operator-supplied host path: existence, kind, readability/writability, traversal and symlink-escape refusal | `specs/host-path-validator.md` |
| Persistence endpoints | REST endpoint | `server/src/persistence/persistence-routes.ts` | Preferences read/write and analysis-cache size/clear | `specs/persistence-endpoints.md` |
| GET/POST /api/host-paths | REST endpoint | `server/src/host-fs/host-path-routes.ts` | Exposes HostPathValidator to the client for inline path-field feedback | `specs/host-path-endpoint.md` |
| Preferences client | frontend data client | `client/src/data/preferences-client.ts` | Typed client for the preferences, analysis-cache and host-path-validation endpoints | `specs/preferences-client.md` |
| usePreferences | frontend hook | `client/src/data/use-preferences.ts` | Loads persisted operator preferences once and keeps the server in sync on every update | `specs/use-preferences.md` |
