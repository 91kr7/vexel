---
slug: docker_management_app-inline_error_panels
date: 2026-09-03
spec: .sdd/analysis/docker_management_app-inline_error_panels.md
status: validated
---

# Batches — Errors leave the page body

Requirements: [`requirements.md`](requirements.md). Ids cited, never copied.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · failures-become-toasts | F2 — Every other failure is a toast | REQ-5, REQ-6, REQ-7, REQ-8, REQ-13 | — | certified | A failed action is reported by a toast and by nothing in the page |
| 2 · no-error-panel-in-the-page | F1 — The page body stops reporting errors | REQ-1, REQ-2, REQ-3, REQ-4 | 1 | certified | A screen with no data says so, without an error panel |
| 3 · header-connection-report | F3 — The header is the only report of the connection | REQ-9, REQ-10, REQ-11, REQ-12 | — | todo | The header names what is unreachable, and the screen fills again when it returns |

Execution order: 1 → 2 → 3. Batch 3 depends on neither of the other two, and is placed last because
the header is only the *single* report of the connection once batch 2 has removed the panels that
repeat it.

## What the code says today

Read while planning, and load-bearing for the cut below:

- One library component draws every error panel: `ErrorBanner`
  (`client/src/ui/feedback/ErrorBanner.tsx`). It has **38 call sites in feature code**, across 23
  files and every screen, plus **one in the library itself**
  (`client/src/ui/feedback/TransferProgressDialog.tsx`). This plan removes **37 of the 38 and the
  library one**. **One feature-code panel stays**: the creation refusal of D2.
- The Shell draws two of them itself (`client/src/shell/Shell.tsx`): the list of errors the failure
  reporting service holds, and the daemon-unreachable panel. Those are the two panels in the human's
  screenshot.
- The failure reporting service (`ErrorReportingProvider`) is used by 13 feature files, for
  **operation** failures only (create, remove, prune, tag, install…). Changing that one service turns
  all of those into toasts without touching a single call site.
- The list hooks — containers, images, volumes, networks, compose projects, registries, plugins,
  builders, build cache, contexts — read what the live channel delivered and set their `error`
  **only while the channel is not delivering**. So "Could not load containers" in the page body is
  the lost connection reported a second time (REQ-2), and those screens raise no toast at all
  (REQ-13).
- The Toast component already caps the stack at three and **drops the oldest when a fourth is
  pushed**. REQ-6 needs no change to it (REQ-8).
- The header pill already says `Daemon unreachable` and already carries `Retry` (REQ-11). It says
  that for a live channel that is not delivering too, which is exactly the state REQ-9 separates.

## Decisions

- **D1 — What is removed is a panel reporting a failed read**, wherever it is drawn: page body,
  detail panel or detail dialog. A failed read is not the operator's action; it is the screen
  failing to show what it exists to show. D2 adds the failure of a transfer in flight to what is
  removed.
- **D2 — One panel stays, and it is the static one.** Decided by the human on 2026-09-03: a message
  that stands still beside the control that produced it stays a panel; a message about something
  that was running becomes a toast. So the create form's refusal
  (`client/src/containers/ContainerCreateForm.tsx:291`) stays — it is the daemon's answer to a
  command, beside the form that sent it. The three transfer failures in feature code
  (`client/src/images/ImagesScreen.tsx:650` and `:712`,
  `client/src/registries/RegistriesScreen.tsx:395`) and the one in the library
  (`client/src/ui/feedback/TransferProgressDialog.tsx:159`) become toasts: a transfer that fails
  while it runs is a one-shot failure, which is REQ-5.
- **D3 — `ErrorBanner` stays in the library.** D2 leaves it one call site. Deleting it is not part
  of this plan.
- **D4 — The list hooks keep their `error`.** The screen stops drawing a panel from it and uses it
  to choose between "nothing here" and "the data could not be loaded" (REQ-3). No hook contract
  changes, so the reconnection and polling behaviour the spec excludes is untouched.
- **D5 — Recovery reuses the application's existing reload signal** (`client/src/data/reload-signal.ts`):
  it is fired once when the live channel starts delivering again, so every mounted view reads again
  (REQ-12). The channel-fed screens already fill by themselves, because the server pushes every held
  value to a channel that opens.
- **D6 — A failed read raises one toast per failed attempt.** A re-render with the same failure
  standing raises none. **Flagged to the human**: three readings run on a clock of their own (the
  container's inspect data and its process listing, every 3 s, and the host overview), so a failure
  that lasts on a reachable daemon raises a toast every three seconds. This is the literal reading
  of the rule the human gave.
- **D7 — The transfer's retry moves from the message to the dialog.** The `Transfer failed` panel
  carried an `onRetry`, and REQ-7 forbids a button on a failure toast. The transfer progress dialog
  keeps that retry as one of its own actions, beside `Close`, while the transfer has failed. The
  control is not new: it is the same one, in the dialog instead of in the message. The dialog also
  keeps its progress display where the transfer stopped, so it does not become an empty dialog once
  the message leaves it.
- **D8 — The caller reports the transfer failure, not the library.** The dialog receives the failure
  as a prop and its six call sites already hold it. Reporting from there keeps the library free of
  the connection rule of REQ-13, which lives in the reporting service.

## Coverage check

- **Every REQ is served by at least one INT.**
  REQ-1 → batch 1 INT-5, batch 2 INT-2…INT-10 and INT-12;
  REQ-2 → batch 1 INT-5, batch 2 INT-2…INT-8;
  REQ-3 → batch 2 INT-1, INT-2…INT-9, INT-12;
  REQ-4 → batch 2 INT-11;
  REQ-5 → batch 1 INT-1, INT-2, INT-4, INT-6, INT-7, INT-8, INT-9;
  REQ-6 → batch 1 INT-2, INT-4, INT-9;
  REQ-7 → batch 1 INT-2, INT-6, INT-7, INT-8, INT-9;
  REQ-8 → batch 1 INT-2;
  REQ-13 → batch 1 INT-1, INT-3, INT-5, INT-9;
  REQ-9 → batch 3 INT-1, INT-2, INT-6;
  REQ-10 → batch 3 INT-3, INT-6;
  REQ-11 → batch 3 INT-2;
  REQ-12 → batch 3 INT-4, INT-5, INT-6.
- **Every INT serves at least one REQ.** No enabling intervention without a requirement: batch 1
  INT-1 (provider nesting) serves REQ-5 and REQ-13, which cannot hold without it.
- **REQs completed across several batches**, and where each closes:
  - **REQ-1** — batch 1 removes the Shell's two panels; batch 2 removes the panels of every screen.
    It **closes in batch 2**.
  - **REQ-2** — batch 1 removes the daemon-unreachable panel; the list screens report the same lost
    connection until batch 2 removes theirs. It **closes in batch 2**.
  - Every other REQ closes in the single batch listed in the table.
