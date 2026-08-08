---
module: image-analysis
component: FilesystemContentService
type: backend service
---

# FilesystemContentService

**Purpose** → a file's preview content from an already-extracted filesystem: text or hex, chosen
automatically from the content and overridable, with an oversized file truncated instead of fully
read (REQ-59).

## Contract

- `readFilesystemEntryContent(imageId, path, requestedMode?): Promise<{ result } | { refusal:
  string } | undefined>`
  - `requestedMode?: 'text' | 'hex'` — overrides auto-detection when given.
  - `undefined` when the image has no cached extraction yet.
  - `{ refusal }` when `path` names a directory, a symlink (neither has content of its own), or an
    entry that cannot be located in the cached archive (e.g. the archive is no longer cached — the
    caller is asked to re-extract).
  - `FilesystemContentResult`: `{ path, mode, autoMode, content, totalSizeBytes, truncated }` —
    `autoMode` is what auto-detection would have picked, shown by the caller when it differs from
    `mode` (an operator override); `content` is either the decoded text or a preformatted hex dump,
    depending on `mode`.

## Rules and invariants

- At most `MAX_PREVIEW_BYTES` (256 KB) is ever read from the archive for one preview; `truncated` is
  `true` whenever the entry is larger than that (REQ-59).
- Detection reads a bounded sample and classifies as binary (hex) on any NUL byte, or when more than
  30% of the sample is not a printable/common-whitespace byte; text otherwise.
- Bytes are read at a known offset within the cached archive file — never by joining the entry's own
  name onto a real filesystem path — so this service never depends on containment to stay safe
  (REQ-62); the index it reads from is itself built only from already-contained paths.
- The hex dump is 16 bytes per row: an 8-digit hex offset, the row's hex bytes, and their
  printable-ASCII rendering (`xxd`-style).

## Dependencies

- image-analysis: FilesystemExtractionService (`getExtractedFilesystem`, `getExtractedArchivePath`,
  `normalizePath`), the archive index builder (internal, shared with FilesystemExportService), the
  tar reader (internal, `readTarEntryPrefix`)

## Requirements served

- plan-docker_management_app/REQ-59
- plan-docker_management_app/REQ-62
