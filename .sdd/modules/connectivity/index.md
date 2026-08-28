# connectivity — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| ConnectionStatusService | backend service | `server/src/connectivity/connection-status-service.ts` | Aggregates daemon reachability (with cause), negotiated Engine API version and CLI availability; registers that status as a refresh-cache kind, keeping a real probe and marking it changed whenever the daemon event stream's connection drops or returns; exposes the shared EngineClient | `specs/connection-status-service.md` |
| GET /api/connectivity/status | REST endpoint | `server/src/connectivity/connectivity-routes.ts` | Returns the connection status the refresh cache holds | `specs/connectivity-status-endpoint.md` |
| Connectivity client | frontend data client | `client/src/data/connectivity-client.ts` | Typed client for the connectivity status endpoint | `specs/connectivity-client.md` |
