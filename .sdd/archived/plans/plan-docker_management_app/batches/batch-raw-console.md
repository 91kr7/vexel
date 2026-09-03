---
batch: 29 · raw-console
feature: F28 — Raw command and API console
closed_req: [REQ-100, REQ-101, REQ-102, REQ-103, REQ-104, REQ-112, REQ-114]
depends: [2, 3]
---

# Batch 29 — Raw command and API console

The escape hatch that carries the "100% coverage" claim. Both channels are real: a local `docker`
process and a direct Engine API call. REQ-114 (history across restarts, store built in batch 3)
closes here.

Visual reference: `.sdd/analysis/ui-mock/raw-console.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Console surface: scrollback of entries (command, streamed output, exit status), prompt input with history recall, per-entry copy, and a channel segmented control. | REQ-100, REQ-101, REQ-102 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Suggestion-chip group that prefills the prompt, and a privilege/scope notice block for the console header. | REQ-103, REQ-104 | — |
| INT-3 | create | server, console area | CLI channel: execute an arbitrary `docker` command line against the active context through the CLI runner, streaming stdout and stderr and returning the exit code, with cancellation. | REQ-100, REQ-104 | — |
| INT-4 | create | server, console area | API channel: issue an arbitrary Engine API call (method, path, query, body) against the active daemon and return the raw status and response body unaltered. | REQ-101, REQ-104 | — |
| INT-5 | create | server, console area | Destructive-command recognition: classify an entry (remove, prune, kill, system-wide, swarm leave, …) so the client can require the application's confirmation before it runs, naming the exact command. | REQ-112 | INT-3, INT-4 |
| INT-6 | create | server, console area | Console history persisted through the local store, retrieved at startup and appended per entry. | REQ-102, REQ-114 | — |
| INT-7 | create | client, data-access layer | Console execution over both channels with output streaming, classification result, and history read/append. | REQ-100, REQ-101, REQ-102, REQ-112, REQ-114 | INT-3, INT-4, INT-5, INT-6 |
| INT-8 | create | client, console feature area | Raw console screen: channel toggle, prompt, streamed output with exit status, history recall/re-run/copy surviving a restart, long-tail command chips, the channel-and-privilege notice, and the confirmation prompt for an entry classified as destructive. | REQ-100, REQ-101, REQ-102, REQ-103, REQ-104, REQ-112, REQ-114 | INT-1, INT-2, INT-7 |
| INT-9 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the "Raw console" placeholder with the real screen and wire the header's console action to it. | REQ-100 | INT-8 |
