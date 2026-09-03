---
module: compose
component: useComposeFile
type: frontend hook
---

# useComposeFile

**Purpose** → reads a project's compose file(s), tracks unsaved edits per path, saves one back to
disk, and validates on demand.

## Contract

- `useComposeFile(projectName): { files, loaded, error?, dirtyPaths, saving, validation?, validating, edit, save, validate }`
  - `files: { path, content }[]` — one entry per discovered file, `content` reflecting any unsaved
    edit for that path.
  - `edit(path, content)` — records an in-memory edit for `path`; does not write to disk.
  - `save(path): Promise<boolean>` — writes `path`'s current edited content back to disk; resolves
    `true` on success (clearing that path's dirty state) or `false` on refusal (`error` carries the
    reason).
  - `validate(): Promise<void>` — asks the server to validate the project's discovered file(s);
    result lands in `validation`.
  - `dirtyPaths: string[]` — paths with an edit not yet saved.
  - A change of `projectName` discards every unsaved edit and re-reads that project's files.
  - The files are also re-read on the reload signal — the header's manual refresh, and a connection
    that comes back — with the operator staying where they are
    (plan-docker_management_app-inline_error_panels/REQ-12).

## Rules and invariants

- **An unsaved edit is never overwritten, and never silently replaced.** A re-read replaces only the
  content read from disk; `files` keeps showing the operator's own buffer for every dirty path,
  `dirtyPaths` still names them and `save` still writes what they typed. Losing an edit to a
  reconnection is not an acceptable outcome, and neither is an overwrite the operator cannot see
  (REQ-77).
- A path with no unsaved edit does show the file as it now is on disk: that is what re-reading is
  for.
- The only thing that discards an edit is the operator's own step — saving it, or leaving the
  project (a change of `projectName`).

## Dependencies

- compose: Compose client
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-77
- plan-docker_management_app/REQ-116
- plan-docker_management_app-inline_error_panels/REQ-12
