---
module: list-order
component: List order conformance check
type: build check
---

# List order conformance check

**Purpose** → keeps "the rule exists in exactly one place" true after the day it is written: it
fails the build when an ordering is written anywhere under `server/src/` outside the ordering area.
Without it, a fourteenth comparison is added by the next list service and nothing says so — which is
exactly how seven services came to sort and six not to.

## Contract

- runs as a Node script over every `.ts` file under `server/src/` except `server/src/list-order/`,
  invoked by the server workspace's test command and on its own as `npm run lint:list-order`
  - no violation → exit code `0`, one line on stdout saying the check passed
  - one or more violations → exit code `1`, and on stderr one line per violation followed by their
    count and a pointer to the ordering area
- every violation line names the file relative to the repository and, when it is a comparison, the
  line number

### What is reported

- a comparator written inline in `.sort(...)` / `.toSorted(...)` → `a comparator written inline`
- a `.sort()` / `.toSorted()` with no comparator → `a comparator-less sort, which compares names as
  text`
- a `localeCompare` call → `a` \``localeCompare`\` `name comparison`
- an `Intl.Collator` of its own → `a collator of its own`
- a file on the awaiting-adoption list below — **now empty** — that no longer carries an ordering of
  its own → a violation asking for its entry to be removed

### What is accepted

- a `.sort(comparator)` whose argument is not a function literal — the shape a list service takes
  when it orders through the shared rule
- an ordering on the check's own allow-list of orderings whose result carries meaning: the
  path-ordered outputs of `image-analysis` (`image-diff-service.ts`,
  `filesystem-extraction-service.ts`, `secret-pattern-scan.ts`), its size-ranked findings
  (`layer-duplicate-detection.ts`, `layer-waste-analysis.ts`) and the timestamp-ordered task history
  of `swarm/swarm-services-service.ts`
- an ordering carrying a `list-order-exception:` comment on its own line or on the line above it —
  the residual escape hatch, for a case genuinely outside the list

## Rules and invariants

- The allow-list is **explicit and small**, and every entry on it is an ordering whose result carries
  meaning rather than a name comparison. An entry may be pinned to one comparison within its file
  rather than exempting the whole of it, which is how the swarm task history is allow-listed while
  the service listing in the same file is not.
- The check fails **closed**: an inline comparator is reported whatever it compares, because what a
  comparator sorts by cannot be judged without the types the check does not have, and a name
  comparison is what an inline comparator most often turns out to be.
- A second, **temporary** list held the services that ordered by name before the shared rule existed,
  while they adopted it. It was self-expiring — an entry whose file no longer carries an ordering of
  its own is itself reported — and **all seven have adopted the rule, so it is empty**: every
  ordering written in a service is now a violation, none of them a pending adoption. The mechanism
  stays, and an entry added to it still cannot outlive its adoption.
- It reads text and needs no parser: comments and the contents of string, template and
  regular-expression literals take no part, so a comparison merely named in a comment is not
  reported, and the line a violation is reported on is the line it is written on.
- A violation never suppresses another: every one found in the pass is listed, at most one per line
  of source.

## Requirements served

- plan-docker_management_app-list_ordering/REQ-1
