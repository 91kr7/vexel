---
batch: 8 · container-exec-attach
feature: F9 — Container exec and attach
closed_req: [REQ-34, REQ-35, REQ-36]
depends: [4]
---

# Batch 8 — Container exec and attach

Carries the single documented use of the `CLAUDE.md` escape hatch: a third-party terminal emulator
needs to own its host element. It is wrapped in exactly one UI-library component; feature code only
sees typed props and callbacks.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Terminal component wrapping a third-party terminal emulator: owns the host element, applies the library's tokens to the emulator theme, exposes a typed API (write, on-input, on-resize, focus, dispose) and carries the on-the-spot comment justifying the escape hatch. It is the only place in the client aware of the emulator. | REQ-34, REQ-35 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Session-chrome primitives: session header with connection state, disconnect/detach action, and a session-ended overlay. | REQ-34, REQ-35, REQ-36 | — |
| INT-3 | create | server, containers area | Exec session over the Engine API: create with chosen command/shell, user and working directory, bidirectional stream, terminal resize, exit status, and teardown of the exec instance when the client disconnects or the view is left. | REQ-34, REQ-36 | — |
| INT-4 | create | server, containers area | Attach session over the Engine API: bidirectional stdio of a running container with a detach path that never stops the container, and teardown on disconnect. | REQ-35, REQ-36 | — |
| INT-5 | create | client, data-access layer | Interactive-session transport: duplex channel to the exec/attach endpoints, resize propagation, explicit close on unmount. | REQ-34, REQ-35, REQ-36 | INT-3, INT-4 |
| INT-6 | create | client, containers feature area | Exec/attach view: launch form (command/shell, user, working directory), live terminal, detach and close, session-ended state. | REQ-34, REQ-35, REQ-36 | INT-1, INT-2, INT-5 |
| INT-7 | modify | client, containers feature area (created by `batch-container-inspect-config`) | Offer exec and attach from the container detail surface and the container row, for running containers only. | REQ-34, REQ-35 | INT-6 |
