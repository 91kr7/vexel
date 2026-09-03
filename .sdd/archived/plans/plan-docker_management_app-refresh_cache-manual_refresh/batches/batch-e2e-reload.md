---
batch: e2e-reload
feature: The e2e suite reloads through the control
closed_req: REQ-16
depends: manual-refresh
---

# Batch — e2e reload

The requirements are in `../requirements.md` and are cited here by id.

Seven checks create a context or a builder from the CLI and then expect to see it listed. Docker
publishes no event for either kind, so today they can only wait out the period. They press the control
instead, through the product's own path. No endpoint and no hook is added for the checks.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | create | client check tree, e2e support | A helper that presses the refresh control with a real pointer at the control's own coordinates and returns when the reload has ended, read from the control's own state. No fixed delay, and no call to the endpoint behind the interface. | REQ-16 | — |
| INT-2 | modify | `client/e2e/contexts.spec.ts` | The four checks that create a context from the CLI use the helper before asserting it is listed, instead of waiting out the refresh period. What each check asserts does not change. | REQ-16 | INT-1 |
| INT-3 | modify | `client/e2e/builders.spec.ts` | The three checks that create a builder from the CLI do the same. | REQ-16 | INT-1 |

## Human acceptance

### Scenario: The context and builder checks pass without waiting out a period

- REQ → REQ-16
- Given → a context and a builder have just been created from the CLI, as those checks create them
- When → the check presses the refresh control instead of waiting
- Then → the object is listed, and the check ends without any fixed wait
