---
module: live-channel
component: Held value publisher
type: backend service
---

# Held value publisher

**Purpose** → turns a value the refresh cache has just stored into a message for every open live
channel, and holds the cache's demand while at least one channel is open.

## Contract

- `openChannel(sink) → () => void` — registers one open channel and returns the function that closes
  it.
  - on open, the channel is written every value the server currently holds, and nothing for a value
    not held yet
  - from then on it is written each value as the cache stores it, one message per value
  - the returned function releases the channel; calling it twice releases once
- What a channel is asked to do, and nothing more (`ChannelSink`):
  - `sendValue(payload)` → one value message; `payload` is `{"name": <the value's key>, "value": <the
    value>}`, already serialised
  - `sendDiscarded()` → the values held are gone
  - `sendReloadEnded()` → a manual reload has ended

## Rules and invariants

- A value whose message equals the last one sent **on that channel** is not sent again, so a quiet
  host produces no traffic and a value in hand is never replaced by an identical one.
- A value is written the moment it is stored, on its own: a value that changes often never delays a
  value that changes rarely.
- The first channel to open holds the demand of **every registered kind**; the last one to close
  releases it. One set of holds serves every channel, so the number of open channels does not change
  how often Docker is read, and no value is read while no channel is open.
- On a discard, every channel is told the held values are gone and its record of what it has been
  sent is emptied, so the value that arrives next reaches it even if the same one was sent before the
  discard.
- The message for the end of a reload is written after the values that reload changed, so a reader
  of one channel that sees it has already been given them.
- It starts no read and knows no Docker vocabulary: it is told what was stored and writes it.

## Dependencies

- Refresh cache (module `refresh-cache`) — the announcements it subscribes to and the demand it holds

## Requirements served

- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-4
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-6
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-12
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-13
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-14
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-15
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-16
