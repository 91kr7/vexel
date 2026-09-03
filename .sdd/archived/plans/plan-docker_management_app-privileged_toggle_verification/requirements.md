---
slug: docker_management_app-privileged_toggle_verification
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-privileged_toggle_verification.md
status: validated
---

# Requirements — The privileged path under standing verification, and the investigation on record

Evolution of the delivered product. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md); this is **bug-2** of
the human's `bugs.md`, the fifth of six items.

Requirements are observable, individually verifiable behaviours. Ids are local to this plan: `REQ-1`
below is *not* `plan-docker_management_app/REQ-1`. Requirements of other plans are always cited with
their path prefix.

Reference artifact: `bugs-screen/bug-2.png` — normative only as the depiction of the **symptom**
(a surface that is open, correctly positioned, and drawing nothing of its own, over an application
that is intact).

## What this plan is not

**No fix is planned, and that is the spec's central decision rather than an omission.** The reported
failure does not reproduce — seven attempts across two builds, both run arrangements, both entry
paths into the form, a complete privileged create, and a viewport matched to the screenshot. No
cause has been identified and no line of the product can be named as wrong. A change against an
unidentified cause is unverifiable by construction: nobody could tell a successful fix from a no-op,
because the failing state cannot be produced. **No requirement below asks for a behavioural change,
and REQ-14 forbids one.**

What is justified, and what these requirements are about, is two things: a **standing guarantee**
over a path that today carries exactly one assertion — at unit level, against a mocked client
(`client/test/unit/container-create-form.test.tsx:156`, which clicks *Run privileged* and asserts
the composed spec carries `privileged: true`) and nothing end to end at all; and the
**investigation preserved as evidence**, so the next reader of `bugs.md` does not start from zero
and exclude the same explanations again.

## The one thing that must not be got wrong

**The coverage is shaped around the symptom, not around the happy path.** A check that asserted only
"a privileged container was created" **would have passed during the very screenshot the human sent** —
the surface was present, the application behind it intact, and a container created behind an empty
surface would have satisfied it. That is REQ-1 and REQ-3, and they are the requirements this whole
item exists for. Presence of a surface is not evidence of its content.

## The two limits, stated here so they survive every later summary

**First, and the one that governs everything: the verification these requirements ask for runs in
one browser engine. It therefore cannot observe an engine-specific paint failure — the failure class
most consistent with the artifact — and therefore CANNOT CLEAR bug-2.** This is an accepted limit of
the deliverable, decided by the human and recorded by the spec, not a gap to be closed later in
passing. REQ-21 and REQ-22 exist to make that sentence survive into every artefact that points at
this work, because its predictable misuse is to be cited as having exonerated the privileged path.

**Second: the check creates the container and never starts it, so it does not exercise the form's
primary action.** The form offers `Cancel`, `Create only` and `Create and start`; the check uses
`Create only`. Neither thing the check exists to observe needs a running container — the form must
keep drawing its content after the toggle, and the daemon must hold the flag, which
`HostConfig.Privileged` reports on a container that has never started. Actually running a privileged
container hands the host's devices to a process on the operator's own machine in order to test a
checkbox in a form; that is disproportionate, and it is what the project's test rules exist to
refuse. **The started variant is refused outright and is not a compromise to be revisited.** The
resulting gap is stated rather than left unremarked: the `Create and start` action is not covered by
this work.

## F1 — The privileged path under standing verification, and the investigation on record

**Why one feature and not two.** The check and the record are two halves of one answer to one
report, and neither is shippable without the other: the record's load-bearing sentence (REQ-21) is a
statement *about* the check — what it does and does not guarantee — so it cannot be written before
the check exists, and the check without the record leaves the third investigation just as likely as
the second. They close together or the item is not done.

| ID | Requirement |
| --- | --- |
| REQ-1 | After the *privileged* toggle is operated in the container create form, the form is **still displayed and still drawing its own content**: its title, its fields, the toggle itself and its actions are present and carrying text. This is asserted as content, not as the existence of the surface — a form that is present and blank **fails**. This is the reported symptom stated as a checkable condition, and it is the assertion the existing coverage lacks entirely. |
| REQ-2 | After the toggle is operated, the toggle **reads as selected** in the interface — the state the operator chose is the state the interface shows. |
| REQ-3 | The check is demonstrably able to tell "present and drawn" from "present and blank": with the form's surface present and its own content removed, the check **fails**. A content assertion that cannot be shown to distinguish those two states does not satisfy REQ-1, and this demonstration is part of the standing check rather than a one-time observation made during implementation. |
| REQ-4 | The container that results is **privileged as the daemon holds it**, established by inspecting the created container through the daemon — not by inspecting the request the interface composed, which is what the existing unit-level assertion already covers and which would pass through a defect in everything downstream of it. |
| REQ-5 | The path is verified from **both ways into the form**: from the containers screen (the entry the human's report names) and from an image. A defect living in one entry mode and not the other is precisely the kind that survives a spot check. |
| REQ-6 | Any **uncaught application failure during the interaction** — an uncaught exception, or an error surfaced by the application to the browser console — makes the check fail. The investigation's most useful negative finding was obtained by a human watching a console; that observation becomes automatic, or the next occurrence is again adjudicated by whoever happened to be looking. |
| REQ-7 | The verification holds at a **narrow viewport**, comparable to the one the report was made at (the investigation used 813px wide), not only at a comfortable desktop width. The one thing the artifact fixes with reasonable confidence is that the window was narrow. |
| REQ-8 | The verification is **permanent and routine**: it is part of the project's standing automated suite, run by the project's normal commands with every change, and passes when its own file is run on its own. A procedure someone must remember to perform, or a one-off script, does not satisfy this. |
| REQ-9 | The verification **assumes nothing about the daemon's contents**: it asserts on the objects it created itself, never on totals, counts or a list being empty, and it passes unchanged on a daemon carrying the operator's own containers, images and volumes. |
| REQ-10 | The verification **removes everything it creates**, including whatever the daemon attaches on its own behalf, and does so whether it passed or failed. No privileged container, and no volume attached alongside one, is left standing on the operator's machine. |
| REQ-11 | Every object the verification creates carries the project's **ownership labels**, so a run killed halfway is still recoverable by the existing sweep, which never touches an object it cannot prove is the suite's. |
| REQ-12 | The verification **reaches no external image registry**: it draws only on the fixtures the project already prepares for itself, and adds no image heavier than the small ones the suite already uses. An unreachable registry produces a failure that says nothing about privileged mode — the exact class of noise this work exists to remove. |
| REQ-13 | The **privilege is never actually granted to a running process**: the privileged container is **created and never started**, from the smallest fixture image the suite has, and removed by the check that created it. A privileged container is a real grant of substantially the host's own authority on the operator's own machine; nothing this check observes requires one to run, so none does. The consequence is accepted and stated, not glossed: the form's `Create and start` action is outside this coverage. |
| REQ-14 | **No delivered behaviour changes.** No control, wording, layout or interaction of the container create flow — or of the surface it is drawn on, or of the UI library — is altered by this work. If the work produces a behavioural change, the premise has failed and it is re-examined rather than shipped. |
| REQ-15 | The **existing unit-level assertion is kept**, not replaced by the new coverage: what it establishes (the form's state maps the toggle to the field) remains established, and the new coverage is added beside it. |
| REQ-16 | The durable record of the investigation is **the analysis file itself** — `.sdd/analysis/docker_management_app-privileged_toggle_verification.md` — and **no second account of it exists anywhere in the repository**. A copy would have no owner, and the two would diverge the first time anyone learned something new, leaving the next investigator with two accounts of one investigation and no way to tell which is current. What this work adds is **reachability, not content**. |
| REQ-17 | The record carries the **baseline test together with its control**: that the failure does not reproduce on the pre-work commit `3725389`, alongside the measurement proving that build really was the pre-work code — no class at all on the dialog's grid item, and Create context measuring card 765 / content 480, bug-1 present and unfixed. Result and control are one finding; the result alone is an unfalsifiable claim the first sceptical reader will re-run the whole test to check. |
| REQ-18 | The record carries what was **measured from `bugs-screen/bug-2.png`**, including that the image is a **crop** — text cut mid-word at both edges — so the viewport width is not measurable from it, and including the earlier reading of the artifact that this corrects. |
| REQ-19 | The record distinguishes what the evidence **excludes** (a React render crash at the instant photographed; incidental repair of bug-2 by the four merged items) from what it **leaves standing** (an environment-, engine- or driver-specific paint failure, which every attempt shared one engine and one machine and so could not touch). |
| REQ-20 | Every claim in the record is **distinguishable as measured, inferred or assumed**. A confident summary that blurs them is worse than no record, because it transfers a weak conclusion to a reader who cannot see how weak it was. |
| REQ-21 | The record **states, in its own words and where a reader looking for the conclusion will find it, that the verification added here cannot clear bug-2**: it runs in one browser engine and cannot observe an engine-specific paint failure. Anyone citing this work as having exonerated the privileged path is citing it for something it was never able to do. |
| REQ-22 | **That same sentence is carried by every artefact this work writes** — the pointer under `.sdd/modules/` and the header of the new check — so a reader meets the limit wherever they arrive, and never meets the check without it. |
| REQ-23 | The **open thread is carried with the record** — the questions only the human can answer and what each answer would change — so that a late answer lands somewhere useful and reopens the investigation instead of arriving after the record has closed. |
| REQ-24 | The record states that **a reproduction belongs in a new fix analysis referencing it**, not in an edit of it: this investigation concluded, and a reproduction is a different finding rather than a revision of this one. |
| REQ-25 | The record is **reachable from the three places a later reader actually starts**, and from each of them by name: the **bug report** (`bugs.md`, under bug-2, as an appended annotation that is visibly an annotation — one line saying the item was investigated, was not reproduced, and where the record is, with **not one character of the human's own text altered, reflowed or reworded**, typos included, and nothing about hypotheses or conclusions, which is what the pointer leads to); the **module documentation** beside the container-create component's spec under `.sdd/modules/`, where someone about to touch that form looks; and the **check itself**, whose header names the record and states in one line why the check is shaped the way it is, so anyone simplifying it later meets the reason before they touch it. A record nobody arrives at does not stop the third investigation. |

**REQ-17 to REQ-21, REQ-23 and REQ-24 are confirmations, not writing tasks.** The analysis file
already carries every one of them, in its `Established findings`, `Assumptions`, `Risks`, `Scope`
and `Open thread — what would reopen this` sections; they are listed as requirements because
**reachability is worth nothing if what is reached is incomplete**, and because a later reader must
be able to see that the content was checked rather than assumed. They are verified by reading that
file. **If any of them turns out to be missing, that is reported at the acceptance gate — it is not
repaired by writing a second account**, which REQ-16 forbids, nor by editing the analysis, which is
not this plan's file to edit.
