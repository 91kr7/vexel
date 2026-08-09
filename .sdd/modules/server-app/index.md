# server-app — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Server bootstrap | configuration | `server/src/index.ts` | Express app bootstrap: JSON body parsing, mounts `GET /health` plus every server module's routes, points every area at the active context's daemon, starts the event stream service, reclaims orphaned analysis-cache files | `specs/server-bootstrap.md` |
