---
batch: 4 · images-panel
feature: F4 — Images, keyed by their lowest tag, with the dangling ones grouped last
closed_req: REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22
depends: 1
---

# Batch 4 — Images, keyed by their lowest tag

The one list with no single name to sort by: an image may carry several tags, or none. Its key is
therefore **derived**, and deriving it wrongly reproduces the reported bug one level down.

Requirements are in `../requirements.md` and are cited here by id only.

## The three ways this one goes wrong

**Keying on the daemon's first tag.** `ImageSummary.tags` comes from the daemon's `RepoTags`, whose
order is no more guaranteed than the image list's own. Key on its first element and the image's key
varies between reads — the same defect, one level down, and invisible until a multi-tag image
appears. The key is the **lowest** tag under batch 1's rule, repository compared first and then tag
(REQ-17, REQ-18). Order the row's own tag list first, then take its head: that is also what REQ-19
asks the row to display.

**Losing the repository of a digest-only image.** `ImageSummary.digest` has **already dropped its
`repo@` prefix** (it emits `algorithm:first-12-hex`), so a pulled-by-digest image cannot be placed
from the emitted field. The repository is present in the daemon's `RepoDigests`, which this service
already reads. Read it from there for the sort key; **do not add a field to the response** — what a
row contains is not changed by this fix (REQ-20).

**Sorting `<none>` as text.** It begins with a punctuation character, so a genuinely dangling image
sorts to the very *top* — a block of indistinguishable rows in the single best position of the panel,
placed there by accident rather than by anyone. Dangling images group **after every named image**,
newest first, id last (REQ-21).

**What identity this list has**: `ImageSummary` carries `{ id, shortId, tags, digest?, platforms,
sizeBytes, createdAt }` — the `id` is the identity and `createdAt` is available. The id tiebreak is
not decoration here: image timestamps are second-granular, two images built in one second is an
ordinary occurrence, and the daemon's own tooling records that exact case as unstable.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `server/src/images/images-service.ts` | In `listImages`, order each row's own `tags` under batch 1's rule, repository first then tag (REQ-19). Then order the list: a **named** image sorts by its lowest tag, or — when it has no tag but carries a digest reference — by the repository of that reference, read from the daemon's `RepoDigests` and not from the emitted `digest` field (REQ-20); a **dangling** image (no tag, no digest reference) joins the unnamed group after every named one, newest first by `createdAt`, with `id` as the final comparison (REQ-21). Use batch 1's named-first / unnamed-group-last helper. The response shape does not change, `<none>` still renders as it does today, and which images are listed is untouched. | REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22 | — |
| INT-2 | modify | `server/test/unit/images-service.test.ts` | Add, from stubbed payloads deliberately out of order: a multi-tag image whose `RepoTags` are supplied **in both possible orders** and whose sort key and rendered tag list come out the same both times (REQ-18, REQ-19); `nginx:1.25` before `nginx:latest` and all tags of one repository together (REQ-17); a digest-only image sorting among the named ones under its repository, with the emitted `digest` field unchanged (REQ-20); dangling images after every named one, newest first, and **two dangling images sharing one `createdAt` ordered identically whichever way round they are supplied** (REQ-21); and the whole payload supplied both ways round producing one result (REQ-22). Correct — never loosen — any existing assertion that only passed because the stubbed list came back in the order it was written in. | REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22 | INT-1 |

## Done when

- The images panel groups each repository together, lists a multi-tag row's tags lowest-first, and
  holds the `<none>` rows in a block at the bottom, newest first.
- `npm run test:typecheck -w server` passes and `images-service.test.ts` passes, run narrowed: from
  `server/`, `node --experimental-test-module-mocks --import tsx --test-reporter=dot --test test/unit/images-service.test.ts`.
- Batch-scoped runs only. The full unit suite and the e2e suite are not this batch's business.
