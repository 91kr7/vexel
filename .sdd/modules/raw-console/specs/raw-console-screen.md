---
module: raw-console
component: RawConsoleScreen
type: UI component
---

# RawConsoleScreen

**Purpose** → the Raw console screen: the escape hatch where any `docker` command line or any
Engine API call can be run, with the history that outlives a restart and the confirmation a
destructive entry goes through first.

## Contract

Description:

- one panel holding the console — its title, its one-line description, the channel selector, the
  channel-and-privilege notice and the console surface — over a second panel of one-click starting
  points.

Shows:

- the channel selector, `docker CLI` or `Engine API`, exactly one selected (CLI when the screen
  opens).
- the notice, restated for the selected channel: the channel's name, that entries run with the full
  privileges of the Docker daemon and of the user the server runs as, and what the channel dials —
  a local `docker` process, or a direct Engine API call — against the active context, named.
- the console transcript: the persisted history first, then this session's entries; each with the
  command as it was typed, the channel it ran on, its output, and how it ended (`exit 0`,
  `HTTP 404`, `cancelled`, `failed`) — green for a success, red for a failure, amber for a
  cancellation.
- the output of an Engine API entry — a body the daemon sends as one line with no spaces in it —
  laid over as many lines as it needs, breaking at the payload's own token boundaries: at every
  viewport the block stays inside its surface, no value is cut in half, and the text is the
  daemon's own, complete and selectable (`ui-library/payload-wrapping.md`).
- "not kept in history" on an entry whose command could carry a credential.
- the prompt, its placeholder being an example in the selected channel's own grammar.
- the starting points for the selected channel: the long tail the console exists for (manifest,
  trust, scout, sbom, buildx bake, context inspect, plugin install, events, system df, checkpoint)
  and, on the CLI channel, a second group for what no screen of its own carries — image build,
  stack deploy, a build with a cache export, and creating a TCP+TLS context. The API group ends
  with a call carrying a JSON body, written unquoted: the form the entry grammar takes as typed.

Actions:

- selecting a channel → the next entry runs on it; the notice, the placeholder and the starting
  points follow it. Entries already in the transcript keep the channel they ran on.
- pressing Enter in the prompt → runs the line (see the rules below); the prompt is cleared only
  once the line is actually going to run.
- "Re-run" on an entry → runs that entry's command again, on that entry's channel, through the same
  path as a typed one.
- "Cancel", while an entry is running → ends it; the entry keeps the output it had produced.
- up/down arrows in the prompt → walk the previous commands, the ones from before the restart
  included.
- a starting-point chip → puts that command into the prompt, ready to be completed; it never runs
  on its own.

## Rules and invariants

- Before a line runs it is classified by the server. A line classified as destructive opens the
  application's own confirmation, whose title and body name the exact command, and states what
  makes it destructive plus that it runs on the daemon of the active context. Cancelling runs
  nothing and leaves the line in the prompt.
- A confirmed command runs exactly as it was typed — never rewritten, never re-quoted, never
  supplemented.
- A classification that could not be obtained is reported and the line is not run: nothing runs
  unclassified.
- Nothing runs while another entry is running.
- The history is read once when the screen opens and survives a restart; a read that fails is
  reported as one toast, drawing nothing on the screen and emptying nothing already shown
  (plan-docker_management_app-inline_error_panels/REQ-1).
- The transcript is otherwise exactly as delivered: every entry — not only the first — carries its
  channel badge, its status badge and `Re-run`, with the spacing they were delivered with, and **no
  copy affordance**, the one that used to sit on each entry having been removed by
  `plan-docker_management_app-remove_copy_controls/REQ-7`. Obtaining an entry's output is the
  browser's own selection.
- **This screen has no empty state.** An empty transcript is a console that has not been used yet
  and says so on its own prompt line; nothing on the screen is drawn on an empty-state surface.
- **No failure panel** (plan-docker_management_app-inline_error_panels/REQ-1): this screen draws
  none, and its one failed read — the history's — is a toast. It has no empty state to fall back on,
  as stated above, so nothing takes the panel's place (…/REQ-3).

## Dependencies

- ui-library: Card, SectionHeader, SegmentedControl, StateSummaryBar, ConsoleSurface, ChipGroup,
  Stack
- raw-console: useConsole
- contexts: useContexts (the active context named in the notice)
- app-shell: ConfirmationService, ErrorReportingService, useFailureReport

## Requirements served

- plan-docker_management_app/REQ-100
- plan-docker_management_app/REQ-101
- plan-docker_management_app/REQ-102
- plan-docker_management_app/REQ-103
- plan-docker_management_app/REQ-104
- plan-docker_management_app/REQ-112
- plan-docker_management_app/REQ-114
- plan-ui-coherence-optimisation/REQ-76
- plan-ui-coherence-optimisation/REQ-77
- plan-docker_management_app-inline_error_panels/REQ-1
- plan-docker_management_app-inline_error_panels/REQ-3
