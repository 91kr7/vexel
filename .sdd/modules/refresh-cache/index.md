# refresh-cache — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Refresh cache | backend service | `server/src/refresh-cache/refresh-cache.ts` | The values the interface asks for repeatedly, held server-side: registration of a kind with its read and period, serving from the held value, one refresher per kind, failure keeping the previous value, marking due from daemon events and from the application's own operations, the demand gate, and the discard on a context change | `specs/refresh-cache.md` |
| Held value response | backend service | `server/src/refresh-cache/refresh-cache-response.ts` | How a held value is written to an HTTP response: the body unchanged, the read time and staleness in headers | `specs/refresh-cache.md` |
