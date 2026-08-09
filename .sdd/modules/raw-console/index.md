# raw-console — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| ConsoleCommand | backend service | `server/src/console/console-command.ts` | What a typed line means before anything runs it: tokenization into an argv, the Engine API entry grammar, destructive recognition and credential recognition | `specs/console-command.md` |
| ConsoleCliService | backend service | `server/src/console/console-cli-service.ts` | CLI channel: runs an arbitrary `docker` command line against the active context, streaming stdout/stderr, reporting the exit code, cancellable | `specs/console-cli-service.md` |
| ConsoleApiService | backend service | `server/src/console/console-api-service.ts` | API channel: issues an arbitrary Engine API call against the active daemon and returns the raw status and body unaltered | `specs/console-api-service.md` |
| ConsoleHistoryStore | backend service | `server/src/console/console-history-store.ts` | Command history in the local store's `console-history` namespace: read at startup, appended per entry, capped, and never holding a command that could carry a credential | `specs/console-history-store.md` |
| Console endpoints | REST endpoint | `server/src/console/console-routes.ts` | Exposes the classification, both channels (the CLI one as a cancellable ndjson stream) and the history to the client | `specs/console-endpoints.md` |
| Console client | frontend data client | `client/src/data/console-client.ts` | Typed `fetch` wrapper for the console endpoints, reading the CLI channel's stream and cancelling it by aborting | `specs/console-client.md` |
| useConsole | frontend hook | `client/src/data/use-console.ts` | The console's state: the history recalled at startup, this session's entries, and the execution of a command over either channel with its output arriving as it is produced | `specs/use-console.md` |
| RawConsoleScreen | UI component | `client/src/console/RawConsoleScreen.tsx` | The Raw console screen: channel toggle, prompt with recall, streamed output with its exit status, per-entry copy and re-run, the channel-and-privilege notice, the starting-point chips, and the confirmation a destructive entry goes through | `specs/raw-console-screen.md` |
