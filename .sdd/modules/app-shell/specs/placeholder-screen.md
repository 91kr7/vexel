---
module: app-shell
component: PlaceholderScreen
type: UI component
---

# PlaceholderScreen

**Purpose** → stand-in content for a screen whose real feature batch has not landed yet; also
hosts the foundation batch's end-to-end demo of the destructive-confirmation flow (REQ-6).

Since batch 30, every screen of the navigation data has its own content, so the Shell renders this
only for an active id naming none of them. The REQ-6 demo it carries is now one destructive
confirmation among many real ones (container removal, prunes, swarm leave, …), all of which go
through the same `ConfirmationService`.

## Contract

- `<PlaceholderScreen screenLabel />`
  - renders an `EmptyState` naming `screenLabel` as not built yet.
  - renders a destructive `Button` labeled "Remove demo-container".
    - on click: calls `useConfirmation().confirm({ targetName: 'demo-container', consequence,
      confirmLabel: 'Remove' })`.
    - if the human cancels: nothing else happens, the button stays labeled "Remove demo-container".
    - if the human confirms: the button becomes disabled and reads "demo-container removed"; a
      toast is pushed via `useToast()` announcing the removal.

## Rules and invariants

- No visible effect occurs before the confirmation resolves `true` (REQ-6).

## Dependencies

- ui-library: EmptyState, Button, useToast
- ConfirmationService (useConfirmation)

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-6
