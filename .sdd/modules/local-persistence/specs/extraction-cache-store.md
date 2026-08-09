---
module: local-persistence
component: AnalysisCacheStore
type: backend service
---

# AnalysisCacheStore

**Purpose** → keeps extraction/analysis artifacts on disk, addressed by the content digest of the
image they were computed from, so the same content is never recomputed (REQ-113).

## Contract

- `lookup(digest: string): AnalysisCacheEntry | undefined` — the cached entry for `digest`, or
  `undefined` on a cache miss (including when the index has an entry but its file is missing on
  disk).
- `insert(digest: string, sourcePath: string): Promise<AnalysisCacheEntry>` — copies the file at
  `sourcePath` into the cache under `digest` and records it in the index; returns the new entry.
- `invalidate(digest: string): Promise<void>` — removes the entry and its file for `digest`, if any;
  used when the content behind a previously-cached digest is known to have changed.
- `totalSizeBytes(): number` — sum of sizes across every indexed entry.
- `clear(): Promise<void>` — removes every entry and every artifact file.
- `reclaimOrphans(): void` — deletes every cache-directory file with no matching index entry (left
  behind by a run interrupted between writing the artifact and recording the index entry); called
  once at server startup.

## Rules and invariants

- A lookup for a digest never returns a stale artifact: insert always overwrites both the file and
  the index entry for that digest.
- An entry recorded by `insert` is found by a later `lookup`, whatever else was being inserted,
  invalidated or cleared at the same time: every change to the index (insert, invalidate, clear) is
  a single indivisible read-modify-write, so one caller's entry can never be written over by another
  caller that had already read the index. This holds for concurrent callers in the same process and
  for two processes sharing one data directory (the exact cross-process guarantee, and its limits,
  are `LocalStore`'s `updateNamespace`).
- `clear` empties the index before deleting the artifact files, so a run interrupted in between
  leaves orphaned files — reclaimed at the next startup — never index entries pointing at files that
  are gone.
- `totalSizeBytes()` only counts artifacts currently indexed; an orphaned file (not yet reclaimed)
  is not counted.

## Dependencies

- LocalStore (cacheDir, readNamespace/updateNamespace on the analysis-cache-index namespace)

## Requirements served

- plan-docker_management_app/REQ-113
