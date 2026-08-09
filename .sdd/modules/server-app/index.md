# server-app — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Server bootstrap | configuration | `server/src/index.ts` | Express app bootstrap: JSON body parsing, mounts `GET /health` plus every server module's routes, the API's JSON `404` and — last, before listening — the client serving, points every area at the active context's daemon, starts the event stream service, reclaims orphaned analysis-cache files, handles the WebSocket upgrade | `specs/server-bootstrap.md` |
| Client serving | configuration | `server/src/client-serving.ts` | Serves the built interface from the API's own process and port: the build's static assets and the history fallback for page requests outside `/api`, the build directory resolved from the server's own location with the `VEXEL_CLIENT_DIST` override, and API-only operation with one reported reason when there is no build | `specs/client-serving.md` |
