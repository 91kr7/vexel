---
module: local-persistence
component: LocalStore
type: backend service
---

# LocalStore

**Purpose** → the single place that reads and writes the application's local, per-user data: a
JSON file per namespace inside a per-user application-data directory, created on first run.

## Contract

- `resolveDataDir(): string` — the application-data directory: `$VEXEL_DATA_DIR` when set
  (test/override hook), otherwise `~/.vexel`. Created (recursively) on module load if missing.
- `readNamespace<T>(namespace, fallback: T): T`
  - `namespace`: `'preferences' | 'console-history' | 'analysis-cache-index'`.
  - Returns the stored record's data when the namespace file exists and its schema version matches
    the current one; returns `fallback` when the file is missing, unreadable, corrupt, or written by
    an older/newer schema version.
- `writeNamespace<T>(namespace, data: T): Promise<void>`
  - Persists `data` wrapped with the current schema version.
  - Resolves once the write has landed on disk.
- `updateNamespace<T>(namespace, fallback: T, mutate: (current: T) => T): Promise<T>`
  - Reads the namespace, hands what it read to `mutate`, and persists what `mutate` returns — the
    three as one indivisible step. Resolves with the persisted value.
  - `mutate` sees the namespace as it is at that moment: no other update of the same namespace can
    read it again until this one has landed, so two concurrent updates can no longer each write over
    the other's change.
  - `mutate` is synchronous, and is called exactly once per call.
  - The write happens even when `mutate` returns the value unchanged; a `mutate` that throws leaves
    the file untouched and rejects, without blocking later updates.
- `cacheDir(): string` — the `analysis-cache` subdirectory of the data directory, created
  (recursively) if missing; used by `AnalysisCacheStore` to store artifact files.

## Rules and invariants

- Each namespace is a separate file (`<namespace>.json`) inside the data directory: one feature's
  write never touches another namespace's file.
- Writes and updates to the same namespace are serialized (queued): neither starts before the
  previous one to that namespace has settled, so concurrent callers cannot interleave and corrupt a
  file (REQ-113, REQ-114, REQ-115). A read-modify-write done through `updateNamespace` is covered by
  that guarantee as a whole — the read included — while one built by the caller out of
  `readNamespace` + `writeNamespace` is not: only the write half is serialized, and the change read
  before it can be lost.
- **Across processes** (two servers on one data directory), `updateNamespace` additionally holds an
  advisory lock, taken per namespace on the data directory itself, for the whole read-modify-write.
  What that does and does not guarantee:
  - guaranteed — two processes updating the same namespace at the same time each see the other's
    change; neither loses an entry.
  - not guaranteed — a `writeNamespace` (a whole-value overwrite) takes no lock and can still land
    over a concurrent update; a process killed while holding the lock keeps it until it is judged
    abandoned (a few seconds), after which the next caller breaks it; a data directory whose
    filesystem does not honour exclusive creation (a network share) leaves only the in-process
    guarantee. Contention that outlasts the wait, and a lock file that cannot be created at all,
    both degrade to the in-process guarantee rather than failing the caller's operation.
  - The lock is never held across an await, so a caller can never be blocked by another's I/O.
- A write lands on disk via a temp-file-then-rename sequence, so a process interrupted mid-write
  leaves the previous, still-valid file in place rather than a half-written one.
- Every stored record carries a schema version; a record from a mismatched version is treated as
  absent (the caller's `fallback` is returned) rather than causing a read failure.

## Requirements served

- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-114
- plan-docker_management_app/REQ-115
