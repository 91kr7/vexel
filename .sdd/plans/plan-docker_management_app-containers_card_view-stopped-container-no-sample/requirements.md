---
slug: docker_management_app-containers_card_view-stopped-container-no-sample
date: 2026-08-31
spec: chat, 2026-08-31 — the business spec was given in the conversation; no analysis file exists for this cycle
status: validated
---

# Requirements — The card of a stopped container says *no sample* again

Correction of a delivered defect. The behaviour asked for here is already required by
[`plan-docker_management_app-containers_card_view/REQ-16`](../plan-docker_management_app-containers_card_view/requirements.md)
and by the batch 2 acceptance text of that plan; the product does not honour it. That plan stays
certified and is not edited — see [[past-analyses-and-plans-are-never-touched]]. Ids below are local
to this plan: `REQ-1` here is not `plan-docker_management_app-containers_card_view/REQ-1`.

**What the operator sees today.** A container that has been stopped keeps showing `0.0%` on its
card, beside the `EXITED` pill, for up to ten seconds. "Not measured" and "measured zero" are then
the same picture, which is the one distinction this part of the screen exists to make.

**Two features, because they close two different cases and can be accepted apart.**

- **F1** makes the card's figures come from the same listing as the card's state. It closes the
  reported case, and a wider one: a container measured at 12% and then stopped keeps showing 12%
  today, for the same reason and for the same ten seconds.
- **F2** makes a sampling pass refuse the answer the daemon gives for a container that has stopped.
  It closes the case F1 cannot: a container stopped and started again quickly, which is `running`
  again while the cache holds the zero measured while it was stopped.

F1 alone leaves that last case open. F2 alone leaves the reported defect open in its wider form,
because a reading taken while the container was still running is a real measurement and F2 has no
reason to refuse it. F1 is the correction; F2 is what makes the written contract true.

**The scope is the server.** The card already draws the *no sample* state. What is wrong is the
data it is given.

## F1 — A container the listing does not call running is answered with no figures

| ID | Requirement |
| --- | --- |
| REQ-1 | The container listing carries the six usage figures (CPU, memory used, memory limit, host CPUs, network in, network out) only for a container that the same listing puts in the daemon's running set — `running`, `paused` or `restarting`. Every other container is answered with none of them. |
| REQ-2 | A stopped container's card reads `—`, carries the *no sample* wording and draws its track empty, from the first list read in which the container is no longer running. No card shows `EXITED` and a measured value at the same time. |
| REQ-3 | What a stopped container loses is any reading, not only a zero: a container measured at 12% and then stopped reads `—`, never 12%. |
| REQ-4 | A `paused` container keeps its figures and still reads `0.0%` with its capacity note. A `restarting` container keeps its figures too. |
| REQ-5 | Nothing else about the six figures changes: a running container reads what it reads today, a reading older than 30 seconds still reaches no card, and a container the sampler has never read is still answered with no figures. |
| REQ-6 | The correction is made on the server. Nothing under `client/src/` changes. |
| REQ-7 | This cycle changes nothing in `client/e2e/containers-card-geometry.spec.ts`. The baseline for "unchanged" is the file as commit `8457ef7` leaves it, which is on the branch already and belongs to another repair. No assertion of it is softened or removed, no wait or retry is added, and no budget is raised. Its test *a card with no sample is drawn unlike a measured one, and unlike a measured zero* passes on the corrected product. |

## F2 — A pass refuses the answer given for a container that is no longer running

| ID | Requirement |
| --- | --- |
| REQ-8 | A sampling pass stores no measurement for a container that stopped between the listing being read and its statistics call going out. The daemon answers such a call successfully with an empty frame; an empty frame is not a measurement. |
| REQ-9 | What marks an answer as no measurement is stated in one place: it reports no memory limit. A container that is running always reports the limit of its cgroup, so no real reading is refused. |
| REQ-10 | A container stopped and started again within one sampling interval reads `—` until a reading is actually taken. It never shows the zero produced while it was stopped. |
| REQ-11 | The pass is otherwise unchanged: the same 10-second cadence, the same rule that passes never overlap, the same dropping of containers that have left the running set, and no extra call to the daemon. |

## Values fixed here, and why

- **The running set is the daemon's own three states** (REQ-1), not `state === "running"`. It is the
  set the sampler already uses to decide whom to measure, and it is already named in the code beside
  the projection. Using any other set would make a paused container lose figures it legitimately has.
- **The mark of a non-measurement is the missing memory limit** (REQ-9). It was measured on the
  operator's daemon (Docker 29.7.2): a stopped container answers with `memory_stats: {}`, while a
  paused container in the same response reports 18830254080. The absent `system_cpu_usage` is a
  second mark of the same frame; one is enough and two would have to be kept in step.
