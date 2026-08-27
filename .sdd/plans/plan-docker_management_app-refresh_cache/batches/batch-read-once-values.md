---
batch: read-once-values
feature: Values that cannot change are read once
closed_req: REQ-1, REQ-2, REQ-3
depends: —
---

# Batch — read-once values

The requirements are in `../requirements.md` and are cited here by id only.

Two values are read over and over although nothing can change them while the application runs. This
batch stops re-reading them. It changes no screen and no payload: the same values reach the
interface, by the same route, and a value that cannot be determined degrades exactly as it does
today.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/docker/cli-runner.ts` | Determine CLI availability once for as long as the server runs and reuse the result. The detection itself does not change: the same three programs, the same parallel probe, the same shape returned, and the same degraded answer for a program that is absent. A first call still probes; every later call answers from what the first found. | REQ-1, REQ-3 | — |
| INT-2 | modify | `server/src/images/images-service.ts` | Remember an image's resolved platform against that image's identity, and ask the daemon only for identities not yet known. **Only a resolved platform is remembered**: an inspect that failed is not, so a transient failure does not hide the platform for the rest of the session — it degrades to the empty list it already degrades to and is asked again next time. Nothing else about the listing changes, ordering included. | REQ-2, REQ-3 | — |
| INT-3 | modify | `.sdd/modules/docker-access/specs/cli-runner.md`, `.sdd/modules/images/specs/images-service.md` | Carry both changes into the specifications of the components that changed, in the same turn: that CLI availability is determined once per running server, and that an image's platform is resolved once per image identity with only resolved values retained. | REQ-1, REQ-2 | INT-1, INT-2 |
| INT-4 | create | server check tree, unit | Checks that each value is obtained once and then reused: asking for CLI availability repeatedly probes the programs only on the first ask; listing images twice inspects an image only the first time, while an image whose platform could not be resolved is inspected again on the next listing. Both checks also assert the answers themselves are unchanged. | REQ-1, REQ-2, REQ-3 | INT-1, INT-2 |

## Human acceptance

### Scenario: The interface still reports the installed Docker tooling

- REQ → REQ-1, REQ-3
- Given → the application is open and connected to a daemon
- When → the operator looks at what the application reports about the local Docker tooling and the capabilities it says are unavailable
- Then → it reports exactly what it reports today: the daemon's versions, which of the CLI programs are present, and the same explanation for any capability that is unavailable because a program is missing

### Scenario: Images still show their platform

- REQ → REQ-2, REQ-3
- Given → the application is open on the Images screen with several images present
- When → the operator reads the platform of each image, and then leaves the screen and comes back
- Then → every image shows the same platform it shows today, and an image whose platform cannot be determined shows what it shows today rather than an error

### Scenario: The tooling is no longer interrogated over and over

- REQ → REQ-1
- Given → the application is open and left alone on any screen, with the operator watching the processes running on their machine
- When → the operator watches for a minute without touching the application
- Then → no `docker` process is started to ask again which programs are installed
