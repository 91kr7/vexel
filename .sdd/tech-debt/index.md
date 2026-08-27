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
- **Fixing** → when a cycle resolves a debt, set `status: closed` in the entry, name the plan that
  closed it, and leave the entry in place. The register is a record; it is not pruned.
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
| container-listing-fetched-three-times | server | medium | The same container listing is fetched three times per round; 40 of 60 calls a minute are derivative | `entries/container-listing-fetched-three-times.md` |
| no-response-sequencing-guard | client | medium | No sequence number: an older response landing last overwrites a newer one | `entries/no-response-sequencing-guard.md` |
| contexts-list-spawns-subprocesses | server | low | Two processes every 15 s for an inventory that changes when the operator changes it | `entries/contexts-list-spawns-subprocesses.md` |
| object-type-invalidation-registry-unused | client | low | The by-object-type invalidation registry is exported and called from nowhere | `entries/object-type-invalidation-registry-unused.md` |

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
