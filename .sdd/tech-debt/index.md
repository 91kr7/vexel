# Technical debt — register

Known debts on file, one entry per row. This index locates them; the entries carry the evidence and
the reasoning. A debt is recorded here when it is **understood and measured but not being fixed in
the current cycle** — so that it is neither lost nor silently carried into a plan that did not ask
for it.

An entry is not a work order. Nothing here is scheduled until a cycle picks it up, and picking it up
means writing the analysis and the plan for it in the normal way — see
[[an-opinion-asked-for-is-not-a-work-order]] in the knowledge base.

## How to use it

- **Adding** → one file under `entries/`, frontmatter as below, plus a row in this table.
- **Fixing** → when a cycle resolves a debt, **remove the entry and its row**. The register holds
  what is still open, so that its length is the size of the problem and not of the history. What
  closed it is recorded where the work was done: the plan's requirements and batch, and the commit
  that carried them. Human's decision of 2026-08-29.
- **Frontmatter** → `id`, `area` (client | server | both), `severity` (high | medium | low),
  `cost` (at-rest | under-load | remote-only | correctness | architecture | dead-code), `date`,
  `source`, `status` (open | closed).

## Register

| Debt | Area | Sev | What | File |
|------|------|-----|------|------|
| no-server-side-sampling-or-dedup | server | high | No list route samples, caches or merges: N clients cost N times | `entries/no-server-side-sampling-or-dedup.md` |
| volumes-list-polls-system-df | server | high | The volumes list pulls Docker's heaviest endpoint every 3 s, against a decision already taken elsewhere | `entries/volumes-list-polls-system-df.md` |
| images-list-inspects-every-image | server | high | The images list costs `1 + one inspect per image`, every 3 s, for an immutable value | `entries/images-list-inspects-every-image.md` |
| compose-list-spawns-subprocesses | server | high | The Compose list spawns `compose ls` every 3 s, plus one `compose ps` per project | `entries/compose-list-spawns-subprocesses.md` |
| polled-hooks-do-not-coalesce-events | client | high | The twelve polled views re-read once per event; the grouping exists only in the two that poll least | `entries/polled-hooks-do-not-coalesce-events.md` |
| detail-views-reread-on-unrelated-events | both | high | Detail views re-read on events about other objects; a volume detail pulls `/system/df` per container event | `entries/detail-views-reread-on-unrelated-events.md` |
| new-socket-per-engine-call | server | high | A fresh socket per Engine call: negligible locally, an `ssh` process per request on a remote context | `entries/new-socket-per-engine-call.md` |
| cli-version-detection-uncached | server | medium | Three programs launched every 5 s to read versions that cannot change while the app runs | `entries/cli-version-detection-uncached.md` |
| no-response-sequencing-guard | client | medium | No sequence number: an older response landing last overwrites a newer one | `entries/no-response-sequencing-guard.md` |
| contexts-list-spawns-subprocesses | server | low | Two processes every 15 s for an inventory that changes when the operator changes it | `entries/contexts-list-spawns-subprocesses.md` |
| object-type-invalidation-registry-unused | client | low | The by-object-type invalidation registry is exported and called from nowhere | `entries/object-type-invalidation-registry-unused.md` |
| stale-thirteen-screen-count-in-checks | client | low | Thirteen checks still say "thirteen screens", two of them in failure messages, on a rail that has twelve | `entries/stale-thirteen-screen-count-in-checks.md` |
| change-coverage-millisecond-window | server | low | A read starting in the same millisecond as a change counts as covering it, on REQ-13's path | `entries/change-coverage-millisecond-window.md` |
| layer-explorer-cancel-races-the-analysis | client | low | A check presses Cancel on an analysis that has already finished, and passes on speed rather than on contract | `entries/layer-explorer-cancel-races-the-analysis.md` |
| open-app-retries-for-a-whole-test-budget | client | medium | `openApp` retries for 30 s, the whole default budget of the 562 tests that call it, so its own failure message can never be printed | `entries/open-app-retries-for-a-whole-test-budget.md` |
| builder-writes-mark-one-inventory-of-the-two-they-change | server | medium | Removing a builder, and pruning the cache, each mark one of the two inventories they change, so a screen reports figures the operator's own action has invalidated | `entries/builder-writes-mark-one-inventory-of-the-two-they-change.md` |

## Provenance of the rows added after that study

The rows dated 2026-08-28 and later do not come from it: each names in its own `source` the run,
batch or conversation that found it, and some are defects in checks rather than in the product. The
count no longer matches a position in the table, entries having been removed as cycles closed them.

## Provenance of this first batch

All twelve come from one study of the refresh and polling machinery,
`.sdd/analysis/studies/refresh-and-polling.html`, read against the code on 27 August 2026 at `main`
/ `57cc50c`. Intervals and constants were read at the source; timings were measured on the
development machine, three runs per command, median, on a daemon holding 3 images and no Compose
project. The event burst was measured on the real lifecycle of a probe container, removed with
`rm -fv` afterwards. Hourly counts are arithmetic over the intervals, not observed traffic.

Two things were deliberately left out. **Swarm** — its removal is already planned
(`plan-docker_management_app-swarm_removal`), so its polling is moot. **The detail views' pull
model** — the human's decision is that detail reads stay client-pulled with no server-side cache,
and `detail-views-reread-on-unrelated-events` does not contest it: it concerns which events justify
a re-read, not who does the asking.
