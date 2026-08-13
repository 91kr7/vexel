---
module: images
component: useImageFilesystemKeptResult
type: frontend hook
---

# useImageFilesystemKeptResult

**Purpose** → answers, for one image, whether an extraction result is still kept for its content and
what that result contains — the free read the filesystem browser's two shapes are decided by, before
any surface is raised.

## Contract

- `useImageFilesystemKeptResult(imageId: string | undefined): { summary, answered, loading, discard }`
  - `summary: FilesystemExtractionResult | undefined` — the kept result's own figures (entry count,
    refused count, `fromCache` true by construction); `undefined` when nothing is kept, when the
    answer is not in yet, or once `discard` has been called.
  - `answered: boolean` — true once the read has come back, whichever way it came back. `answered &&
    summary === undefined` is the "nothing kept" answer, and is what tells the caller to raise the
    cost warning; a failed read answers the same way, so the flow degrades to the cost warning
    rather than to a dead end.
  - `loading: boolean` — the read is in flight, so the surface can show an actionless indication and
    ask the operator for nothing.
  - `discard()` — reports that the kept result is no longer usable: it was answered as kept but
    turned out unreadable on the follow-up read, or the caller has just started an extraction that
    supersedes it. `summary` becomes `undefined` while `answered` stays true.
  - Passing `undefined` reads nothing at all.
- A change of `imageId` re-reads, discarding the previous image's answer.

## Rules and invariants

- The read creates nothing, starts no extraction and touches the daemon not at all: it is a cache
  lookup on the server's side, and an absent result is a normal answer rather than a failure.
- The answer is keyed by the image's own id (its content digest), so a rebuilt image carrying a
  familiar tag answers "nothing kept".
- A superseded read never overwrites a fresher one: the answer of an image that is no longer the
  hook's own is dropped.

## Dependencies

- Image filesystem client (`fetchKeptImageFilesystem`)

## Requirements served

- plan-docker_management_app-filesystem_browse_direct/REQ-4
- plan-docker_management_app-filesystem_browse_direct/REQ-6
- plan-docker_management_app-filesystem_browse_direct/REQ-14
- plan-docker_management_app-filesystem_browse_direct/REQ-16
