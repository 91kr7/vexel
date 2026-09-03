# events — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| EventStreamService | backend service | `server/src/events/event-stream-service.ts` | Subscribes to the daemon's `/events` stream, normalizes and re-publishes events — carrying the actor's identifier as well as its name — under an identity that separates two events of one object in one second, with reconnect/backoff, a backlog, and a notification of its own connection dropping or returning | `specs/event-stream-service.md` |

The events reach the browser on the live channel (`GET /api/live`, module `live-channel`), which is
where the backlog and the `Last-Event-ID` resumption are written.
