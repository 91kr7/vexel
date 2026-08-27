---
slug: docker_management_app-swarm_removal
date: 2026-08-27
spec: .sdd/analysis/docker_management_app-swarm_removal.md
status: validated
---

# Requirements — swarm removal

> The earlier analyses and the earlier plans are **not** in scope and are never amended, whatever
> this removal withdraws: they record what was decided and built at the time (knowledge base:
> `past-analyses-and-plans-are-never-touched`). The swarm mockup lives inside `.sdd/analysis/` and
> falls under that same rule, so it stays. Component specifications and indexes are the opposite —
> they mirror the application, so they follow it (REQ-16, REQ-17, REQ-18).

## Feature — The swarm area disappears from the interface

| ID | Requirement |
|----|-------------|
| REQ-1 | The application offers no swarm screen and no swarm entry in its navigation: the navigation lists only the areas that remain, and no path through the interface leads to a swarm view. |
| REQ-2 | No cluster-membership action is offered anywhere: initialising a swarm, joining one, leaving one, displaying a join token and rotating a join token are all absent, together with the cluster-state banner that carried them. |
| REQ-3 | Nothing dead is left where the area was: no disabled navigation entry, no empty screen, no "feature removed" notice, no control that leads nowhere. |

## Feature — Swarm objects are no longer handled

| ID | Requirement |
|----|-------------|
| REQ-4 | Swarm nodes, services, tasks, swarm stacks, secrets and configs are no longer listed, inspected or acted upon anywhere in the application. |
| REQ-5 | The capability is withdrawn from the server as well as from the interface: the application exposes no endpoint that lists, inspects or acts upon a swarm object or the cluster's membership, so the feature is gone rather than hidden. |
| REQ-6 | No place outside the swarm screen summarises cluster state any longer — in particular the dashboard and the curated daemon/system information view show nothing about swarm. |

## Feature — A daemon in swarm mode changes nothing

| ID | Requirement |
|----|-------------|
| REQ-7 | On a daemon that is part of a swarm the application presents exactly the same interface, and offers exactly the same actions, as on a daemon that is not: it states nothing about the cluster and gives the operator nothing to do about it. |
| REQ-8 | Objects that exist because of swarm but are not swarm objects keep appearing on the generic screens, with the behaviour they have today: overlay and ingress networks on the networks screen, service-task containers on the containers screen. |

## Feature — A safe landing for saved state

| ID | Requirement |
|----|-------------|
| REQ-9 | An operator whose persisted state points at the removed screen lands on a valid default screen, with no error and no blank view, and the application keeps working normally from there. |

## Feature — The escape hatch stays open and is declared

| ID | Requirement |
|----|-------------|
| REQ-10 | Swarm commands stay issuable through the raw console, unfiltered and unchanged: the console refuses none of them, alters none of them, and shows the daemon's answer as the daemon gives it. |
| REQ-11 | The console's warning before a destructive command still covers the swarm commands that remain executable, by the same mechanism that covers prune and forced removals. |
| REQ-12 | The Coverage screen still declares the swarm areas, reclassified as reachable from the console only and carrying the reason, in the same form as the areas reclassified on 2026-08-07; the swarm stack deployment entry, which today justifies itself by pointing at the Swarm screen, is reworded with them so that no entry cites a screen that no longer exists. |

## Feature — Nothing else moves

| ID | Requirement |
|----|-------------|
| REQ-13 | No area other than swarm changes behaviour or appearance: containers, images, volumes, networks, compose, registries, build, contexts, plugins and system work and look exactly as they do today. Compose in particular is untouched, the shared words "stack", "service", "node" and "secret" notwithstanding. |
| REQ-14 | A shared element — a UI-library component, a service, a utility — is withdrawn only where swarm was its last consumer; wherever another consumer remains it stays in place and unchanged, the masked-value field serving both the join tokens and the registry login being the case in point. |
| REQ-15 | Views defined as faithful reproductions of the daemon's answer — inspect payloads, raw console output — still render whatever Docker puts in them, swarm fields included: nothing is filtered out of them. |

## Feature — The documented structure matches the application

| ID | Requirement |
|----|-------------|
| REQ-16 | The component specifications of the swarm module are withdrawn together with the feature, because a specification describes the application as it stands and the application no longer has this area. |
| REQ-17 | The shared graphical decision that the builders, contexts and plugins material cites only inside a swarm specification is relocated into a surviving specification before the swarm material is removed, and those three cite it there, so no surviving screen is left citing a document that no longer exists. |
| REQ-18 | No index of the project is left pointing at material that no longer exists: neither the root module index, nor a module index, nor a cross-reference from a surviving specification names a swarm specification or the swarm module. |
| REQ-19 | The project's live documents describing the product — its instruction file and its README — no longer name a swarm screen: neither among the visual references to implement, nor among the areas the product manages. |
