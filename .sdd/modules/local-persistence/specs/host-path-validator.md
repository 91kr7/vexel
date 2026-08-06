---
module: local-persistence
component: HostPathValidator
type: backend service
---

# HostPathValidator

**Purpose** → the single entry point every server feature calls before using an operator-typed host
path (build context, Dockerfile, compose file, tarball source/target, export destination) (REQ-116).

## Contract

- `validateHostPath(request): HostPathValidationResult`
  - `request`: `{ path: string, kind?: 'file' | 'directory', root?: string }` — `root`, when given,
    is the directory the resolved path must stay within.
  - `HostPathValidationResult`: `{ valid: boolean, reason?: string, resolvedPath?: string, kind?:
    'file' | 'directory', readable?: boolean, writable?: boolean }`.
  - Refusal reasons (each returned as `reason`, `valid: false`), checked in this order:
    1. `path` is missing or not absolute.
    2. `path` contains a `..` traversal segment.
    3. `path` does not exist.
    4. `path` resolves (through symlinks) outside `root`, when `root` is given.
    5. `path` resolves to a kind other than the requested `kind`, when `kind` is given.
    6. the resolved path is not readable.
  - On success: `valid: true` with `resolvedPath` (symlinks resolved), `kind`, `readable: true` and
    `writable` reflecting the current process's access.

## Rules and invariants

- Kind and accessibility are always checked against the **resolved** path (after following
  symlinks), so a symlink cannot be used to point outside `root` undetected (REQ-116).
- Every refusal carries a `reason` stating why (REQ-116); no refusal is silent.

## Requirements served

- plan-docker_management_app/REQ-116
