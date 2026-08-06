# server-app — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Server bootstrap | configuration | `server/src/index.ts` | Express app bootstrap: mounts `GET /health` plus every server module's routes, starts the event stream service | `specs/server-bootstrap.md` |
