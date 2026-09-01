---
batch: batch-plugins-registries-held
feature: The plugins and the registries are held by the server
closed_req: [REQ-54, REQ-55, REQ-56, REQ-57, REQ-58, REQ-59, REQ-60, REQ-61, REQ-62]
depends: [batch-equal-reading-kept]
---

# Batch — The plugins and the registries are held by the server

These are the last two listings the interface polls that the server holds nothing for. Every request
reaches the local Docker installation and the daemon: `GET /api/plugins` runs the CLI inventory and
the daemon inventory as one round (`plugins-routes.ts:23`), and `listRegistries()`
(`registries-service.ts:113`) reads `~/.docker/config.json`, spawns the credential helpers and asks
the engine for its index configuration. Four requests a minute each, per open window.

Half of what the human asked for is already true: `usePlugins()` is called only from
`PluginsScreen.tsx:85` and `useRegistries()` only from `RegistriesScreen.tsx:108`, so neither polls
while the operator is elsewhere. This batch closes the server half — the two readings become held
values like the other ten, so the installation is read once per period however many windows are open,
and the cache's demand gate stops the reading and drops it after a whole expiry window with nobody
asking.

Both are registered at **30 000 ms**, the figure seven of the ten kinds already use. The plugins round
is marked due by the daemon's `plugin` events, as five of the ten are by theirs. The registries
inventory has no event to hang on, and neither does the CLI half of the plugins round: a plugin
dropped into `~/.docker/cli-plugins` announces nothing, and a `docker login` writes a file. REQ-59 is
the bound for everything an event does not reach — the period plus the screen's own poll, about
three quarters of a minute, with the refresh control closing it on demand.

## What this batch builds

- **The plugins inventory reading** — a component of its own in the server's plugins area, owning the
  round the endpoint assembles inline today and registering it as a held value. It exists because the
  round is what has to be held: the two panels never showing two different moments of the same
  installation is a contract of the endpoint, and holding the two halves separately would break it.
  The registries inventory needs no new component — `listRegistries()` is already one function, and
  the kind is registered beside it, as `volumes-service.ts` does with its own.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | create | server, plugins area | The plugins round as its own component: it reads the CLI inventory and the daemon inventory together and registers that round as a held value of the refresh cache, at the declared period, marked due by `plugin` events. The round is what is held, whole. | REQ-54, REQ-55, REQ-56, REQ-58, REQ-61 | — |
| INT-2 | modify | `server/src/plugins/plugins-routes.ts` | `GET /api/plugins` stops assembling the round itself and answers from the held value, body unchanged, with the read-time headers every held value carries. A failure with nothing ever held is still mapped the way it is today. | REQ-54, REQ-60, REQ-61 | INT-1 |
| INT-3 | modify | `server/src/plugins/plugin-management-service.ts` | Install, enable, disable and remove each state that the round has changed, so the listing the screen reads back describes what the operator just did. | REQ-57 | INT-1 |
| INT-4 | modify | `server/src/registries/registries-service.ts` | Register the inventory as a held value at the same declared period, with no daemon event to hang it on. `getRegistry()` keeps reading directly — it is what a log in and a log out answer with — and both of them state that the inventory has changed. | REQ-54, REQ-55, REQ-57, REQ-58, REQ-61 | — |
| INT-5 | modify | `server/src/registries/registries-routes.ts` | `GET /api/registries` answers from the held value, body unchanged, with the read-time headers. Log in, log out and the repository browsing are untouched. | REQ-54, REQ-60, REQ-61 | INT-4 |
| INT-6 | create | module `plugins` — a spec for the new component and its index row | What is held, at what period, what marks it due, and what a `plugin` event does not cover: the round is CLI plus daemon, and a plugin dropped into the installation announces nothing. | REQ-54, REQ-55, REQ-56, REQ-58, REQ-59 | INT-1 |
| INT-7 | modify | `.sdd/modules/plugins/specs/plugins-endpoints.md`, `specs/plugin-management-service.md` and their two index rows | The endpoint's contract states it answers from the held value with the body unchanged and the round still whole; the management service's states that each of its four operations marks the round changed. | REQ-56, REQ-57, REQ-60 | INT-2, INT-3 |
| INT-8 | modify | `.sdd/modules/registries/specs/registries-service.md`, `specs/registries-endpoints.md` and their two index rows | The same for the inventory, plus the two facts of its own: no daemon event marks it due, and a log in or a log out marks it changed while still answering from a direct read. | REQ-54, REQ-55, REQ-57, REQ-58, REQ-59, REQ-60 | INT-4, INT-5 |
| INT-9 | modify | `.sdd/modules/plugins/specs/use-plugins.md`, `.sdd/modules/registries/specs/use-registries.md` | Both explain why their poll is slow, and one of them names a `docker login` typed in a terminal as what it exists to notice. State what that now costs: the period plus the poll, and the refresh control closing it on demand. | REQ-59 | INT-6, INT-7, INT-8 |
| INT-10 | create | server check tree, unit | What holding buys: many requests inside one period cost one reading of the installation, the round is stored and served whole, and a `plugin` event marks it due within the grouping window. | REQ-54, REQ-56, REQ-62 | INT-1 |
| INT-11 | create | server check tree, unit | What the operator's own action must not lose: after an install, an enable, a disable, a remove, a log in and a log out, the listing read back describes the change and never a value read before it. | REQ-57, REQ-62 | INT-3, INT-4 |
| INT-12 | create | server check tree, unit | The gate and the endpoints: a whole expiry window with nobody asking stops the reading and drops what was held, so the next request reads fresh; both endpoints answer the body they answer today, carrying the read-time headers. | REQ-55, REQ-60, REQ-62 | INT-2, INT-5 |
| INT-13 | modify | the checks that cover the two areas, file by file: `server/test/api/plugins-routes.test.ts`, `server/test/api/registries-routes.test.ts`, `server/test/api/refresh-endpoint.test.ts`, `server/test/exclusive/plugins-lifecycle-routes.test.ts`, and in the e2e tree `client/e2e/plugins.spec.ts`, `client/e2e/registries.spec.ts`, `client/e2e/plugins-row-geometry.spec.ts`, `client/e2e/registries-row-geometry.spec.ts`, `client/e2e/exclusive/plugins.spec.ts` | Census: two more kinds appear in the manual reload's answer, and every check that drives an action and then reads the listing back still gets what it drove. Neither screen changed. No assertion softened, none dropped, no budget lengthened. | REQ-57, REQ-60, REQ-61, REQ-62 | INT-10, INT-11, INT-12 |

> **INT-13's e2e half is where a held value is most likely to be caught out.** `plugins.spec.ts` and
> `registries.spec.ts` install, enable, disable, log in and log out, then read the list back — which
> is exactly REQ-57, and exactly what INT-3 and INT-4 exist for. A red there is the product, not the
> check.
>
> **INT-6 is the only `create` among the documentation**: the two plugins specs INT-7 edits already
> exist, and so do both registries ones.

## Human acceptance

### Scenario: one reading of the installation, however many windows

- REQ → REQ-54, REQ-56
- Given → three browser windows, all on the Plugins screen
- When → the operator reads the server's log of the calls it makes to Docker for one minute
- Then → it shows two readings of the installation rather than twelve, and each one reads the CLI side and the daemon side together

### Scenario: nothing is read while nobody is looking

- REQ → REQ-55
- Given → nobody on the Plugins screen and nobody on the Registries screen for more than a minute
- When → the operator reads that same log, then opens the Plugins screen
- Then → no plugin and no registry reading appears in it while both screens are closed, and opening one reads fresh

### Scenario: the operator's own action shows at once

- REQ → REQ-57
- Given → the Plugins screen, and then the Registries screen
- When → the operator disables a plugin, and logs in to a registry
- Then → each list shows the change immediately, not up to half a minute later

### Scenario: a change made in a terminal takes longer, and the refresh control closes it

- REQ → REQ-59
- Given → the Registries screen open
- When → the operator runs `docker login` in a terminal
- Then → the screen follows on its own within about three quarters of a minute, and at once if they press the refresh control

### Scenario: neither screen changed

- REQ → REQ-60, REQ-61
- Given → the Plugins and Registries screens
- When → the operator uses them as they do today, and switches context
- Then → every value, column and action is where it was, and a switch leaves both screens reading the new daemon

### Scenario: both suites are green and neither was made more patient

- REQ → REQ-62
- Given → the branch of this batch
- When → the human runs a full pass of the server suite and of the e2e suite
- Then → both are green, and no assertion was softened, dropped or given a longer budget
