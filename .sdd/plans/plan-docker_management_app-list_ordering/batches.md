---
slug: docker_management_app-list_ordering
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-list_ordering.md
requirements: .sdd/plans/plan-docker_management_app-list_ordering/requirements.md
status: validated
---

# Batches — A defined, total, repeatable order for every list of named objects

Fix of a certified product. **Seven features, seven batches**, one of them declared enabling. Batch
numbers and `REQ-n`/`INT-n` ids are **local to this plan**: `REQ-1` here is not
`plan-docker_management_app/REQ-1`.

**The order is decided server-side in the list services** (batches 1–5, 7) and **verified through the
interface** (batch 6). No client code is changed by any batch: the client already presents the order
it receives, and batch 6 exists to prove that stays true rather than to make it true.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · ordering-rule | F1 — One ordering rule for the whole product (**enabling**) | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7 | — | certified | **Nothing in the product changes, and that is the check**: start the app, open any panel, and it looks exactly as it did — no service consumes the rule yet, and `git status` shows no file under `client/src/` touched. Then read the new ordering area: it knows nothing about Docker, takes a name and an identity, and its name comparison names an **explicit locale** rather than defaulting to the host's. Then run its unit file (the narrowed invocation below) and read it: it must contain a pair differing **only in case** (`Data`/`data`), a pair differing **only in leading zeros** (`app-1`/`app-01`), and for each pair the assertion that **the same two objects supplied in both input orders come out in the same order** — REQ-6. If that last assertion is absent the batch is not done, whatever else passes: an assertion that only checks the result is alphabetical passes on a partial order and is the failure mode this whole item is about. Finally the guard: temporarily add a bare `localeCompare` to any list service and watch the conformance check reject it. Checks: `npm run test:typecheck -w server`, the new unit file, the guard's own file. |
| 2 · four-named-panels | F2 — The four name-keyed panels: containers, networks, contexts, builders | REQ-8, REQ-9, REQ-10, REQ-11, REQ-12 | 1 | in progress | With the app running, open **Containers**, **Volumes & networks** (networks panel), **Contexts** and **Builders & cache** (builders panel): each is in name order, `app-2` sits before `app-10`, and `Redis` sits beside `redis-cache` rather than in a separate alphabet. Reload each panel several times: nothing moves. Check the two decisions that could have been got wrong by moving a row: the **active context** and the **active builder** are marked where they are, **not promoted to the top**. Then the tie evidence, per service: create two containers `zz-order-1` and `zz-order-01`, refresh twice, and see they hold the same relative order both times; remove them (`docker rm -fv`). Checks: `npm run test:typecheck -w server` and the four service unit files, run narrowed — each of which must carry a tie case supplied in both input orders. |
| 3 · volumes-panel | F3 — Volumes, with the anonymous ones grouped last | REQ-13, REQ-14, REQ-15, REQ-16 | 1 | in progress | Open **Volumes & networks**. Every named volume comes first, in name order; every 64-hex-character volume is **below all of them**, newest first. On a working machine this is the visible one — the hex names that used to interleave between `api-data` and `backup` are now a block at the bottom. Create `docker volume create Data` and `docker volume create data`, refresh twice: both appear, in the same relative order both times (`Data` first); `docker volume rm Data data`. Checks: `npm run test:typecheck -w server` and `volumes-service.test.ts` narrowed, carrying the named/anonymous split, the newest-first order inside the group, and a tie supplied in both input orders. |
| 4 · images-panel | F4 — Images, keyed by their lowest tag, with the dangling ones grouped last | REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22 | 1 | in progress | Open **Images & layers**. All tags of one repository sit together; `nginx:1.25` precedes `nginx:latest`; a row carrying several tags **lists its own tags lowest-first**; and the `<none>` rows are a block **at the bottom**, newest first — not, as sorting `<none>` as text would give, a block of indistinguishable rows at the very top. Then the one that is easy to fake: an image with **two tags** must sort under its **lowest** one, not under whichever the daemon happened to list first (`docker tag <img> zzz-order/a:1 && docker tag <img> aaa-order/a:1` → the row moves to `aaa-order`; untag both after). Checks: `npm run test:typecheck -w server` and `images-service.test.ts` narrowed, carrying: the lowest-tag key with the daemon's tag list supplied in both orders, the tag list inside a row, a digest-only image sorting under its repository, and two dangling images sharing one `createdAt` ordered identically both ways round. |
| 5 · one-rule-everywhere | F5 — The seven already-ordered lists on the same rule, and nothing else moved | REQ-23, REQ-24, REQ-25, REQ-26, REQ-27 | 1 | todo | The point of this batch is what **stays** put. Open **Swarm** (services, stacks, nodes, secrets/configs), **Plugins** (both panels) and **Registries**: each keeps the grouping it had — registries still list official entries first, swarm nodes still list managers before workers, a stack's services are still nested under their stack — and only the name comparison has changed, so digit-suffixed names now read `-2` before `-10`. Then confirm nothing that means something was alphabetised: an image's **layer stack and history** are still newest-layer-first, the **event feed**, **logs**, **console history** and **swarm task history** are still chronological, and the filesystem/diff trees are still path-ordered. Checks: `npm run test:typecheck -w server` and the seven services' unit files narrowed. Any assertion in them that only passed because a list arrived in the daemon's incidental order is **corrected, never loosened into accepting any order** — a check that accepts any order asserts nothing. |
| 6 · order-reaches-the-screen | F6 — The order survives to the screen | REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34 | 2, 3, 4 | todo | This is the batch that catches the second most likely failure of the item: the API provably correct and one panel undoing it. Read the new e2e spec: it walks **all six panels**, and for each it creates its own fixtures named `…-2`, `…-10`, `…-A`, `…-a` and asserts **only their relative order among themselves** — never a position, a count, a total or an emptiness, because the operator's own objects are interleaved with them. That one fixture set proves three things at once: `-2` before `-10` (numeric), `-A` and `-a` adjacent (case-insensitive), `-A` before `-a` (the tiebreak). It then re-reads each list and asserts the sequence is **identical**, types into the panel's filter and asserts the survivors keep their relative order, and opens a detail panel and asserts it stays on its own object across a re-read. Then confirm what it does **not** do: it never activates a context or a builder (that is the exclusive suite's territory), it reaches no external registry, and afterwards `docker ps -a`, `docker volume ls`, `docker network ls`, `docker context ls` and `docker buildx ls` hold none of its fixtures — whether it passed or failed. Checks: `npm run lint`, `npm run test:typecheck -w client`, and **that one spec file alone**. |
| 7 · lists-nobody-reported | F7 — The lists nobody reported | REQ-35, REQ-36, REQ-37, REQ-38, REQ-39, REQ-40, REQ-41, REQ-42, REQ-43 | 1 | todo | **The droppable one** — it is last, it depends only on batch 1, and nothing in batches 2–6 depends on it. Open **Compose**: projects in name order, and the services inside a project in name order. Open **Builders & cache**: the build-cache records are in a stable order (identifier ascending) and are **not** re-ranked by size or usage state — the panel looks the same, it just stops reshuffling. Open **Registries** and browse a registry that is **not** Docker Hub: its repositories are in name order; browse **Docker Hub** and search `nginx`: `nginx` is still the first result, because that ranking carries meaning and is deliberately untouched (REQ-40). Tags of any repository read `1.25`, `1.26`, `latest`. Then the guard rail: open the **Dashboard** and confirm its container activity list still groups by state first — it was found to impose that order deliberately and is left exactly as it is (REQ-42). Checks: `npm run test:typecheck -w server` and the three services' unit files narrowed, including the new one for compose discovery. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

**The narrowed unit invocation**, referred to above, is `npm run test:unit -w server` reduced to the
batch's own files — from `server/`:
`node --experimental-test-module-mocks --import tsx --test-reporter=dot --test test/unit/<file>.test.ts`.

**Test runs are batch-scoped, by the human's standing instruction.** The full unit suite
(`npm run test`) and the complete e2e suite are **not any batch's business**: they run once, at the
very end, after all seven batches are certified — and, bug-3 being the sixth and last item of
`bugs.md`, that final run is the human's, not this plan's.

## Assumptions and decisions

- **The comparison rule lives in a new shared server-side area of its own, not in `docker/`.** It is
  consumed by nine modules, so it cannot belong to any one of them; and `server/src/docker/` is the
  transport (engine client, CLI runner, endpoint, errors, types), which a comparator is not. It is
  one small component with a typed API that knows nothing about Docker: it is given a name and an
  identity and returns an order. The implementer names it and records it in `.sdd/modules/`.
- **The rule names an explicit locale; it never defaults to the host's.** This is the whole of REQ-4:
  bare `localeCompare` — what the seven already-ordered services use today — reads the host's
  collation settings, so the same objects order differently on two machines, and an assertion about
  order becomes a property of the machine that wrote it. A fixed locale with numeric collation and
  base sensitivity is the simplest expression of REQ-2 and REQ-3 together.
- **Diacritics compare equal, knowingly** (REQ-2). It comes with case-insensitivity at base
  sensitivity; it **groups** `café` beside `cafe` instead of scattering them, which is what someone
  scanning a list wants; and REQ-5's exact comparison still separates them deterministically. Decided
  at the requirements gate, recorded as a decision so that a later reader does not file it as a bug.
- **Nothing leans on the stability of the language's sort.** V8's sort is stable, so a name-only
  comparison *looks* deterministic in a unit test and then reshuffles in production, where the input
  order is the daemon's and varies. Leaning on it is the partial-order trap wearing a disguise:
  REQ-5's identity comparison makes stability irrelevant, and REQ-6 permutes the input precisely so
  that a stable sort cannot hide a missing tiebreak.
- **The seven already-ordered services adopt the rule; they are not left alone.** The alternative was
  weighed, and it loses on facts rather than on tidiness. Today those seven use bare `localeCompare`
  with **no tiebreaker**, so they carry both defects this fix exists to remove: their order is
  host-locale dependent (REQ-4), and it is partial — two swarm nodes whose hostnames differ only in
  case, two stacks `app-1` and `app-01`, shuffle exactly like the six reported panels. Adopting the
  rule is therefore a real gain, not uniformity for its own sake. The blast radius is bounded and
  cheap to verify: one comparison each, each service's grouping explicitly preserved (REQ-24), and
  **all seven have unit test files with stubbed payloads**, so the change is provable in seconds with
  no daemon. Leaving them alone would also falsify REQ-1 on the day it is written, and the next list
  service added would copy whichever of the two rules it found first.
- **Build-cache records get identifier ascending, and no ranking is invented** (REQ-37, REQ-38). A
  record has no name and no creation time in the shape the panel is built from — it is the one list
  in the plan with nothing to sort *by*. The spec's own fallback for that class is "identifier
  ascending, which is arbitrary but stable, and stable is the requirement". Ordering by size or by
  usage state would be a product decision about a panel nobody complained about; ordering by recency
  would need a field the service does not return. Both are evolutions, with their own reasoning.
  **This is the point in batch 7 most likely to be worth overriding**, and it is cheap to override.
- **The Dashboard's activity list was examined and found already deterministic** (REQ-42). It is the
  one place in the client that sorts, so it had to be looked at rather than assumed: it orders by
  container state, then by name, and Docker keeps container names unique on a daemon, so **no two
  rows can tie on that pair**. It is already a total order and cannot reshuffle between two reads —
  it does not have the reported defect. The residual is that its name comparison is host-locale
  dependent, which moves the order **between machines**, never between two reads on one machine: a
  real but different and much smaller thing than bug-3, and not what this fix is for. Deliberately
  untouched, and named in REQ-42 so it is not "fixed" while batch 6 is being implemented.
- **Docker Hub's repository search keeps its own order** (REQ-40). It is a relevance ranking for the
  term the operator typed, so it carries meaning: alphabetising it would stop `nginx` being the first
  result of a search for `nginx`. Every other registry's catalog has no ranking at all and is
  ordered. The resulting split is deliberate and is the same principle as REQ-26, not a second rule.
- **The image sort key reads the repository from the daemon payload the service already has; the
  response shape does not change** (REQ-20). `ImageSummary.digest` has already dropped its `repo@`
  prefix, so a digest-only image cannot be placed from the emitted field. Adding a field to carry it
  would change what a row contains, which this fix does not do.
- **`ContainersService` gets the unit test file it never had.** It is the only one of the six without
  one. The absence must not push the containers tie cases into a check where a tie cannot be
  constructed and the input order cannot be permuted — which is exactly how REQ-6 gets quietly
  dropped for one list out of six.
- **One new e2e spec rather than edits to six existing ones.** The six panels' ordering is one
  feature with one shape of assertion; spreading it across `containers.spec.ts`, `images.spec.ts`,
  `volumes.spec.ts`, `networks.spec.ts`, `contexts.spec.ts` and `builders.spec.ts` would repeat the
  fixture scheme six times, disturb six passing files, and leave no single place stating why the
  assertions are shaped the way they are. Same shape as the two sibling items, which each got a spec
  of their own.
- **The fixture naming scheme is load-bearing, not decorative**: `…-2`, `…-10`, `…-A`, `…-a` proves
  numeric ordering, case-insensitive grouping and the tiebreak with **four small fixtures per panel**
  and a single relative-order assertion. All four names are legal for a container, a volume, a
  network, a context and a builder.
- **Batch 6 activates nothing.** It creates and removes contexts and builders but never switches the
  active one: activating a context or a builder changes the daemon the whole run talks to, which is
  why the suite already keeps those in `exclusive/`.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/`; the canonical commands come from `.archi`.

## Departures from the spec

**One, and it must be carried back into the spec.**

**Three lists are ordered that the spec places out of scope.** The spec's *Out of scope* says "Lists
not among the thirteen named here"; compose projects and the services within them, build-cache
records, and the registry catalog's repositories and tags are not among the thirteen, and F7 orders
them anyway. **Departing from the spec, human decision, taken at the requirements gate**: the
request says "the order of the elements of **the panels** is not set", which is a statement about the
product rather than an enumeration of six services, and delivering determinism to the reported panels
while knowingly leaving three others shuffling is a partial answer to a request that was not partial
— the next thing that happens is bug-3 being filed again against the fix that was supposed to settle
it. The risk this adds is isolated rather than absorbed: F7 is **batch 7, last, depending only on
batch 1**, so it can be dropped whole without touching the six panels the human actually reported.

**And one factual correction the spec needs, which is not a departure in behaviour.** The spec's same
out-of-scope clause asserts that derived lists "inherit the order of the data they are built from".
**That is established false for the Dashboard's container activity list**
(`client/src/dashboard/DashboardScreen.tsx:101`), which re-sorts by container state before comparing
names. It is left exactly as it is (REQ-42) — the grouping is the point of an activity panel — but
the spec's sentence should not stand, because the next person to rely on it will assume a derived
list needs no thought.

## Coverage check

**Every REQ is served by at least one INT**, and every REQ closes inside exactly one batch. The
mapping below is the same list as the "REQ closed" column and as each batch file's frontmatter.

| REQ | Batch | Interventions serving it |
| --- | --- | --- |
| REQ-1 | 1 | INT-1, INT-3 |
| REQ-2 | 1 | INT-1, INT-2 |
| REQ-3 | 1 | INT-1, INT-2 |
| REQ-4 | 1 | INT-1, INT-2 |
| REQ-5 | 1 | INT-1, INT-2 |
| REQ-6 | 1 | INT-2 |
| REQ-7 | 1 | INT-1 |
| REQ-8 | 2 | INT-1, INT-5 |
| REQ-9 | 2 | INT-2, INT-6 |
| REQ-10 | 2 | INT-3, INT-6 |
| REQ-11 | 2 | INT-4, INT-6 |
| REQ-12 | 2 | INT-1, INT-2, INT-3, INT-4, INT-5, INT-6 |
| REQ-13 | 3 | INT-1, INT-2 |
| REQ-14 | 3 | INT-1, INT-2 |
| REQ-15 | 3 | INT-1, INT-2 |
| REQ-16 | 3 | INT-1, INT-2 |
| REQ-17 | 4 | INT-1, INT-2 |
| REQ-18 | 4 | INT-1, INT-2 |
| REQ-19 | 4 | INT-1, INT-2 |
| REQ-20 | 4 | INT-1, INT-2 |
| REQ-21 | 4 | INT-1, INT-2 |
| REQ-22 | 4 | INT-1, INT-2 |
| REQ-23 | 5 | INT-1, INT-2, INT-3, INT-4, INT-5, INT-6, INT-7, INT-8 |
| REQ-24 | 5 | INT-2, INT-3, INT-7, INT-8 |
| REQ-25 | 5 | INT-1, INT-2, INT-3, INT-4, INT-5, INT-6, INT-7, INT-8 |
| REQ-26 | 5 | INT-9 |
| REQ-27 | 5 | INT-8 (and, before it closes, batch 2 INT-6, batch 3 INT-2, batch 4 INT-2) |
| REQ-28 | 6 | INT-1, INT-2 |
| REQ-29 | 6 | INT-1 |
| REQ-30 | 6 | INT-1 |
| REQ-31 | 6 | INT-1 |
| REQ-32 | 6 | INT-1 |
| REQ-33 | 6 | INT-1 |
| REQ-34 | 6 | INT-2 |
| REQ-35 | 7 | INT-1, INT-4 |
| REQ-36 | 7 | INT-1, INT-4 |
| REQ-37 | 7 | INT-2, INT-5 |
| REQ-38 | 7 | INT-2, INT-5 |
| REQ-39 | 7 | INT-3, INT-5 |
| REQ-40 | 7 | INT-3, INT-5 |
| REQ-41 | 7 | INT-3, INT-5 |
| REQ-42 | 7 | INT-6 |
| REQ-43 | 7 | INT-1, INT-2, INT-3, INT-4, INT-5 |

**Two requirements are worked on in several batches and close in one**, declared here rather than
left to be inferred:

- **REQ-5 (no two distinct rows ever compare equal) closes in batch 1**, where the rule and its
  demonstration live. Every later batch *applies* it, and each application is carried by that list's
  own requirement (REQ-8 to REQ-11, REQ-13, REQ-14, REQ-21, REQ-35 to REQ-37, REQ-39, REQ-41), which
  names the identity that list actually has. This split is deliberate: the property is proved once,
  where it can be permuted and falsified, and each list then only has to say what its identity is.
- **REQ-27 (existing checks corrected, never loosened) closes in batch 5**, the last batch to touch
  a service the six panels depend on. Batches 2, 3 and 4 serve it for the checks they themselves
  break; batches 6 and 7 carry the same obligation locally. Closing it at 5 rather than at 7 is what
  lets batch 7 be dropped whole without leaving a requirement open.

**Every INT serves at least one REQ.** One enabling intervention is declared: **batch 1 INT-1**,
which delivers no operator-visible behaviour on its own and exists so the rule is written once
(REQ-1). It is still tied to REQ-1 to REQ-5 and REQ-7, so it is enabling in effect rather than
unattached.

## Risks carried forward

- **The tiebreak is deleted by someone tidying up.** Three of the six lists have no identifier but
  their own name, so the final comparison reads like a redundant second look at the same string. It
  is not: the first comparison ignores case and reads digits as numbers, the second separates exactly
  what the first called equal. REQ-6's both-ways-round assertion is the only guard that fails when it
  goes, which is why it is required in every service's own test file and not only in batch 1's.
- **A list looks sorted and is not.** The whole item's failure mode, and it is invisible on
  inspection: it reshuffles only when two rows collide, only sometimes, and gets blamed on something
  else. Everything in batch 1 exists against this one risk.
- **Batch 5 changes lists nobody complained about.** Digit-suffixed names move into their correct
  places in swarm, plugins and registries panels. Intended, visible, small — and stated in the spec's
  own risks so it is not later mistaken for a regression.
- **Batch 7 is the widening, and it is the part most likely to be wrong.** Two of its three lists
  resisted the rule (a build-cache record has no name; a Hub search already has a meaningful order),
  and both answers are judgement calls recorded above. It sits last and alone for exactly this
  reason.
- **The dashboard's activity list will be "fixed" by somebody.** It sorts client-side, which reads
  like the thing REQ-28 forbids; it is deliberate, and it is already total. REQ-42 and the note in
  the requirements are the only defence, and they work only if they are read before the diff is
  written.
- **The six panels are not re-read by any batch after 6.** If a later item changes how a panel builds
  its rows, the order can be undone client-side again and only the e2e spec of batch 6 will say so.
