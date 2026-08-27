---
module: coverage
component: Swarm absence conformance check
type: build check
---

# Swarm absence conformance check

**Purpose** → fail the build when any source file of the application reads the daemon's swarm.
Swarm left the product on 2026-08-27 and the console is the only way to it
(plan-docker_management_app-swarm_removal/REQ-3, REQ-13); this is what keeps that true after the
removal, and it is the whole automated proof of the two requirements no check of this project
observes on a running cluster — because **no check of this project ever initialises a swarm**
(the human's decision of 2026-08-27).

**Why it lives in the coverage module.** The rule it guards is the coverage statement's own: swarm
is declared `console-only`, and this is the build-time proof that the product reaches it no other
way. One of its two allow-listed files is the coverage map itself. `list-order` is the precedent for
the shape — a rule and the check that guards it, indexed together.

## Contract

- `node scripts/check-swarm-absence-conformance.mjs`, run from the repository root and wired into
  the root `npm run lint` and `npm run test` — the one check that spans both source trees, which is
  why it is the root's and not a workspace's.
- Scans `client/src/**` and `server/src/**`, files `.ts`, `.tsx` and `.css`. The check trees
  (`client/test/`, `client/e2e/`, `server/test/`) are **outside** it: a check that swarm is absent
  has to be able to name swarm.
- Exit `0` and one line on success; exit `1` and one line per violation — `path:line — what was
  found` — followed by the count and the decision that has to be taken to widen the rule.

### What is refused

- an **identifier** whose name contains `swarm`, in any case — the withdrawn modules' exports, and a
  branch on a swarm state, which is what a swarm-named local or field always turns out to be
- a **string, template or regular-expression literal** whose content names swarm — an address, a
  screen id, a label, an operator-facing word
- a request to a **swarm address of the daemon**: a literal beginning `/swarm`, `/nodes`,
  `/services`, `/tasks`, `/secrets` or `/configs`, with or without the `/api` prefix. Five of those
  six carry no swarm in their spelling and are how the area returns unnoticed: the withdrawn stack
  count read `/services`
- a **label a cluster puts on its own objects**: `com.docker.stack.*`, `com.docker.swarm.*`
- a **swarm-only network named in a listing**: the literal `ingress`
- in a stylesheet, a rule naming swarm

### What is accepted

- **prose**: comments are blanked before the scan, so a comment may name swarm — explaining an
  absence is how the absence survives. This is not a ban on the word, it is a ban on swarm in the
  code and in the data the source declares.
- the **`overlay` network driver**, deliberately: it is an option of the network creation form, which
  is a Docker capability rather than a swarm read
- an import path such as `../shell/services/…`: a swarm address is recognised only where the literal
  *begins* one

### Escape hatch

- **Two files are allow-listed by name, and only two**:
  - `server/src/console/console-command.ts` — the console's warning before `docker swarm leave`, a
    command that stays executable (plan-docker_management_app-swarm_removal/REQ-11)
  - `client/src/coverage/coverage-map.ts` — the coverage statement keeps declaring the swarm areas
    (plan-docker_management_app-swarm_removal/REQ-12)
- **There is deliberately no per-line exception comment**, unlike the other two build checks of this
  repository. Widening this rule is a decision about what the product is, and it is taken in the
  check's own allow-list where it can be read, not sprinkled at a call site where it becomes a
  formality. The allow-list and this section are one decision written twice: they change together.

## Rules and invariants

- **It proves REQ-7 by construction**: the application can only behave differently on a swarm daemon
  if it *reads* something that differs. Nothing here reads anything of the swarm, so there is no
  input from which a difference could come — and that holds for every screen at once and for every
  screen not yet written, which no single run against one swarm daemon could ever have said.
- **It proves REQ-8 read the other way**: nothing names a swarm label, a swarm-only network or the
  stack namespace, so no listing can narrow what the daemon returns by a swarm criterion. An overlay
  network and a service-task container are therefore listed for the same reason `bridge` is.
- **The one thing it does not prove**, stated so nobody mistakes its reach: that a daemon in swarm
  mode returns what we expect it to return. That is Docker's behaviour, not the product's, and
  observing it would cost a swarm on the operator's machine — which is what was declined.
- It reads text and needs no parser: comments are blanked with their newlines kept, so every line
  number reported is the file's own; string, template and regular-expression literals are collected
  with the line they open on.
- It fails **closed** on the addresses: `/services` is refused whatever the caller meant by it,
  because a path cannot be judged without the client it is handed to.

## Dependencies

- none: Node's own `fs` and `path`. It deliberately imports no TypeScript compiler, so it runs from
  the repository root where two workspaces pin different compiler majors.

## Requirements served

- plan-docker_management_app-swarm_removal/REQ-3
- plan-docker_management_app-swarm_removal/REQ-7
- plan-docker_management_app-swarm_removal/REQ-8
- plan-docker_management_app-swarm_removal/REQ-13
- plan-docker_management_app-swarm_removal/REQ-15
