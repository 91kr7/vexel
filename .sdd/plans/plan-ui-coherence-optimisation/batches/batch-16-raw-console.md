---
batch: 16
feature: F18 — raw console
closed_req: [REQ-76, REQ-77]
depends: [5]
---

# Batch 16 — raw-console

One defect: the daemon payload renders as an **unwrapped wall of JSON that breaks mid-token**. The
screen is the product's escape hatch and the surface its full-coverage claim rests on, so an
unreadable payload is a functional loss rather than an aesthetic one.

The payload is drawn by a library component (`CodeViewer`, or the console surface's own output
region), which is where the wrapping contract belongs — not in the screen.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, raw-console area | The check, written and run **first**: run an API-channel command with a long payload and assert **no rendered line breaks inside a token**, that the block stays within its surface's box at 1440×1000, 1280×800 and 375×812, and that the text is complete and selectable — select a value out of it and compare. Report the overflow measured before and after. | REQ-76 | — |
| INT-2 | modify | `client/src/ui/data/CodeViewer.tsx` and its stylesheet | Give the block its wrapping contract: it wraps at token boundaries, stays inside its surface, and remains real selectable text in a real scroll area. Made in the library so that every raw-payload block in the product — image, container, volume, network, swarm — gains it at once. | REQ-76 | INT-1 |
| INT-3 | modify | `client/src/console/RawConsoleScreen.tsx` | Adopt the section-header, empty-state and action-cluster primitives for the screen's own chrome, and consume the wrapping block. The channel toggle, the prompt with recall, the streamed output with its exit status, the channel-and-privilege notice, the starting-point chips and the destructive confirmation all keep their behaviour. | REQ-76, REQ-77 | INT-2 |
| INT-4 | modify | `.sdd/modules/ui-library/specs/code-viewer.md`, `.sdd/modules/raw-console/specs/raw-console-screen.md` | Record the wrapping contract and the screen's new shape. English only. | REQ-76 | INT-2, INT-3 |
| INT-5 | modify | client unit and e2e suites covering the console | Update the coverage the change invalidates; keep every assertion about both channels, the cancellation, the history that never holds a possible credential, and the per-entry `Re-run`. | REQ-77 | INT-2, INT-3 |

## Constraints on this batch

- **Every entry keeps `Re-run` and its status badges with their delivered spacing**, on every entry of
  the transcript and not merely the first, and **no copy affordance returns** —
  `plan-docker_management_app-remove_copy_controls/REQ-7` removed one per transcript entry here.
- The callout on this screen is the second use of the one callout style the analysis names as already
  right; it is not restyled.
- The history must still never hold a command that could carry a credential.
- Feature code composes library components and nothing else.
