---
id: development-goes-through-sdd-dev
kind: guideline
scope: any
date: 2026-08-27
source: chat, during the port-mappings correction on the container detail Config tab
---

# Development goes through `/sdd-dev`, not through a subagent called by hand

**Rule** → Implement through the `sdd-dev` command. Do not call `sdd-developer` or `sdd-tester`
directly as subagents, and do not carry a change to the code outside the workflow.

**Why** → "per cortesia attieniti al workflow sdd quindi queste cose devono essere documentate!
utilizza sdd-dev per lo sviluppo". The command is what keeps the artifacts and the code in step —
specs, indexes and the batch record are part of the step, not a tidy-up afterwards. Hand-dispatching
the subagents skips the part of the workflow that writes things down.

**How to apply** → any phase: the orchestrator prepares the contract — requirements and the batch's
interventions — and then invokes `sdd-dev` on that batch. Corrections found mid-run become new
interventions in the same batch and go through the command again; they are not applied out of band.
See [[every-change-updates-spec-requirements-plan]] and
[[visual-output-is-validated-before-tests]].
