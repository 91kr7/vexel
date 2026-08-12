---
batch: 6 · order-reaches-the-screen
feature: F6 — The order survives to the screen
closed_req: REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34
depends: 2, 3, 4
---

# Batch 6 — The order survives to the screen

The order is decided in the list services so that every consumer inherits it. This batch is the other
half of that decision, because **an order established at one layer can be silently undone at the
other**: one panel builds its rows through a path that does not preserve the received sequence, and
that panel alone keeps the bug while the API is provably correct. That is the second most likely
failure of this whole item.

Requirements are in `../requirements.md` and are cited here by id only.

## What is already established, and what that means for this batch

**The client re-orders nothing today.** There is no `.sort(` and no `.reverse(` in the client's
containers, images, volumes-networks, contexts or builders code, and the shared `DataTable` has no
ordering of its own. So this batch is expected to **add no client code at all**: it adds the standing
evidence that this stays true. If a panel is nevertheless found to undo the received order, that
discovery is exactly what the batch exists for — fix it there, under the UI-library rules in
`CLAUDE.md`, and say so at acceptance.

**The Dashboard is not one of the six and is deliberately excluded.** Its container activity list
does sort client-side (`client/src/dashboard/DashboardScreen.tsx:101`), grouping by container state
before comparing names, and that grouping is the point of an activity panel. **Do not "fix" it**
(REQ-42, batch 7).

## The test rules that bite hardest here

This is the only batch that touches the operator's daemon, and `CLAUDE.md` governs it:

- **Assert only on the relative order of the fixtures this spec created** — "mine appear in this
  order relative to each other". Never a position, a count, a total, or a list being empty: the
  operator's own containers, images, volumes and networks are interleaved with the fixtures, are
  ordered like any other row, and are untouchable (REQ-32).
- **Remove everything created, whatever the outcome**, in a `finally`. Containers with
  `docker rm -fv`, never `docker rm -f`. Every fixture carries the ownership labels, built images
  included, so a run killed halfway is still recoverable by `npm run test:sweep -w server` (REQ-33).
- **Reach no external registry**: draw only on the fixtures the project already prepares
  (`server/test/support/base-images.ts`), and add no image heavier than the small ones already used.
- **Activate nothing.** Contexts and builders are created and removed but never made active:
  switching either changes the daemon the whole run talks to, which is why the suite keeps those in
  `client/e2e/exclusive/`. This spec is not exclusive and must not need to be.
- Import `test` from `client/e2e/support/test.ts`, not from `@playwright/test`.

## The fixture scheme, which is load-bearing

Four fixtures per panel, named `…-2`, `…-10`, `…-A`, `…-a`. One set proves three things at once:

- `-2` before `-10` → digit runs read as numbers (REQ-3, and its absence is the most visible failure)
- `-A` and `-a` adjacent, not in separate alphabets → case-insensitive (REQ-2)
- `-A` before `-a`, identically on every read → **the tiebreak exists** (REQ-5)

All four names are legal for a container, a volume, a network, a context and a builder. Images are
the exception: four **distinct image ids** are needed, since tags of one image are one row — build
them the way the suite already builds its single-layer fixture, owned and labelled, and never by
tagging an image the operator owns (that would move their row and leave a trace if a run is killed).
If four proves expensive there, fewer are acceptable **provided all three properties above are still
proved**.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, e2e test tree (a spec of its own, not `client/e2e/exclusive/`) | One spec walking **all six panels** — containers, images, volumes, networks, contexts, builders. Per panel: create the fixture set, open the panel, assert **the relative order of its own fixtures** (REQ-31, REQ-32); re-read the list (a refresh, or a daemon event the spec itself causes) and assert the sequence is **identical** — the same rows in the same relative order, not merely present. Then, on at least two panels including Containers, type into the panel's filter and assert the survivors **keep their relative order** (REQ-29). Then, on Containers, select a row to open its detail panel, cause a re-read, and assert the detail panel is still on **the same object** and the row has not moved (REQ-30). A header states in one line why the assertions are relative rather than absolute, so nobody later "strengthens" them into assertions about the whole list. Everything created is removed in a `finally`, labelled, with `docker rm -fv` (REQ-33). | REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33 | — |
| INT-2 | modify | `client/src/` — expected to be **no change at all** | The negative half, verified rather than assumed: confirm by `git diff` that no client file was needed; that no panel derives, stores or merges rows in a way that imposes an order; and that **no ordering control was added and none exists** — no clickable column sort, no stored ordering preference, no recency toggle, no grouping (REQ-34). If a panel *is* found undoing the order, fix it here under the UI-library rules and report it: that is the finding this batch exists to produce. | REQ-28, REQ-34 | INT-1 |

## Done when

- The new spec passes **run on its own**: `npm run test:e2e -w client -- <that spec file>`.
- `npm run lint` and `npm run test:typecheck -w client` pass — the latter being the only pass that
  typechecks the e2e tree.
- After the run, `docker ps -a`, `docker volume ls`, `docker network ls`, `docker context ls` and
  `docker buildx ls` hold none of the spec's fixtures, and no image it built is left behind.
- Batch-scoped runs only. **The complete e2e suite is not this batch's business**: it runs once, at
  the very end, and it is the human's to run.
