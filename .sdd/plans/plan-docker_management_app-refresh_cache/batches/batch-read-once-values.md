---
batch: read-once-values
feature: Values that cannot change are read once
closed_req: REQ-1, REQ-2, REQ-3
depends: —
---

# Batch — read-once values

The requirements are in `../requirements.md` and are cited here by id only.

Two values are read over and over although nothing can change them while the application runs. This
batch stops re-reading them. No screen and no payload changes: the same values reach the interface,
by the same route, and a value that cannot be determined degrades exactly as it does today.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/docker/cli-runner.ts` | Determine CLI availability once for as long as the server runs and reuse it. The probe itself is unchanged: same three programs, same parallel run, same shape returned, same degraded answer for one that is absent. | REQ-1, REQ-3 | — |
| INT-2 | modify | `server/src/images/images-service.ts` | Remember an image's resolved platform against that image's identity, and inspect only identities not yet known. **Only a resolved platform is remembered**, so a failed inspect is retried next time rather than hiding the platform for the session. | REQ-2, REQ-3 | — |
| INT-3 | modify | `.sdd/modules/docker-access/specs/cli-runner.md`, `.sdd/modules/images/specs/images-service.md` | Carry both changes into the specs of the components that changed, in the same turn: availability determined once per running server, platform resolved once per image identity with only resolved values retained. | REQ-1, REQ-2 | INT-1, INT-2 |
| INT-4 | create | server check tree, unit | Checks that each value is obtained once and reused: repeated asks probe the programs only the first time; listing images twice inspects an image only the first time, while an unresolved one is inspected again. Both assert the answers are unchanged. | REQ-1, REQ-2, REQ-3 | INT-1, INT-2 |

## Human acceptance

### Scenario: The interface still reports the installed Docker tooling

- REQ → REQ-1, REQ-3
- Given → the application is open and connected to a daemon
- When → the operator looks at what it reports about the local Docker tooling and at the capabilities it says are unavailable
- Then → it reports exactly what it reports today: the daemon's versions, which CLI programs are present, and the same explanation for a capability unavailable because a program is missing

### Scenario: Images still show their platform

- REQ → REQ-2, REQ-3
- Given → the application is open on the Images screen with several images present
- When → the operator reads the platform of each image, then leaves the screen and comes back
- Then → every image shows the platform it shows today, and one whose platform cannot be determined shows what it shows today rather than an error

### Scenario: The tooling is no longer interrogated over and over

- REQ → REQ-1
- Given → the application is open and left alone on any screen, with the operator watching the processes running on their machine
- When → the operator waits a minute without touching the application
- Then → no `docker` process is started to ask again which programs are installed
