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

## Dependencies

- compose: Compose client

## Requirements served

- plan-docker_management_app/REQ-77
- plan-docker_management_app/REQ-116
