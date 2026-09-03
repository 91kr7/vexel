---
slug: docker_management_app-list_ordering
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-list_ordering.md
status: validated
---

# Requirements — A defined, total, repeatable order for every list of named objects

Fix of the delivered product. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md); this is **bug-3** of
the human's `bugs.md`, the sixth and last item.

Requirements are observable, individually verifiable behaviours. Ids are local to this plan: `REQ-1`
below is *not* `plan-docker_management_app/REQ-1`. Requirements of other plans are always cited with
their path prefix.

## The one thing that must not be got wrong

**A list that is sorted by name is not yet fixed.** The spec names this as the highest risk of the
whole item: a comparison that can return "equal" for two distinct rows leaves their relative
placement to the order the daemon happened to supply, which is the exact varying thing this fix
exists to remove. It would look fixed, fail rarely, fail unreproducibly, and be blamed on something
else.

**And the tie is not a theoretical case here, it is the normal one**, because the name comparison
this fix adopts is deliberately blunt: it ignores case (REQ-2) and reads digit runs as numbers
(REQ-3). So `Data` and `data` compare equal, and so do `app-1` and `app-01` — two pairs any operator
can create in five seconds on any of the six panels. **REQ-5 and REQ-6 own this**, and REQ-6 states
the only check that can catch its absence: the same objects, supplied to the ordering in both
orders, must come out the same way. **A check that only asserts alphabetical order passes on a
partial order** and is therefore not evidence of anything.

## What is established, and what follows from it

Facts, verified against the repository before this plan was written:

- **Seven list services already order by name**, server-side, with `localeCompare` ascending:
  `swarm-services-service.ts`, `swarm-stacks-service.ts` (stacks, and the services nested within a
  stack), `swarm-nodes-service.ts` (managers before workers, then hostname),
  `swarm-secrets-service.ts` (secrets and configs), `daemon-plugins-service.ts`,
  `cli-plugins-service.ts`, `registries-service.ts` (official entries first, then host). Six do not
  sort at all, and they are exactly the reported panels: `containers-service.ts`, `images-service.ts`,
  `volumes-service.ts`, `networks-service.ts`, `contexts-service.ts`, `builders-service.ts`.
  **This fix extends a convention; it does not invent one.**
- **The client re-orders nothing.** No `.sort(` and no `.reverse(` in the client's containers,
  images, volumes-networks, contexts or builders code, and the shared `DataTable` has no ordering of
  its own. The client presents the order it receives, which is why the daemon's order shows through.
- **What identity each of the six lists actually has**, read from the service contracts rather than
  assumed — and it is not uniform:

  | List | Identity available | Creation time available |
  | --- | --- | --- |
  | containers | `id` | not in the summary (not needed: every container has a name) |
  | images | `id` | `createdAt` |
  | networks | `id` | not in the summary (not needed: no unnamed group) |
  | volumes | **the name, and nothing else** | `createdAt` |
  | contexts | **the name, and nothing else** | none, and none is needed |
  | builders | **the name, and nothing else** | none, and none is needed |

  **Three of the six carry no identifier but their own name.** That does not make the tiebreak
  redundant — it makes it easier to drop. It is a *different comparison of the same string*: the
  primary one ignores case and reads digits as numbers, the final one distinguishes exactly the
  values the primary one calls equal. An implementer who reasons "the key is the name, so a
  tiebreaker on the name is a no-op" reintroduces the reported defect in precisely the lists where
  it is hardest to notice.
- **The image summary's `digest` field has already dropped its repository** (the `repo@` prefix is
  stripped, leaving `algorithm:hash`), so REQ-18 cannot be met from the emitted field. The
  repository is present in the daemon's own payload the service already reads.
- **`ContainersService` is the one of the six with no unit-level test file**; the other five have
  one. One is created rather than pushing the containers tie cases into a check where a tie cannot
  be constructed.
- **Three further operator-facing lists have the same defect and were never reported**: compose
  projects and the services within them (`compose-discovery-service.ts`), build-cache records
  (`build-cache-service.ts`), and the registry catalog's repositories and tags
  (`registry-catalog-service.ts`). None of them sorts. They are in scope by human decision — see F7,
  and the reasoning in `batches.md`.
- **The Dashboard's container activity list is the one place in the client that imposes an order of
  its own** (`client/src/dashboard/DashboardScreen.tsx:101`): state first, then name. It does not
  merely inherit the container list's order. It was examined and **found already deterministic for
  the reported symptom**: it sorts by state, then name, over containers, and Docker enforces
  uniqueness of container names on a daemon, so no two rows can tie on that pair — it is already a
  total order and cannot reshuffle between two reads. **It is therefore left exactly as it is**
  (REQ-42), with the residual named: its name comparison is host-locale dependent, which can change
  the order **between machines** but never between two reads on one machine. That is a real but
  different and much smaller thing than bug-3. The fact is recorded here so that nobody implementing
  F6 mistakes it for the client-side re-ordering REQ-28 forbids.

## F1 — One ordering rule for the whole product

This feature produces no visible change on its own. It is the **foundation** the other five stand
on, and it is where the total-order property is established and demonstrated once, rather than
re-argued six times.

| ID | Requirement |
| --- | --- |
| REQ-1 | Names are compared by **one rule that exists in exactly one place** on the server. No list service carries a name comparison of its own, and adding a list service later means using that rule rather than writing a fourteenth. Two rules that agree today are two rules that diverge later; this fix exists because such a divergence already happened. |
| REQ-2 | Names compare **ascending and case-insensitively**, so `Redis` and `redis-cache` sit together instead of being separated into two alphabets. **Names differing only in their diacritics compare equal too** (`café` and `cafe`), and are then separated by REQ-5's exact comparison. This is a knowingly accepted consequence and not an accident of how the rule is expressed: it **groups** such names adjacently instead of scattering them, which is what someone scanning a list wants, and totality is untouched. |
| REQ-3 | **Runs of digits inside a name compare as numbers, not as text**, so `app-2` precedes `app-10`. This is the normal case in this domain, not a refinement: Compose names replicas `project-service-1`, `-2`, … `-10`, and scaled and swarm workloads do the same. |
| REQ-4 | The comparison depends on **nothing outside the two values compared** — not the host's locale, environment or configuration. The same pair compares the same way on any machine and under any operator locale, so an assertion about order is not a property of the machine that wrote it. |
| REQ-5 | **No two distinct rows ever compare equal.** The last step of every comparison is the object's own identity — unique per object, unchanged between reads — and that final comparison is **exact**, meaning it separates the values the name comparison treats as equal (`Data` from `data`, `app-1` from `app-01`). Where a list carries no identifier other than its name, that name compared exactly *is* the identity, and comparing it is not optional. |
| REQ-6 | The totality of REQ-5 is **demonstrated with pairs that genuinely tie** under REQ-2 and REQ-3 — names differing only in case, and names differing only in leading zeros — and demonstrated by the only check that can detect its absence: **the same objects supplied in both possible input orders produce the same output order**. An assertion that merely checks the result is alphabetical passes on a partial order and does not satisfy this requirement. |
| REQ-7 | Ordering a list costs **no perceptible time** at the sizes these panels reach (tens to low thousands of rows), including under the event-driven re-reads that happen while the operator watches. |

## F2 — The four name-keyed panels: containers, networks, contexts, builders

The four of the six whose sort key is simply the name the row displays, with nothing derived and no
group of unnamed rows.

| ID | Requirement |
| --- | --- |
| REQ-8 | The **containers** list is ordered by container name under the F1 rule, with the container's id as the final comparison. |
| REQ-9 | The **networks** list is ordered by network name under the F1 rule, with the network's id as the final comparison. **Two networks carrying the same name are ordered identically on every read** — Docker documents network-name uniqueness as not guaranteed, and duplicates are routinely produced by parallel creation, so this is a state the panel must order rather than shuffle. |
| REQ-10 | The **contexts** list is ordered by context name under the F1 rule. A context carries no identifier other than its name, so the final comparison is that name compared exactly (REQ-5). **The active context is marked, not moved**: promoting it to the top would move a row in response to the operator's own action and undo the stability being bought. |
| REQ-11 | The **builders** list is ordered by builder name under the F1 rule. A builder carries no identifier other than its name, so the final comparison is that name compared exactly (REQ-5). **The active builder keeps its alphabetical place**, for the same reason. |
| REQ-12 | Each of these four returns the **identical sequence when read repeatedly** with nothing changed, whatever order the daemon supplied the objects in. |

## F3 — Volumes, with the anonymous ones grouped last

| ID | Requirement |
| --- | --- |
| REQ-13 | **Named volumes** are ordered by name under the F1 rule, and every one of them appears **ahead of every anonymous volume**. |
| REQ-14 | **Anonymous volumes** — those the daemon named rather than the operator, recognised by a name of exactly 64 hexadecimal characters — are grouped **after all named volumes**, ordered **newest first** by creation time, with the name compared exactly as the final comparison. Sorting them alphabetically among the named ones is not an order but interference: they begin with `0`–`9` or `a`–`f` and land `3f9a…` between `api-data` and `backup`, in their thousands, under no name anyone can look up. |
| REQ-15 | A volume an operator deliberately named with 64 hexadecimal characters **is grouped with the anonymous ones**. This is accepted and not corrected: it is cosmetic, it affects a row nobody creates by accident, and the alternative is scattering thousands of hex names through the named ones. |
| REQ-16 | The volumes list returns the **identical sequence when read repeatedly** with nothing changed, whatever order the daemon supplied. |

## F4 — Images, keyed by their lowest tag, with the dangling ones grouped last

The one list with no single name to sort by: an image may carry several tags, or none.

| ID | Requirement |
| --- | --- |
| REQ-17 | An image with tags sorts by its **lowest tag** under the F1 rule, comparing **repository first and then tag**, so all tags of one repository stay together and `nginx:1.25` precedes `nginx:latest`. |
| REQ-18 | That key is **the lowest tag and never "the first tag the daemon returned"**. The daemon's tag list has no guaranteed order either, so keying on its first element would make the image's own key vary between reads — the same defect, one level down. |
| REQ-19 | The **tags listed inside a multi-tag image row are themselves in that same order**, lowest first. This is in scope only because the row's own sort key is defined in terms of it. |
| REQ-20 | An image with **no tag but a digest reference** (pulled by digest) is treated as a named image: it sorts among the named ones, under the repository of that reference. What the row displays is unchanged. |
| REQ-21 | An image with **neither tag nor digest reference** — a genuinely dangling image, displaying as `<none>` — is grouped **after every named image**, ordered **newest first** by creation time, with the image's id as the final comparison. **Two dangling images sharing a creation instant are ordered identically on every read**: image timestamps are second-granular and the daemon's own tooling records this exact case as unstable. Sorting `<none>` as text would instead land a block of indistinguishable rows at the very top of the panel — the single worst position, chosen by accident. |
| REQ-22 | The images list returns the **identical sequence when read repeatedly** with nothing changed, whatever order the daemon supplied. |

## F5 — The seven already-ordered lists on the same rule, and nothing else moved

| ID | Requirement |
| --- | --- |
| REQ-23 | The **seven list services that already order by name adopt the same single rule** as the six: swarm services, swarm stacks and the services nested within a stack, swarm nodes, swarm secrets and configs, daemon plugins, CLI plugins, registries. The visible consequence is intended and small — digit-suffixed names move into their correct places, and case stops splitting a list into two alphabets — and it is stated here so it is not later mistaken for a regression in a list nobody reported. |
| REQ-24 | Each of those seven **keeps the grouping it already applies ahead of the name comparison**: registries list official entries before host-only ones, swarm nodes list managers before workers, and a stack's services stay nested within their stack. Only the comparison of names changes. |
| REQ-25 | Those seven are **total too** (REQ-5): distinct rows never compare equal, the last comparison being the object's own identity. |
| REQ-26 | **No list whose order carries meaning is touched.** An image's layer stack and build history, log, console and terminal output, the daemon event stream, command history, swarm task history, and every path-ordered output of the image-analysis area (filesystem trees, diff trees, findings ranked by size) keep exactly the order they have today. This fix concerns lists of named objects only, and alphabetising a chronological or structural sequence would be a defect introduced by the fix for one. |
| REQ-27 | **Existing automated checks that pass only because a list arrived in the daemon's incidental order are corrected, not accommodated.** A failure there is this fix working. No check is weakened into accepting any order, which would leave it asserting nothing. |

## F6 — The order survives to the screen

The order is decided server-side so that every consumer inherits it (REQ-1). This feature is the
other half of that decision, and it is stated separately because **an order established at one layer
can be silently undone at the other** — the spec names it as the second most likely failure of the
item: one panel builds its rows through a path that does not preserve the received sequence, and
that panel alone keeps the bug while the API is provably correct.

| ID | Requirement |
| --- | --- |
| REQ-28 | Each of the six panels **displays the rows in the order it received them**. The client derives no order of its own, and none emerges from how it stores, keys or merges the rows. |
| REQ-29 | **Filtering and searching preserve relative order.** A filter that keeps a subset of an ordered list is still ordered; filtering here is a predicate, never a relevance ranking, which would replace the order and reintroduce the complaint under another name. |
| REQ-30 | **A re-read that produces the same rows produces no visible movement**: no row changes position, and the operator's selection, the open detail panel, focus and scroll position stay on the object they were on, identified by its identity rather than by its position. (An open row menu's binding to its container is already owned by `plan-docker_management_app-container_row_actions/REQ-16` and is not restated here.) |
| REQ-31 | **Every one of the six panels is verified through the interface**, not only through its service. A panel proved correct at the API and never looked at through the screen is exactly the failure this feature exists to catch. |
| REQ-32 | That verification **asserts on the relative order of the fixtures it created itself** — "mine appear in this order relative to each other" — and never on absolute positions, totals, counts or a list being empty. It passes unchanged on a daemon carrying the operator's own containers, images, volumes and networks, which are interleaved with its own and are ordered like any other row, never filtered or grouped away. |
| REQ-33 | That verification **removes everything it creates**, whatever the outcome, including whatever the daemon attaches on its own behalf and including any tag it added to an image it did not create; every object it creates carries the project's ownership labels; and it reaches **no external image registry**, drawing only on the fixtures the project already prepares for itself. |
| REQ-34 | **No operator-facing ordering control is added**, and none exists today: no clickable column sort, no stored ordering preference, no recency toggle, no grouping. The order defined here is what every panel shows. Such a control is a capability, not a correction, and would be an evolution of its own. |

## F7 — The lists nobody reported

Three further operator-facing lists carry the same defect and were **found rather than reported**.
They are in scope by human decision: the request says "the order of the elements of the panels is
not set", which is a statement about the product and not an enumeration of six services, and
delivering determinism to six panels while knowingly leaving three others shuffling is a partial
answer to a request that was not partial.

**Two of them resist the rule in a way the six do not, and each resistance is answered here rather
than papered over**: a build-cache record has no name at all, and a Docker Hub repository search
already has an order that means something.

| ID | Requirement |
| --- | --- |
| REQ-35 | **Compose projects** are ordered by project name under the F1 rule. A project carries no identifier other than its name, so the final comparison is that name compared exactly (REQ-5). |
| REQ-36 | **The services listed within a compose project** are ordered by service name under the same rule, with the service name compared exactly as the final comparison — the same shape swarm stacks already apply to the services nested inside them. |
| REQ-37 | **Build-cache records** are ordered by their identifier, ascending. A record has **no name and no creation time** in the data the panel is built from: it carries an id, a type, a size, a usage state and the build step that produced it. This is the spec's own stated fallback for a class of object with neither — arbitrary, but stable, and stable is the requirement. |
| REQ-38 | **No ranking is invented for the build cache by this fix.** Ordering those records by size, by usage state or by recency would be a product decision about a panel nobody complained about — and recency is not even available without changing what the service returns. If such an order is wanted, it is an evolution with its own reasoning, not a side effect of a determinism fix. |
| REQ-39 | **A repository catalog listing that carries no ranking of its own is ordered by repository name** under the F1 rule, with the name compared exactly as the final comparison. This is every registry other than Docker Hub: their catalog is listed and filtered by substring, in whatever order it arrives. |
| REQ-40 | **Docker Hub's repository search keeps the order Docker Hub returns it in.** That order is a relevance ranking for the term the operator typed, so it carries meaning, and alphabetising it would make the panel worse rather than more consistent — searching `nginx` would stop showing `nginx` first. This is REQ-26's principle applied to the one list in this feature that has an order already, and it is a deliberate exception, recorded so it is not read as an omission. |
| REQ-41 | **The tags of a repository** are ordered by tag name under the F1 rule, with the tag name compared exactly as the final comparison — so `1.25` precedes `1.26` precedes `latest`, the same reading of a tag that REQ-17 applies to a local image. |
| REQ-42 | **The Dashboard's container activity list is left exactly as it is.** It groups by container state before comparing names, and that grouping is the point of an activity panel rather than a defect. More decisively: it is **already a total order** — state, then name, over containers whose names Docker keeps unique on a daemon, so no two rows can tie and it cannot reshuffle between reads. It does not have the reported defect. What it does have is a host-locale-dependent name comparison, which can change the order **between machines** and never between two reads on one machine: named here as the residual, and not what bug-3 is about. It is the one place in the client that imposes an order of its own, so it is written down explicitly — read as the client-side ordering REQ-28 forbids, it would be removed under cover of this fix, and a deliberate, working behaviour would go with it. |
| REQ-43 | Each of the lists in this feature returns the **identical sequence when read repeatedly** with nothing changed, whatever order its source supplied. |
