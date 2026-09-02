# live-channel — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Held value publisher | backend service | `server/src/live-channel/held-value-publisher.ts` | Turns a value the refresh cache stores into a message for every open channel, sends no value a channel already has, tells every channel when the held values are discarded and when a manual reload has ended, and holds the demand of every registered kind while at least one channel is open | `specs/held-value-publisher.md` |
| GET /api/live | REST endpoint | `server/src/live-channel/live-channel-routes.ts` | The one SSE stream a window opens: the daemon events with their backlog and their `Last-Event-ID` resumption, and every value the server holds, each message naming what it carries | `specs/live-channel-endpoint.md` |
| Live channel client | frontend data client | `client/src/data/live-channel.ts` | The browser's single connection to that stream: one channel per window, routing by what each message names, self-reconnecting, reporting whether it is delivering and carrying the end of a manual reload | `specs/live-channel-client.md` |
| Pushed value store | frontend data client | `client/src/data/pushed-values.ts` | What the channel delivered, held for the screens: a value delivered again unchanged replaces nothing, and a discard drops everything | `specs/pushed-value-store.md` |
