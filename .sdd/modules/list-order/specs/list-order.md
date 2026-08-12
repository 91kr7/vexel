---
module: list-order
component: List order
type: backend module
---

# List order

**Purpose** → the single place on the server where the order of a list of named objects is decided.
It is domain-agnostic: it is given a name and an identity and returns an order, and knows nothing
about Docker.

## Contract

- `compareNames(left, right) → number` — negative, zero or positive, ascending
  - a name is either a string or the segments of a composite name (`["nginx", "1.25"]`), compared
    segment by segment; when one is a prefix of the other, the shorter comes first
  - `app-2` before `app-10`; `Redis` and `redis-cache` adjacent rather than in two alphabets
  - `Data` and `data` compare equal; `app-1` and `app-01` compare equal; `cafe` and `café` compare
    equal
- `compareIdentities(left, right) → number` — exact comparison of two strings, ascending
  - `Data` before `data`; `app-01` before `app-1`; equal only when the two strings are identical
- `byNameThenIdentity({ group?, name, identity }) → (left, right) => number` — a comparator for
  `Array.prototype.sort`
  - `group`, when given, is an ascending rank compared **before** the name, so a list that groups
    keeps its grouping and only the comparison of names changes
  - then the name under `compareNames`, then the identity under `compareIdentities`
- `byNamedThenUnnamedNewest({ name, createdAt, identity }) → (left, right) => number` — a comparator
  for a list with a group of rows the operator did not name
  - `name` returns `null`/`undefined` for such a row
  - every named row comes before every unnamed one
  - named rows: name under `compareNames`, then identity under `compareIdentities`
  - unnamed rows: newest first by `createdAt`, then identity under `compareIdentities`
  - a creation instant is a number (epoch-based) or an ISO-8601 string; two numbers compare
    numerically, anything else compares as exact strings; a row with no creation instant comes after
    the rows that have one

## Rules and invariants

- The name comparison names an **explicit locale** and reads nothing else: no host locale,
  environment or configuration takes part, so the same pair compares the same way on any machine.
- The name comparison is deliberately blunt — it ignores case and diacritics and reads runs of
  digits as numbers — so ties are the normal case, not an edge case.
- **Both comparator builders end on the exact identity comparison**, so two distinct rows never
  compare equal. Where a list carries no identifier other than its name, that name compared exactly
  is the identity: the final comparison is a *different comparison of the same string*, never a
  no-op, and removing it reinstates the defect this rule exists to remove.
- Nothing here leans on the sort being stable: the result of ordering a set of rows does not depend
  on the order they were supplied in.
- One collator is built once, at module load, and reused by every comparison; a comparison costs
  constant time, so ordering a list of a few thousand rows costs no perceptible time.

## Requirements served

- plan-docker_management_app-list_ordering/REQ-1
- plan-docker_management_app-list_ordering/REQ-2
- plan-docker_management_app-list_ordering/REQ-3
- plan-docker_management_app-list_ordering/REQ-4
- plan-docker_management_app-list_ordering/REQ-5
- plan-docker_management_app-list_ordering/REQ-7
