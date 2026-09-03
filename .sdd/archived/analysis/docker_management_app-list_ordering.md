---
request_slug: docker_management_app-list_ordering
date: 2026-08-12
type: fix
reference: .sdd/analysis/docker_management_app.md
---

## Request

> - bug-3
>   the order of the elements of the panels in not set so the order of the element can change
>   randomically based on the output of the docker daemon
>   can you implement a sort? you are free to choise the best implementation

(Scope is bug-3 only, the sixth and last item of `bugs.md`. Its five predecessors were analysed
separately: change-1 in
[`docker_management_app-container_row_actions.md`](docker_management_app-container_row_actions.md),
change-2 in [`docker_management_app-container_detail_close.md`](docker_management_app-container_detail_close.md),
change-3 in [`docker_management_app-image_row_actions.md`](docker_management_app-image_row_actions.md),
bug-1 in [`docker_management_app-dialog_sizing.md`](docker_management_app-dialog_sizing.md),
bug-2 in [`docker_management_app-privileged_toggle_verification.md`](docker_management_app-privileged_toggle_verification.md).
With bug-3 analysed, `bugs.md` is empty.)

The request contains one sentence of diagnosis and one of delegation. The diagnosis — "the order is
not set, so it can change randomly based on the output of the docker daemon" — is correct and is
confirmed below. The delegation — "you are free to choose the best implementation" — means the
ordering scheme is decided in this analysis, with its reasoning, and is not handed back as a
question.

## Reference

Fix of the delivered product analysed in
[`.sdd/analysis/docker_management_app.md`](docker_management_app.md).

**Starting point.** That analysis specified a Docker management client whose promise is a complete
and faithful front end to the daemon, presented through one coherent visual language across every
screen. Listing objects is the first thing every one of those screens does: containers, images,
volumes, networks, contexts and builders each open on a panel of rows, and every row-level operation
the product offers — inspect, start, stop, kill, remove, prune, run, tag, push, switch — is reached
by finding a row and acting on it. The delivered product lists all of these correctly in content:
the right objects, with the right values. What is not established is the order they appear in.

**This is not a new capability, it is an unfinished convention.** The product already sorts
server-side, by name, ascending, using a locale-aware comparison, in seven of its list services:
swarm services, swarm secrets, swarm stacks (and the services within a stack), swarm nodes, daemon
plugins, CLI plugins, and registries (which sorts official entries first, then by host). Exactly six
list services do not sort at all, and they are exactly the panels the request is complaining about:
containers, images, volumes, networks, contexts and builders. So the honest framing of bug-3 is not
"choose an ordering scheme for this product" but "half the product follows a convention and half
does not, and the half that does not is the half the operator uses most".

**Changes.** This fix adds no capability and removes none. It corrects delivered behaviour: the six
listed panels return their rows in whatever order the daemon happened to produce, an order the
daemon does not guarantee and which is observably unstable between reads. After the fix, every one
of those panels has a defined, total and repeatable order, arrived at by extending the convention
the other seven already follow rather than by inventing a second scheme. Nothing about which objects
are listed, what their rows contain, or what the row actions do changes.

**Why this is a fix and not an evolution.** Delivered behaviour is demonstrably wrong against the
reference analysis on two counts. It is wrong against the coherence the product is sold on — the
same kind of panel behaves differently depending on which screen it is drawn on, for no reason an
operator can perceive. And it is wrong against that analysis's own standing requirement that
destructive operations be protected against accidental data loss: a list that reshuffles between the
moment a row is read and the moment it is clicked puts a `remove` or a `kill` on the wrong object,
and three sibling analyses have already recorded rows appearing, vanishing and "re-sorting" under an
open menu or an open detail panel as a live hazard. Those analyses assumed a sort that, in six
services, does not exist. The behaviour is not merely absent; it is contradicted.

## Summary

Six list panels — containers, images, volumes, networks, contexts, builders — present their rows in
the daemon's incidental order, which the daemon does not guarantee and which changes between reads,
so rows move for no reason the operator caused. Give every one of them a defined, total, repeatable
order, alphabetical by the name the row displays, extending the convention the product's other seven
list services already follow.

## Business goal

**Rows must stay where the operator left them.** These panels are worked, not read: the operator
returns to the same container a dozen times while debugging it, and each return is a scan for a
name in a place they expect it. When position carries no information — when the same list, re-read
one second later with nothing changed, hands back a different arrangement — every visit costs a full
scan, and the operator learns not to trust position at all. That is a permanent, low-grade tax on
the product's most used screens, and it is the reason the human noticed at all.

**It is also a safety property, not only a comfort.** These lists carry the destructive actions:
`kill`, `rm`, `remove`, `prune`, `untag`. They re-read on every daemon event, which means they can
re-read between the operator deciding which row to click and the click landing. If the order is
undefined, that re-read may deal the rows differently and the pointer lands on a neighbour — the
exact accidental-data-loss failure the reference analysis exists to prevent, and a hazard three
sibling analyses have already flagged while assuming this ordering was in place. A defined total
order does not eliminate motion (a container really can be created or removed by someone else) but
it removes all motion that is not caused by a real change, which is the overwhelming majority of it.

**And it removes an inconsistency the product cannot defend.** An operator moving from the swarm or
plugins screens, which are ordered, to the containers or images screens, which are not, sees the
same component behave two different ways. There is no story that justifies it; there is only the
fact that six services were written without the line the other seven have.

Secondary but real: ordered lists are testable. An assertion about where a fixture appears relative
to another fixture is only meaningful once the order is defined, and the suite's rule that a test
may never assume an empty daemon (`CLAUDE.md`) makes relative-order assertions the only ones
available.

## Requirements

### Functional

**The six panels are ordered.** Containers, images, volumes, networks, contexts and builders each
present their rows in a defined order, whose result is identical for identical data no matter how
many times the list is read.

**The order is total, not partial.** No two distinct rows may compare as equivalent. Any comparison
that can return "equal" for two different objects leaves their relative placement to the order the
data arrived in — which is precisely the varying thing this fix exists to remove — so the last step
of every comparison is a value that is unique per object and does not change between reads: the
object's identifier. A list that is "sorted" but not total reproduces the reported symptom exactly
while appearing to have been fixed, and would do so only intermittently, which is worse.

**One comparison rule for names, used everywhere.** Names are compared ascending, case-insensitively
(so `Redis` and `redis-cache` sit together rather than being separated into two alphabets), and with
runs of digits compared as numbers rather than as text, so `app-2` precedes `app-10`. The numeric
rule is not a refinement borrowed from elsewhere: Docker Compose names replicas `project-service-1`,
`-2`, … `-10`, and swarm and scaled workloads do the same, so digit-suffixed names are the normal
case in this domain and text comparison gets them visibly wrong. The seven services that already
sort adopt this same rule, so the product has one rule rather than one plus a legacy one; the only
visible consequence there is that digit-suffixed names in those lists become correctly ordered.

**The sort key of each list is the name the row displays.**

- **Containers** — the container's name, as shown in the row. Container names are unique on a
  daemon, so the identifier tiebreaker will rarely be reached, but it is still required.
- **Volumes** — the volume's name, with the grouping rule below.
- **Networks** — the network's name, tiebroken by network id. This tiebreak is not theoretical:
  Docker documents that network names "must be unique" but that the daemon's conflict detection "is
  not guaranteed", and duplicates are routinely produced by parallel creation, so two rows with the
  same name is a state the panel must order deterministically rather than shuffle.
- **Contexts** — the context's name. The active context is marked, not moved: promoting the current
  context to the top would move a row in response to the operator's own action and undo the
  stability being bought.
- **Builders** — the builder's name, with the default builder in its alphabetical place, for the
  same reason.

**Images — the case with no single name.** An image may carry several tags, or none, so its key is
derived rather than read:

- An image with tags sorts by its **lowest tag under the comparison rule above**, comparing
  repository first and then tag, so `nginx:1.25` precedes `nginx:latest` and all tags of one
  repository stay together. The key must be the lowest tag and not "the first tag the daemon
  returned": the daemon's tag list has no guaranteed order either, so keying on its first element
  would make the image's own key vary between reads — the same defect, one level down.
- Because of that, **the tags shown inside a multi-tag row are themselves listed in that same
  order**. This is in scope only because the row's sort key depends on it.
- An image with **no tag but a digest reference** (pulled by digest) still has a repository name and
  is treated as a named image: it sorts under that repository, with its tag position rendered as the
  product renders it today.
- An image with **neither tag nor digest reference** — a genuinely dangling image, displaying as
  `<none>` — has no name and joins the unnamed group below.

**Unnamed objects group at the end, newest first.** Dangling images and anonymous volumes are named
by the daemon, not by the operator: a dangling image shows `<none>`, an anonymous volume shows 64
hexadecimal characters. Both are placed after all named rows, as a group, ordered by creation time
descending, tiebroken by identifier. Three reasons, and they are the same three for both:

- Sorting them alphabetically among named rows is not an order, it is interference. `<none>` begins
  with a punctuation character and would land a block of indistinguishable rows at the very top of
  the images panel — the single worst position, chosen by accident rather than by anyone. Anonymous
  volume names begin with `0`–`9` or `a`–`f` and interleave into the middle of the named ones, so
  `3f9a…` sits between `api-data` and `backup`.
- The operator does not look these up by name, because there is no name to look up by. They are
  swept, not visited, and they are numerous — anonymous volumes accumulate in the thousands on a
  working machine.
- Recency is the only ordering that carries information for a row with no name: the leftovers of the
  build or the run just performed are the ones with any chance of being recognised. Where a creation
  time is not available for a class of object, that group falls back to identifier ascending, which
  is arbitrary but stable, and stable is the requirement.

The anonymous-volume group is identified by the shape the daemon generates (exactly 64 hexadecimal
characters). An operator who deliberately names a volume that way will see it grouped with the
anonymous ones; that is cosmetic, affects a row nobody creates by accident, and is preferable to
scattering thousands of hex names through the named ones.

**Ordering is decided once, server-side, in the list services.** Three reasons, in order of weight:

- It is where the convention already lives. Seven services sort there; putting the other six
  somewhere else would replace one inconsistency with a worse one.
- The order becomes a property of the response rather than of one screen's render path, so every
  consumer inherits it — a second view onto the same data, an export, a future screen — instead of
  each re-deriving it and being one omission away from this bug returning.
- The lists re-read completely on every daemon event. An order established once per response is
  applied on exactly the occasions the data changes, and cannot be partially applied.

**The client presents the order it receives.** This requirement is the other half of the one above,
and it is stated separately because a sort applied at one layer can be silently undone at the other.
The client must not re-derive an order of its own, and must not let one emerge from how it stores or
merges the rows it receives. Two consequences worth naming:

- **Filtering and searching must preserve relative order.** A filter that keeps a subset of an
  ordered list is still ordered; a search that *ranks* by relevance would replace the order and
  reintroduce the complaint under a different name. Filtering here is a predicate, not a ranking.
- **If any panel already offers the operator an explicit ordering control**, the operator's choice
  wins and the order defined here is the default it starts from. Nothing in this fix adds such a
  control.

**Reordering never moves the operator's context.** A re-read that produces the same order must
produce no visible movement at all: selection, an open row menu, an open detail panel, focus and
scroll position stay on the object they were on, identified by its identity and not by its position.

### Non-functional

- **Deterministic across machines.** The same objects produce the same order on any machine, under
  any operator locale. An order that depends on the host's collation settings is not repeatable and
  cannot be asserted by a test that runs anywhere but the machine it was written on.
- **Not perceptible in cost.** These lists are small — tens to low thousands of rows on the largest
  realistic host — and ordering them must not add perceptible latency to a list response, including
  under the event-driven re-reads that happen while the operator watches.
- **Uniform.** All thirteen list services end up following one rule, expressed once. Two rules that
  agree today are two rules that diverge later; this fix exists because such a divergence already
  happened.
- **Verifiable without owning the daemon.** Acceptance is expressed as the relative order of the
  fixtures a test created — "mine appear in this order relative to each other" — never as absolute
  positions, counts or an empty list, in keeping with the suite's standing rule that the operator's
  own objects are present and untouchable.
- **Visibly correct under the product's own operations.** Recreating a container (which the product
  does when a setting is edited), retagging an image, or switching context must not move an unrelated
  row.

## Assumptions

- **The daemon guarantees nothing about list order, and what it does today varies by endpoint.** The
  request's diagnosis is taken as correct and is corroborated: `docker network ls` is a
  long-standing, reported case of the same output appearing in a different order on each invocation,
  because the networks are held in a structure with no order; the container and image endpoints do
  in practice come back newest-first by creation, but the CLI's own tracker records that ordering as
  unstable for objects sharing a creation second, since the timestamps are second-granular and there
  is no tiebreaker. Volumes and contexts are read from storage whose enumeration order is an
  implementation detail. None of this is documented as a contract, and depending on it is precisely
  what the human is objecting to — so the fix does not lean on any of it, including the parts that
  happen to be orderly today.
- **The client does not currently impose an order of its own on these six lists.** The evidence is
  that the reported symptom is the daemon's order showing through, which cannot happen if something
  downstream is reordering. If the next phase finds a client-side ordering, it is superseded by the
  server's order rather than layered on top of it; the requirement above is written two-sided so the
  outcome does not depend on which is true.
- **The panels render one row per object** — one per image regardless of tag count, one per
  container — and this fix does not change that. Bug-3 is about the order of rows, not about what a
  row is.
- **Every object in these lists exposes a stable unique identifier** available where the list is
  built, and images and volumes expose a creation time. Both are standard daemon data; if a creation
  time proves unavailable for a class, that group falls back to identifier ascending as stated.
- **No operator-facing preference for ordering is wanted.** The request asks for *a* sort, not a
  setting. A per-panel sort control is a capability, not a defect correction, and would be an
  evolution of its own.
- **`bugs.md` is not modified by this analysis.** Removing the item is the human's record-keeping.

## Constraints

- **Docker's data shapes are given.** Names may repeat across networks; images may have zero, one or
  many tags; anonymous volumes and dangling images have no operator-assigned name at all. The
  ordering scheme must be defined for all of these, not for the tidy case.
- **The lists re-read on every daemon event.** Whatever is decided is executed constantly and under
  concurrent change, so it must be cheap, and it must be total — a scheme that is only *almost*
  deterministic will be caught out by this frequency, not protected from it.
- **The daemon is shared with the operator's real work.** Their containers, images and volumes are
  in these lists and must be ordered like any other, never filtered, grouped away or otherwise
  treated as second-class.
- **The convention already exists in seven services** and is the baseline: the fix extends it. A
  scheme that required abandoning it would have to justify changing lists nobody complained about.
- **Existing tests may encode today's incidental order.** Any assertion that passes only because a
  list arrives in daemon order is invalid by this fix's own terms and is corrected with it.

## Market trends

Relevant: Docker management interfaces are a real product category with direct competitors, and list
ordering is a documented, contested point in them rather than a matter of taste.

- **The competing convention is alphabetical by name, applied by default, and its absence is treated
  as a bug — not as a missing feature.** Portainer's tables default to sorting alphabetically by
  name; when a change removed that default, it was filed as a regression ("No default sort on
  tables") and fixed in the next release, and a separate request exists asking specifically for
  volumes to be sorted alphabetically. This is the same complaint as bug-3, raised by users of the
  nearest comparable product, and resolved the way this analysis recommends.
- **The daemon's own order is known not to be dependable.** `docker network ls` returning a
  different order on each run is a reported and understood behaviour of the networking layer, whose
  networks are held in an unordered structure. This is the direct evidence for the request's
  "randomically", and it is why the product cannot simply pass the daemon's order through.
- **Recency-based defaults are what the CLI does, and they are where the instability shows.** The
  CLI's default for images is creation time descending, and its own issue tracker records that this
  is non-deterministic for images created within the same second because there is no secondary key.
  That is a live demonstration of the "ties must break to a total order" requirement above, from the
  reference implementation of this domain.
- **The market does not expect the GUI to copy the CLI.** No comparable GUI was found defaulting to
  the daemon's raw order; the graphical products order for lookup while the command line orders for
  recency, which fits their different uses — a terminal shows what just happened, a panel is
  returned to repeatedly.

Sources: [Portainer #3006, no default sort on tables](https://github.com/portainer/portainer/issues/3006),
[Portainer #3635, sort volumes alphabetically](https://github.com/portainer/portainer/issues/3635),
[libnetwork #926, `docker network ls` shows output in a different order each time](https://github.com/moby/libnetwork/issues/926),
[docker/cli #2637, default image sort is unstable for equal timestamps](https://github.com/docker/cli/issues/2637),
[docker network create reference — names "must be unique", uniqueness "not guaranteed"](https://docs.docker.com/reference/cli/docker/network/create/),
[moby #29268, multiple networks with the same name can be created](https://github.com/moby/moby/issues/29268).

## Risks

- **A partial order that looks fixed.** The highest risk of this fix is doing it and not fixing it:
  sorting by name and leaving equal keys unbroken, which reshuffles only when two rows collide and
  only sometimes. It would pass a casual look, fail rarely and unreproducibly, and be blamed on
  something else. The total-order requirement exists for this and must be verified with a case that
  actually has a tie — two networks of the same name, two images created in the same second.
- **The order is re-established server-side and undone client-side.** The second most likely failure:
  one panel builds its rows through a path that does not preserve the received sequence, and that
  panel alone keeps the bug while the API is provably correct. Every one of the six panels is
  checked through the interface, not only through its service.
- **Alphabetical ordering hides recency the operator sometimes wants.** After a build or a pull, the
  new image does not appear at the top. This is accepted: the operator knows the name of what they
  just built or pulled, tagged images are findable by that name, and the alternative pushes freshly
  created anonymous leftovers to the top of the panel instead. The unnamed group's newest-first rule
  gives recency exactly where names cannot help. If this proves wrong in use, the answer is a
  creation-time column or an explicit sort control, which is an evolution and not a reversal of this
  fix.
- **The product now has two ordering rules.** Named rows are alphabetical; unnamed rows are
  newest-first. That is a real cost and it is bounded deliberately: the second rule applies only to
  rows that have no name, so the operator never has to know which rule a named row follows, and
  neither rule ever applies to the same row at different times. The alternative — one rule
  everywhere — means either sorting `<none>` as text, which puts noise at the top of the images
  panel, or ordering everything by recency, which surrenders the stability this fix is for.
- **Adopting case-insensitive, numeric-aware comparison changes the seven lists that already sort.**
  Visible, small and intentional: digit-suffixed names move into their correct places. It is called
  out here so it is not later mistaken for a regression in a list nobody reported.
- **Locale-dependent comparison makes the order machine-dependent**, which would surface as tests
  that pass on one machine and fail on another — the most expensive kind of failure to diagnose,
  since it implicates everything except the actual cause.
- **The anonymous-volume heuristic misfires** on a volume an operator named with 64 hexadecimal
  characters. Cosmetic, and the alternative — scattering thousands of hex names through the named
  ones — is worse every day rather than once.
- **Tests written against today's incidental order** may fail on this change, and a failure there is
  the fix working. The opposite is the real risk: a test that passes only because it asserts on
  whatever arrived, and therefore never asserted anything.

## Scope

**In scope**

- Defining one ordering rule and applying it so that the six unordered list panels — containers,
  images, volumes, networks, contexts, builders — have a defined, total, repeatable order.
- The sort key for each of those six, including the derived key for images and the placement of
  dangling images and anonymous volumes.
- The order of the tags listed inside a multi-tag image row, because the row's sort key is defined in
  terms of it.
- Aligning the seven services that already sort to the same single comparison rule, so the product
  has one rule and not two.
- Guaranteeing that the order the operator sees is the order that was decided: preserved through
  filtering and searching, unchanged by a re-read that changes nothing, and never moving selection,
  focus, an open menu or an open detail panel.
- Verification that each of the six panels stays put across repeated reads and daemon events,
  including a case with tied keys.

**Out of scope**

- **Any list whose order carries meaning.** An image's layer stack, log and console output, event
  streams, command history and any other sequence that is chronological or structural by nature is
  already correctly ordered and must never be alphabetised. This fix concerns lists of named objects
  only.
- **Operator-facing ordering controls**: clickable column sorts, a stored ordering preference, a
  recency toggle, grouping by compose project or by state. All are capabilities, not corrections.
- **Which rows exist and what they contain**: filters, columns, pagination, row actions, detail
  panels and every operation reachable from a row are untouched.
- **In-row collections other than the image tag list** — a container's ports, mounts, networks or
  labels. They may present the same instability; they are not what the six named services return,
  they are not evidenced in the request, and pulling them in would widen a fix into a sweep. If one
  is reported, it is the same rule applied one level down.
- **Lists not among the thirteen named here.** ~~They inherit the order of the data they are built
  from and are not separately specified by this fix.~~ **Both halves of that sentence were corrected
  during planning; it is struck through rather than deleted so nobody re-derives it.**

  *On the first half:* a derived list does **not** necessarily inherit its source's order.
  `client/src/dashboard/DashboardScreen.tsx:101` sorts containers by state and then by name, in the
  client, over a list the server had already ordered. Establish what a derived list does; do not
  assume it inherits. That one is deliberately left untouched — its comparison is already a *total*
  order, since Docker enforces unique container names on a daemon, so it cannot reshuffle between
  reads, which is the defect being fixed here. What survives is host-locale dependence, which varies
  the order between machines and never between two reads on one machine.

  *On the second half:* three lists that are not among the thirteen were found unsorted during
  planning and **are** in scope after all — compose projects, build-cache records, and the registry
  catalog's repositories and tags. The human's request names "the panels", not a list of services,
  and leaving known-shuffling panels unfixed would answer it only partly. They are planned in a
  batch of their own, last, depending on nothing and depended on by nothing, so the widening can be
  dropped whole without touching the six reported panels.
- **Performance work on the list endpoints**, beyond not making them perceptibly slower.
- **The other five items of `bugs.md`**, each analysed in its own file and listed at the top of this
  one. With bug-3, the file is exhausted.
