# Modules

| Module | Responsibility | Index |
|--------|----------------|-------|
| ui-library | The internal, domain-agnostic UI library (`client/src/ui/`): design tokens, the glass material, layout, navigation, control and feedback primitives — the only place allowed raw DOM tags and CSS. | `ui-library/index.md` |
| app-shell | The application shell that composes the UI library: navigation data, the "Vessel — Docker Control" shell, and the application-wide confirmation/error/progress/connection/event services. | `app-shell/index.md` |
| docker-access | Server-side Docker access layer: the Engine API client (unix/TCP+TLS/ssh, version negotiation, typed errors) and the local `docker`/`compose`/`buildx` CLI runner — shared by every future domain area that talks to Docker. | `docker-access/index.md` |
| connectivity | Daemon reachability, negotiated API version and CLI/plugin availability: server status service and endpoint, and the client's typed status reader. | `connectivity/index.md` |
| events | The live daemon event stream: server subscription/republish/backlog, its SSE endpoint, and the client's subscription plus object-type invalidation registry. | `events/index.md` |
| server-app | The server entrypoint that composes every server module into one running Express app. | `server-app/index.md` |
