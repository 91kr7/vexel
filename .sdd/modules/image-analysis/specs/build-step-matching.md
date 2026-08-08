---
module: image-analysis
component: BuildStepMatching
type: backend utility
---

# BuildStepMatching

**Purpose** → reduces the two different spellings of the same build step — the one an image's
history records and the one a buildx build-cache record carries — to one comparable key, so the two
sides of the traceability can be matched by equality (REQ-68, REQ-69). Pure: no daemon, no state.

## Contract

- `buildStepKeyFromHistory(createdBy?): string | undefined`
  - strips the trailing `# buildkit` marker, then the leading `RUN ` verb, then collapses runs of
    whitespace to one space.
  - `undefined` for: no argument, a blank command, or a metadata-only `#(nop)` step.
  - e.g. `RUN /bin/sh -c mkdir /a # buildkit` → `/bin/sh -c mkdir /a`;
    `COPY x /y # buildkit` → `COPY x /y`.
- `buildStepKeyFromCacheDescription(description?): string | undefined`
  - strips a leading bracketed step marker (`[3/3] `, `[stage-1 1/1] `), then the executed-step
    prefix (`mount <path> from exec `), then collapses runs of whitespace to one space.
  - `undefined` for: no argument, or a description that is blank once stripped.
  - e.g. `mount / from exec /bin/sh -c mkdir /a` → `/bin/sh -c mkdir /a`;
    `[3/3] COPY x /y` → `COPY x /y`.

## Rules and invariants

- The two functions produce the same key for the same step: that equality is the whole contract.
- A description that names no build step at all (`local source for context`, `pulled from …`) is not
  rejected here — it simply yields a key that no history entry can equal; naming it as a non-layer
  record is the caller's job.

## Requirements served

- plan-docker_management_app/REQ-68
- plan-docker_management_app/REQ-69
