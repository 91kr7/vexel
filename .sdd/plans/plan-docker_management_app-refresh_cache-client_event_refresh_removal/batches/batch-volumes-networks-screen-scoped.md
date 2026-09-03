---
batch: batch-volumes-networks-screen-scoped
feature: The volume and network listings are read only on their own screen
closed_req: [REQ-40, REQ-41, REQ-42, REQ-43, REQ-44, REQ-45, REQ-46]
depends: [batch-container-detail-clock]
---

# Batch — The volume and network listings are read only on their own screen

The shell calls `useVolumes()` and `useNetworks()` for every screen (`client/src/shell/Shell.tsx:95`
and `:96`), so both poll every three seconds wherever the operator is. The only consumers are the
Volumes & networks screen and the Networks panel inside it (`Shell.tsx:250-256`, inside the
`volumes-networks` branch). No rail badge and no Dashboard tile is fed by either.

The two hooks move down into the components that consume them. The shell stops mounting them and
stops passing them along; the composition keeps the shape it has —
`networksPanel={<NetworksPanel />}` — because the element is created on every render and mounted only
while that branch is drawn.

What it buys is not one poll less in the browser but the server's own reading going quiet.
`markDue()` returns at once when a kind's refresher is stopped (`refresh-cache.ts:241`), so once the
demand expires nothing reads volumes or networks at all — not the period, not a daemon event, not the
container listing they derive from.

What it costs is one wait per visit: after more than a minute away, the first painting of that screen
waits for a real reading of the daemon instead of being served from what the server held. Nothing is
added to the screen to explain it — the not-yet-loaded state it already has is what shows.

## What this batch builds

Nothing new. Two hooks change hands, and one screen and one panel start reading what they were
previously handed.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `client/src/volumes-networks/VolumesNetworksScreen.tsx` | The screen reads the volume listing itself: `volumes` leaves its props and `useVolumes()` takes its place, feeding `VolumesPanel` exactly what the shell fed it. Nothing else about the screen moves. | REQ-40, REQ-42, REQ-43, REQ-45 | — |
| INT-2 | modify | `client/src/volumes-networks/NetworksPanel.tsx` | The panel reads the network listing itself: `networks`, `loaded`, `error` and `onRefresh` leave its props and `useNetworks()` takes their place. It already reads `useContainers()` for the attach dialog, so this is the shape it is in. | REQ-40, REQ-42, REQ-43, REQ-45 | — |
| INT-3 | modify | `client/src/shell/Shell.tsx` | Stop calling `useVolumes()` and `useNetworks()`. The `volumes-networks` branch composes `<VolumesNetworksScreen networksPanel={<NetworksPanel />} />`, so neither hook runs on another screen. | REQ-40, REQ-41, REQ-44 | INT-1, INT-2 |
| INT-4 | modify | `.sdd/modules/app-shell/specs/shell.md` and its `app-shell` index row | The shell no longer feeds that screen: drop "fed the live volume list from `useVolumes()`" and the `volumes: useVolumes` dependency, and state that both listings are mounted by the screen showing them. | REQ-40, REQ-44 | INT-3 |
| INT-5 | modify | `.sdd/modules/volumes-networks/specs/volumes-networks-screen.md`, `.sdd/modules/volumes-networks/specs/networks-panel.md` and their two index rows | Both contracts lose the props they no longer take and state what each now reads for itself, when it is read, and what the first painting after an absence costs. | REQ-40, REQ-42, REQ-43, REQ-45 | INT-1, INT-2 |
| INT-6 | modify | `.sdd/modules/volumes/specs/use-volumes.md`, `.sdd/modules/networks/specs/use-networks.md` and their two index rows | Both hooks keep their contract and gain the fact that decides their cost: they run only while that screen is on screen, and with nobody there the server stops reading and drops what it held. | REQ-40, REQ-41 | INT-1, INT-2 |
| INT-7 | modify | `client/test/unit/volumes-networks-screen.test.tsx`, `client/test/unit/networks-panel.test.tsx` | Both drive their component through props that no longer exist. Drive them through the listing each component now reads; every assertion they already make stays. | REQ-45, REQ-46 | INT-1, INT-2 |
| INT-8 | create | client check tree, unit | The claim itself: with any other screen active neither listing is read, however long the clock runs; making Volumes & networks active reads both at once. | REQ-40, REQ-42, REQ-46 | INT-3 |
| INT-9 | modify | the checks that cover the two panels and what is fed from elsewhere, file by file: `client/e2e/volumes.spec.ts`, `client/e2e/networks.spec.ts`, `client/e2e/volumes-networks-reveal.spec.ts`, `client/e2e/exclusive/volumes-prune.spec.ts`, and in the client unit tree `list-hooks-unchanged.test.tsx` and `active-context-broadcast-subscribers.test.tsx` | Census: each still drives what it claims through the screen that now mounts the listings, and no rail count, tile or figure elsewhere moved. No file under `server/` is edited, no assertion softened, none dropped, no budget lengthened. | REQ-43, REQ-44, REQ-46 | INT-7, INT-8 |

> **INT-9 names `list-hooks-unchanged.test.tsx` because it is the file most likely to be assumed
> broken and is not.** It renders the eight hooks directly, so who mounts them is nothing it asserts;
> the census confirms that rather than editing it.

## Human acceptance

### Scenario: neither listing is read anywhere else

- REQ → REQ-40, REQ-44
- Given → the operator has the application open on the Containers screen, having been on Volumes & networks earlier
- When → they watch the requests the interface makes, in the browser's own network view
- Then → no volume and no network listing is asked for at all, and every count in the rail and every tile on the Dashboard reads what it read before

### Scenario: the server stops asking Docker too

- REQ → REQ-41
- Given → nobody has been on Volumes & networks for more than a minute, while containers keep starting and stopping on the host
- When → the operator reads the server's log of the calls it makes to Docker
- Then → no volume and no network reading appears in it, not on a period and not after an event

### Scenario: the screen opens on what is true now

- REQ → REQ-42, REQ-45
- Given → the operator has been away from Volumes & networks for several minutes, and a volume has been created from a terminal meanwhile
- When → they open the screen
- Then → the new volume is in the list on the first painting, after the brief loading the screen already shows, with nothing new on screen to explain the wait

### Scenario: everything the screen does still works

- REQ → REQ-43
- Given → the Volumes & networks screen is open
- When → the operator creates a network, attaches a container to it, removes a volume, switches context and presses the refresh control in the top bar
- Then → each one shows its result exactly as it does today

### Scenario: both suites are green and neither was made more patient

- REQ → REQ-46
- Given → the branch of this batch
- When → the human runs a full pass of the server suite and of the e2e suite
- Then → both are green, no file under `server/` was changed, and no assertion was softened, dropped or given a longer budget
