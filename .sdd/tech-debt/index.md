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
| cli-version-detection-uncached | server | low | Three programs launched to read versions that cannot change while the app runs; since the refresh cache, every 30 s rather than every 5 s | `entries/cli-version-detection-uncached.md` |
| no-response-sequencing-guard | client | medium | No sequence number: an older response landing last overwrites a newer one; no listing is exposed to it any more, only the views that read on demand or on a clock of their own | `entries/no-response-sequencing-guard.md` |
| stale-thirteen-screen-count-in-checks | client | low | Thirteen checks still say "thirteen screens", two of them in failure messages, on a rail that has twelve | `entries/stale-thirteen-screen-count-in-checks.md` |
| change-coverage-millisecond-window | server | low | A read starting in the same millisecond as a change counts as covering it, on REQ-13's path | `entries/change-coverage-millisecond-window.md` |
| open-app-retries-for-a-whole-test-budget | client | medium | `openApp` retries for 30 s, the whole default budget of the 562 tests that call it, so its own failure message can never be printed | `entries/open-app-retries-for-a-whole-test-budget.md` |
| builder-writes-mark-one-inventory-of-the-two-they-change | server | medium | Removing a builder, and pruning the cache, each mark one of the two inventories they change, so a screen reports figures the operator's own action has invalidated | `entries/builder-writes-mark-one-inventory-of-the-two-they-change.md` |
| stats-gate-waits-no-longer-scale-with-the-sampling-interval | client | medium | A budget said to sit below one sampling interval sits above four on the suite's clock, so the check passes without proving promptness | `entries/stats-gate-waits-no-longer-scale-with-the-sampling-interval.md` |

## Provenance of the rows added after that study

The rows dated 2026-08-28 and later do not come from it: each names in its own `source` the run,
batch or conversation that found it, and some are defects in checks rather than in the product. The
count no longer matches a position in the table, entries having been removed as cycles closed them.

## Provenance of this first batch

They come from one study of the refresh and polling machinery,
`.sdd/analysis/studies/refresh-and-polling.html`, read against the code on 27 August 2026 at `main`
/ `57cc50c`. Intervals and constants were read at the source; timings were measured on the
development machine, three runs per command, median, on a daemon holding 3 images and no Compose
project. The event burst was measured on the real lifecycle of a probe container, removed with
`rm -fv` afterwards. Hourly counts are arithmetic over the intervals, not observed traffic.

**Most of that study is closed.** The refresh cache (`plan-docker_management_app-refresh_cache`)
holds a value per kind at a period of its own, so the client's poll no longer sets the rate at
which the daemon is questioned and N windows no longer cost N times. Five of its rows went with
it, and a sixth with the same plan's read-once memo, which is a different batch and a different
mechanism. A seventh went with the live channel, which left the polled views with no poll to
group events into. Two more went once no client hook re-read on a daemon event at all: the
by-object-type invalidation registry, exported and called from nowhere, and the detail views
re-reading on events about other objects. Both were closed by
`plan-docker_management_app-refresh_cache-client_event_refresh_removal` and removed here, in the
last batch of `…-multiplexed_sse`, the register describing the application as it stands rather
than how it got here. One survivor, `no-response-sequencing-guard`, says at its own declaration
what each of those reduced. The figures in the entries that remain were measured before all of
it, and each says so.

Two things were deliberately left out. **Swarm** — its removal is already planned
(`plan-docker_management_app-swarm_removal`), so its polling is moot. **The detail views' pull
model** — the human's decision is that detail reads stay client-pulled with no server-side cache,
and nothing in this register contests it. The clock those views read on is that decision, not
debt: `…-multiplexed_sse/REQ-28` keeps it, and it reads one object rather than a value the server
holds.
