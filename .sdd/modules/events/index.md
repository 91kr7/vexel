# events — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| EventStreamService | backend service | `server/src/events/event-stream-service.ts` | Subscribes to the daemon's `/events` stream, normalizes and re-publishes events, with reconnect/backoff and a backlog | `specs/event-stream-service.md` |
| GET /api/events/stream | REST endpoint | `server/src/events/events-routes.ts` | Server-Sent Events stream of normalized daemon events, backlog-primed | `specs/events-stream-endpoint.md` |
| Event stream client | frontend data client | `client/src/data/event-stream.ts` | Live-event subscription plus the by-object-type invalidation registry | `specs/event-stream-client.md` |
