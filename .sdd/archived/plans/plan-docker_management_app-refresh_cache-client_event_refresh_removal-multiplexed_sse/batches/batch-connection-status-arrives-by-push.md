---
batch: batch-connection-status-arrives-by-push
feature: The connection status arrives on the live channel, and the browser holds no clock at all
closed_req: [REQ-17, REQ-18, REQ-19, REQ-20, REQ-36, REQ-37, REQ-38, REQ-39]
depends: [batch-every-listing-arrives-by-push]
---

# batch-connection-status-arrives-by-push

The last poll in the browser. The connection status is one of the twelve values the server holds, and
it is already published on the live channel; what goes here is the browser asking for it every five
seconds. The server keeps probing Docker for real, because only a real call returns the negotiated
API and engine versions.

After this batch the browser holds no clock for a converted value, and every one of them reaches a
screen through the channel and through nothing else.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `client/src/shell/services/ConnectionStatusService.tsx` | Take the status from the pushed-value store; drop the five-second poll and its period figure. `retry()`, the re-probe on a context switch and the reload signal keep working. | REQ-17, REQ-19, REQ-20, REQ-39 | — |
| INT-2 | modify | `client/src/data/connectivity-client.ts` | Remove it if the connection status service was its only caller; otherwise leave it to the callers that remain. `GET /api/connectivity/status` itself stays as it is. | REQ-21 | INT-1 |
| INT-3 | modify | `client/src/shell/RefreshControl.tsx` | While the channel is not delivering, the control asks for the channel again. No poll is kept behind the channel for any converted value. | REQ-18 | INT-1 |
| INT-4 | create | the check trees (`client/e2e/`, `server/test/api/`) | Drive the last conversion: the daemon going away and coming back with no clock in the browser, and a channel that is down leaving the operator the stated state and a control that reconnects. | REQ-18, REQ-19, REQ-38 | INT-1, INT-3 |
| INT-5 | modify | the checks of both trees that waited out a poll of a converted value | Drive the push, or the trigger that remains. None is given a longer budget for a period that no longer exists, no assertion is softened and no coverage is deleted with the poll it used. | REQ-36, REQ-37 | INT-1 |

## Human acceptance

### Scenario: The daemon coming back is noticed with no clock in the browser

- REQ → REQ-17, REQ-19, REQ-20, REQ-39, REQ-36, REQ-37
- Given → the application is open and the Docker daemon has been stopped, so the interface shows it as unreachable
- When → the operator starts the daemon again
- Then → the interface shows it reachable again, with the API and engine versions, and the operator has pressed nothing

### Scenario: A channel that is down leaves the operator something to do

- REQ → REQ-18, REQ-38
- Given → the application is open and the connection to the server has been lost
- When → the operator presses the refresh control
- Then → the interface asks for the channel again, and the screens fill as soon as it delivers

### Scenario: Nothing in the browser is waiting on a clock

- REQ → REQ-17, REQ-39
- Given → the application is open on any screen, with the server unable to answer
- When → the operator waits
- Then → the screen keeps showing what it last received and the stated disconnected state, and no value changes on its own until the channel delivers again
