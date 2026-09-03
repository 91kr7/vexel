---
module: compose
component: useComposeProjects
type: frontend hook
---

# useComposeProjects

**Purpose** → the client-side read surface for the compose project listing: what the live channel has
delivered, with no clock of its own, and the "read it again now" the screen's own control asks for.

## Contract

- `useComposeProjects(): { projects: ComposeProjectSummary[], loaded: boolean, error?: string,
  refresh: () => void }`
  - `projects` is what the channel last delivered, and an empty list until it has delivered one.
  - `loaded` becomes `true` on the first listing delivered, and goes back to `false` when the channel
    says the values held were discarded.
  - `error` carries a failure while the channel is not delivering; while it is, it carries what the
    last `refresh()` reported for this listing, and nothing when that read succeeded.
  - `refresh()` **reads again now**: it asks the server to read again every value it holds, exactly
    as the header's refresh control does, and the new listing arrives on the channel. With the
    channel not delivering there is nothing to read again, so it asks for the channel instead.

## Rules and invariants

- **It holds no clock, and issues no request of its own**: the listing arrives when the server pushes
  it, so a stack brought up or down outside the application reaches the screen with the operator
  doing nothing. The one request it ever makes is the one a press of `refresh()` asks for
  (…-multiplexed_sse/REQ-17, /REQ-33, /REQ-39).
- A lifecycle action the operator runs from this screen reaches the listing the same way: the server
  marks the projects changed and the new listing arrives on the channel (…-multiplexed_sse/REQ-25).
  The screen also calls `refresh()` when the command ends — the re-read after the operator's own
  action, kept, with its result reaching the screen on the channel like every other change.
- **This is the one converted listing whose `refresh()` asks the server**, and the reason is the
  control the Compose screen offers: "Check again", on the empty state, is drawn precisely when the
  channel *is* delivering and the list is empty. A `refresh()` that only reconnected would leave the
  press doing nothing at all. Everywhere else the same name is bound to an error retry, which only
  appears with the channel down (…-multiplexed_sse/REQ-23, /REQ-33).
- A failed ask reports only what failed **for this listing**: the answer names the values it could
  not read again, and one unrelated to compose is not shown on this screen.
- **A listing delivered again unchanged replaces nothing**: the reference in hand is kept, so the
  projects on screen are not redrawn and what the operator opened or selected stays as it was. The
  rule lives in the pushed-value store this hook reads through (…-multiplexed_sse/REQ-12).
- Reads for no reason of its own: a daemon event triggers nothing here
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1).
- Nothing is re-read on a context switch: the server discards what it holds, says so on the channel,
  and the new context's listing arrives on it (…-multiplexed_sse/REQ-24).
- The manual reload reaches this listing on the channel like any other change; what makes the refresh
  control wait for it is the channel's own end-of-reload message, not a read of this hook's
  (…-multiplexed_sse/REQ-23).

## Dependencies

- app-shell: Refresh client (`requestServerReload`)
- live-channel: Pushed value store
- live-channel: Live channel client
- compose: Compose client (`ComposeProjectSummary`, the shape the channel delivers)

## Requirements served

- plan-docker_management_app/REQ-75
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-47
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-48
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-12
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-20
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-23
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-25
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-33
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-39
