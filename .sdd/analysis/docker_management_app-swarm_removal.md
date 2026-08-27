---
request_slug: swarm_removal
date: 2026-08-27
type: evolution
size: ordinary
reference: .sdd/analysis/docker_management_app.md
---

## Request

> rimuovi completamente swarm in quanto non è utilizzato

## Reference

Evolution of [`docker_management_app.md`](docker_management_app.md), which put Swarm in scope as one
of the product's feature areas — "initialize/join/leave a swarm; manage nodes, services, tasks,
stacks and secrets/configs in swarm mode" — while already recording it as *secondary*, a
"legacy/niche orchestration mode" kept only because the founding request asked for 100% of Docker.
It shipped as a screen of four panels (nodes, services, secrets, configs & stacks) under a
cluster-state banner carrying the initialise / join / leave actions and the join tokens.

**Changes**: Swarm leaves the product entirely — the area, its screen, its navigation entry, its
dialogs, its objects and the product's own documentation of it. Every surrounding area keeps the
behaviour it has today, and swarm stays reachable only through the raw console, like any other
Docker command the application does not model.

## Business goal

The operator does not use swarm, and the area is not free to keep. The analyses on record show every
cross-cutting change — row actions, dense tables, property columns, copy controls, list ordering —
having to be carried into four more panels, and the coherence analysis recorded the swarm screen
stating "this daemon is not part of a swarm" five times at once to an operator who will never join
one. Removing it shrinks the maintained surface, the navigation, and the time each run spends
against a real daemon, at no cost to any workflow actually in use.

## Requirements

### Functional

- The application must offer no swarm feature: no swarm screen, no swarm panels, no swarm entry in
  the navigation.
- Cluster-membership actions must be gone: initialising a swarm, joining one, leaving one, and
  displaying or rotating join tokens.
- Swarm objects must no longer be listed, inspected or acted upon anywhere: nodes, services, tasks,
  swarm stacks, secrets and configs. Secrets and configs are on this list by the human's explicit
  confirmation, not by inference — Docker offers them only on a swarm manager.
- Any place that summarised cluster state outside the swarm screen must lose it, including the
  dashboard and the curated daemon/system information view.
- An operator whose persisted state points at the removed screen must land on a valid default
  screen, with no error and no blank view.
- On a daemon that is in swarm mode the application must behave exactly as on one that is not: it
  says nothing about the cluster and offers nothing to do about it.
- Swarm commands must remain issuable through the raw console, unfiltered and unchanged — the
  escape hatch is what keeps the product's "no artificial ceiling" claim honest after this removal.
- The Coverage screen must keep declaring the swarm areas, reclassified as reachable **from the
  console only** and carrying the reason — exactly as image building, build-cache import/export and
  TCP+TLS context creation were reclassified on 2026-08-07 rather than deleted. Deleting the entries
  would make the screen understate what the product actually reaches. The existing swarm stack
  deployment entry is already console-only but justifies itself by pointing at the Swarm screen, so
  its wording is redone with the others.

### Non-functional

- No area other than swarm may change behaviour or appearance: containers, images, volumes,
  networks, compose, registries, build, contexts, plugins and system are untouched.
- Objects that exist *because of* swarm but are not swarm objects must keep appearing on the generic
  screens: overlay and ingress networks on networks, service task containers on containers.
- A shared element — a UI-library component, a service, a utility — is withdrawn only if swarm was
  its last consumer; if any other consumer remains, it stays untouched. The masked-value field
  serving the join tokens also serves registry login, and is the case in point.
- No dead swarm *functionality* may survive: no disabled navigation entry, no empty screen, no
  "feature removed" notice, no control leading nowhere. This is not a ban on the word — the raw
  console's warnings before destructive commands still cover `docker swarm leave`, by the same
  mechanism that covers prune and forced removals. They are the console's safety net, not a swarm
  feature, and they stay for the same reason the commands stay.
- The product's own documentation of the feature goes with it — the swarm visual mockup and the
  feature descriptions naming it — so no later phase can reinstate it from a leftover reference.
  The Coverage screen is not documentation but a live screen of the product, and is governed by the
  functional requirement above instead.

## Assumptions

- "Completamente" means the whole vertical, interface and server capability alike, not hiding the
  screen — a hidden feature keeps every maintenance cost this removal exists to shed.
- Compose is unaffected. The compose area manages compose projects on the daemon and never depended
  on swarm; "stack" is a word the two areas share, not a shared capability.
- Views defined as faithful reproductions of the daemon's answer — inspect payloads, raw console
  output — keep whatever Docker puts in them, swarm fields included. Filtering them would be a new
  falsification, contrary to the standing decision that such a view renders the whole payload.
- No feature flag and no reinstatement path are designed. Nothing beyond removal was asked for; if
  swarm is ever needed again it is a new request against this analysis.

## Risks

- **Collateral removal.** Swarm shares its building blocks with most other screens — the common
  lists, chips, property lists and dialogs the coherence analyses record as shared. Deleting the
  area could take with it something another screen still relies on, or strand a shared capability
  whose only remaining consumer was swarm.
- **Over-reach on vocabulary.** "Stack", "service", "node" and "secret" also occur in the compose
  area and in generic Docker vocabulary. A removal driven by the words rather than by the feature
  would damage compose while looking correct.
- **A shared decision recorded in one place.** Three surviving screens — builders, contexts and
  plugins — cite a swarm specification as the only place where a graphical detail they share was
  reasoned through. That reasoning is relocated before the swarm material goes, or it goes with it.
- **A promise on record.** The founding analysis positions the product as covering 100% of Docker
  with no artificial ceiling, and this is the first deliberate subtraction of a whole Docker area.
  It is defensible only while the raw console keeps swarm reachable.

## Scope

**In scope**: complete withdrawal of the swarm area — screen and panels, navigation entry, cluster
banner and its actions, join tokens, swarm nodes, services, tasks, stacks, secrets and configs;
removal of swarm summaries from the dashboard and the daemon/system view; a safe landing for an
operator whose saved state pointed at the removed screen; removal of the feature's mockup and
documentation references.

**Out of scope**: hiding swarm behind a flag or a setting instead of removing it; any change to
compose projects; removing overlay/ingress networks or service task containers from the generic
network and container screens; filtering swarm fields out of raw inspect or console output;
restricting which commands the raw console may issue; removing the console's warnings on commands
that stay executable; deleting the swarm entries from the Coverage screen instead of reclassifying
them; withdrawing any shared element that still has a consumer outside swarm; any redesign of the
screens that remain beyond the disappearance of the swarm entry from the navigation.
