---
module: local-persistence
component: LocalStore
type: backend service
---

# LocalStore

**Purpose** → the single place that reads and writes the application's local, per-user data: a
JSON file per namespace inside a per-user application-data directory, created on first run.

## Contract

- `resolveDataDir(): string` — the application-data directory: `$VESSEL_DATA_DIR` when set
  (test/override hook), otherwise `~/.vessel`. Created (recursively) on module load if missing.
- `readNamespace<T>(namespace, fallback: T): T`
  - `namespace`: `'preferences' | 'console-history' | 'analysis-cache-index'`.
  - Returns the stored record's data when the namespace file exists and its schema version matches
    the current one; returns `fallback` when the file is missing, unreadable, corrupt, or written by
    an older/newer schema version.
- `writeNamespace<T>(namespace, data: T): Promise<void>`
  - Persists `data` wrapped with the current schema version.
  - Resolves once the write has landed on disk.
- `cacheDir(): string` — the `analysis-cache` subdirectory of the data directory, created
  (recursively) if missing; used by `AnalysisCacheStore` to store artifact files.

## Rules and invariants

- Each namespace is a separate file (`<namespace>.json`) inside the data directory: one feature's
  write never touches another namespace's file.
- Writes to the same namespace are serialized (queued): a write never starts before the previous
  write to that namespace has settled, so concurrent callers cannot interleave and corrupt a file
  (REQ-113, REQ-114, REQ-115).
- A write lands on disk via a temp-file-then-rename sequence, so a process interrupted mid-write
  leaves the previous, still-valid file in place rather than a half-written one.
- Every stored record carries a schema version; a record from a mismatched version is treated as
  absent (the caller's `fallback` is returned) rather than causing a read failure.

## Requirements served

- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-114
- plan-docker_management_app/REQ-115
