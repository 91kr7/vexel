---
module: app-shell
component: CrossNavigationProvider, useCrossNavigation
type: frontend service
---

# CrossNavigationProvider, useCrossNavigation

**Purpose** → lets a screen reach an object that lives on another screen in one move (REQ-68,
REQ-69): the asking screen names the destination, the shell brings that screen into view, and the
destination screen reveals the object and acknowledges the request.

## Contract

- `<CrossNavigationProvider>` wraps the shell; every screen below it can ask and be asked.
- `useCrossNavigation(): { request?, navigateTo, consumeRequest }`
  - `navigateTo({ screenId, objectId?, position? })` → posts a request for that screen;
    `objectId` names the object in the destination screen's own terms, `position` a place inside it
    (e.g. a layer index).
  - `request` → the pending request, plus a `requestId` that differs between two consecutive
    requests, so asking twice for the same target is honored twice.
  - `consumeRequest()` → clears the pending request; the destination screen calls it once it has
    revealed the object.
- Used outside a provider → throws.

## Rules and invariants

- Only one request is pending at a time: a new one replaces an unconsumed one.
- The service moves no screen itself: it only records the request. Switching the active screen is
  the Shell's doing, revealing the object is the destination screen's.
- The request carries no domain vocabulary beyond an object id and a position, so any screen pair
  can use it.

## Requirements served

- plan-docker_management_app/REQ-68
- plan-docker_management_app/REQ-69
