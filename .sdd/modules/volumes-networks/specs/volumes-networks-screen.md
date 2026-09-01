---
module: volumes-networks
component: VolumesNetworksScreen
type: UI component
---

# VolumesNetworksScreen

**Purpose** → the Volumes & networks screen: the two object lists, each at the full width of the
content column, so that the detail either of them reveals is full width too (REQ-70, REQ-72).

## Contract

- `<VolumesNetworksScreen networksPanel? />`
  - `networksPanel?: ReactNode` — the Networks panel.

Description:
- One column: the Volumes panel, then the Networks panel under it.
Shows:
- The `VolumesPanel` first, at the screen's full content width, fed the volume listing this screen
  reads for itself with `useVolumes()`.
- `networksPanel` below it, at the same width, when given.

## Rules and invariants

- **One list is laid out one way in this product, and it is this one: full width, one under the
  next.** This screen was the only one carrying two lists side by side — containers and images were
  already single full-width lists — so the pair was not a layout preference this screen happened to
  hold, it was **the last screen answering "how is a list laid out" differently**. Stacking removes
  that answer; it does not trade coherence for readability, it is the coherence.
- **Neither list is ever confined to a column of half the screen**, and the pair could not have been
  kept in any form. The detail is revealed as the row's own expansion, so a list's width is the
  panel's width: side by side, the panel measures 482px at 1440×1000 and 402px at 1280×800 against a
  content column of 1120px and 960px — the same constraint the delivered build showed at its worst
  (a 90px list and a 50px raw payload at 375×812), less severe but the same one. A collapsing pair
  would have repaired the phone width alone and left the desktop panel at 482px. Side by side and a
  full-width detail are incompatible; that is why this screen states no track template at all.
- **The cost, stated so that it is not mistaken for an oversight**: the two lists no longer share a
  fold. On the daemon this was measured against (2 volumes, 3 networks) the pair ended at y=598 with
  both cards wholly visible, and the stack runs to y=966 — already past the fold at 1280×800, and
  further with every row either list gains. **Reaching networks is a scroll, deliberately.** A
  reader who wants the pair back is asking for the ~250px panel back with it.
- **The volume listing is read here, so it is read only while this screen is drawn**
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40). The shell mounted
  `useVolumes()` for every screen and handed the result down; the hook now lives on the screen that
  shows it. On every other screen nobody asks for the listing — neither the browser nor, once the
  server's demand expires, the daemon (REQ-41).
- **The first painting after an absence waits, once per visit** (REQ-42). With the demand expired the
  server holds nothing to serve, so the opening read is a real reading of the daemon. Nothing is
  added to say so: the not-yet-loaded state the Volumes panel already has is what shows (REQ-45).
- While the screen is open every trigger is the one it had (REQ-43): the poll, the context switch,
  the reload signal, and the re-read after each of the panel's own actions. The header's refresh
  control reaches this listing only while the screen is open — the behaviour of every held value,
  reading again what the server holds and skipping what it does not.
- The screen owns no selection and no detail state: each panel reveals its own detail inside its own
  list, under the row it belongs to, and at most one panel is open across the two — enforced by the
  detail-panel primitive, not by this screen.
- The screen carries no actions: each panel's page-level actions sit in that panel's toolbar.

## Dependencies

- ui-library: Stack
- volumes: useVolumes
- VolumesPanel
- NetworksPanel (composed by the caller into `networksPanel`)

## Requirements served

- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-72
- plan-ui-coherence-optimisation/REQ-32
- plan-ui-coherence-optimisation/REQ-35
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-42
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-43
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-45
