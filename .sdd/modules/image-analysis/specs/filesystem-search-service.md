---
module: image-analysis
component: FilesystemSearchService
type: backend service
---

# FilesystemSearchService

**Purpose** → name/path fragment search across an already-extracted filesystem, e.g. to locate
binaries, shared libraries or CA-certificate bundles (REQ-60).

## Contract

- `searchFilesystemEntries(imageId, query): Promise<FilesystemSearchResult | undefined>` —
  `undefined` when the image has no cached extraction yet.
  - `FilesystemSearchResult`: `{ query, matches, totalMatches, truncated }`.
  - `FilesystemSearchMatch`: `{ path, name, kind, parentPath }` — `parentPath` is the match's
    position in the tree, for the caller to reveal it.
  - A case-insensitive substring match of `query` against each entry's full path; an empty or
    whitespace-only `query` matches nothing.
  - `matches` is capped at `MAX_SEARCH_RESULTS` (200); `totalMatches` is the true match count and
    `truncated` is `true` when it exceeds the cap (REQ-60).

## Dependencies

- image-analysis: FilesystemExtractionService (`getExtractedFilesystem`, `parentOf`)

## Requirements served

- plan-docker_management_app/REQ-60
