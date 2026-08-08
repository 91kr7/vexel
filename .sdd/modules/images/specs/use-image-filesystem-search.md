---
module: images
component: useImageFilesystemSearch
type: frontend hook
---

# useImageFilesystemSearch

**Purpose** → drives the filesystem browser's tree search: debounces typing, cancels a
still-in-flight search as soon as a fresher one is requested, and cycles through the bounded match
list (REQ-60).

## Contract

- `useImageFilesystemSearch(imageId): { query, setQuery, matches, totalMatches, truncated,
  activeMatchIndex, next, previous }`
  - `setQuery(value)` — debounced (200ms) before it drives a search; each new search aborts the
    previous one still in flight.
  - `matches`, `totalMatches`, `truncated` — mirror `FilesystemSearchResult`; `matches` is cleared
    (with `activeMatchIndex` reset to `0`) whenever `query` is empty or `imageId` is `undefined`.
  - `next()`, `previous()` — cycle `activeMatchIndex` through `matches` (wrapping); no-op while
    `matches` is empty.

## Rules and invariants

- An aborted (superseded) search's rejection is silently discarded: it can never overwrite a fresher
  result.

## Dependencies

- Image filesystem client (`searchImageFilesystem`)

## Requirements served

- plan-docker_management_app/REQ-60
