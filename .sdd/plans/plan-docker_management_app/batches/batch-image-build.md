---
batch: 11 · image-build
feature: F12 — Image build from Dockerfile
closed_req: [REQ-44, REQ-45, REQ-46, REQ-116]
depends: [3, 9]
---

# Batch 11 — Image build from a Dockerfile

First feature taking an operator-typed host path, so REQ-116 (path validation, mechanism built in
batch 3) closes here.

Visual reference: "Build from Dockerfile…" in `.sdd/analysis/ui-mock/lmages-layers.png`; the build
configuration rows in `.sdd/analysis/ui-mock/build-and-cache.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Build-output primitives: step list with per-step state (cached / executed / failed) and duration, wired to the log surface for the raw output, plus a cancel affordance on a running operation. | REQ-45, REQ-46 | — |
| INT-2 | create | server, build area | Build execution against the active context (Engine API build endpoint, BuildKit-aware, CLI fallback where the API does not cover an option) with build args, target stage, platform(s), tags, labels and cache options (cache-from, cache-to, no-cache); output streamed as structured steps plus raw text; cancellation propagated to the builder. | REQ-44, REQ-45, REQ-46 | — |
| INT-3 | modify | server, host-filesystem area (created by `batch-local-persistence`) | Apply the path-validation service to the build context directory and the Dockerfile path: existence, kind, readability, no traversal outside the allowed root, refusal reason returned before anything is executed. | REQ-116 | — |
| INT-4 | create | client, data-access layer | Build mutation with its output stream, cancellation, and refresh of the image list with the produced reference on success; path validation performed before the build starts. | REQ-44, REQ-45, REQ-46, REQ-116 | INT-2, INT-3 |
| INT-5 | create | client, images feature area | Build form and build-run view: context and Dockerfile path inputs with their refusal messages, build args, target, platforms, tags, labels, cache options; live step-by-step output with cached/executed marks, warnings and errors; cancel; resulting image reference reported. | REQ-44, REQ-45, REQ-46, REQ-116 | INT-1, INT-4 |
| INT-6 | modify | client, images feature area (created by `batch-images-core`) | Wire the "Build from Dockerfile…" toolbar action to the build form and show the produced image in the list. | REQ-44 | INT-5 |
