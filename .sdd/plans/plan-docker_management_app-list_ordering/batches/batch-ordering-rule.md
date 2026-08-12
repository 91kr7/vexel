---
batch: 1 · ordering-rule
feature: F1 — One ordering rule for the whole product (enabling)
closed_req: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7
depends: —
---

# Batch 1 — One ordering rule for the whole product

**Enabling batch.** It changes no operator-visible behaviour: it writes the rule that batches 2 to 5
and 7 then apply. Nothing under `client/src/` is touched.

Requirements are in `../requirements.md` and are cited here by id only.

## What this batch is really for

Thirteen list services in this product will end up ordering rows, and six of them do not order at
all today. The rule they share is written **once, here**, because the alternative — six or thirteen
copies that agree on the day they are written — is the exact divergence that produced the bug being
fixed (seven services sort, six do not).

**The property that must not be lost is REQ-5, and the check that detects its loss is REQ-6.** A
comparison that can return "equal" for two distinct rows hands their placement back to the order the
daemon supplied, which is the varying thing this whole item exists to remove. It will look fixed. It
will fail rarely and unreproducibly. And it will be blamed on something else.

**Ties are the normal case here, not an edge case**, because this rule is deliberately blunt: it
ignores case (REQ-2) and reads digit runs as numbers (REQ-3), so `Data` and `data` compare equal, and
so do `app-1` and `app-01`. An operator produces either pair in five seconds.

**Do not lean on the language's sort being stable.** V8's is, which is worse than if it were not: a
name-only comparison passes a unit test written with one fixed input order and then reshuffles in
production, where the input order is the daemon's. REQ-6 permutes the input for precisely this
reason.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | server, a new shared list-ordering area of its own (one component; the implementer names it and records it in `.sdd/modules/modules.md` and a spec under `.sdd/modules/<it>/specs/`) | The one comparison rule, domain-agnostic: it is given a name and an identity and returns an order, and knows nothing about Docker. A **name comparison** that is ascending, case-insensitive and reads runs of digits as numbers, naming an **explicit locale** so the result never depends on the host's settings. An **exact identity comparison** that separates what the name comparison calls equal. A **compose the two** helper, so that "by name, then by identity" is one call and cannot be half-applied. And a **named-first / unnamed-group-last** helper (unnamed rows after all named ones, newest first by creation time, then identity), so volumes and images express that shape once between them rather than twice. Cheap enough to run on every list read of a few thousand rows. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-7 | — |
| INT-2 | create | server unit test tree, beside the new area | The rule's own unit file. It must carry, at minimum: `app-2` before `app-10` (REQ-3); `Redis` beside `redis-cache` rather than in a separate alphabet (REQ-2); a pair differing **only in case** and a pair differing **only in leading zeros**, each of which ties under the name comparison and is separated by the identity comparison (REQ-5); and for every tie case, **the same two objects supplied in both possible input orders, asserted to come out in the same order** (REQ-6). Also the unnamed-group shape: named before unnamed, newest first inside the group, identity last. And a case pinning locale independence: the comparison of a fixed pair is asserted against a stated expected result rather than against whatever the host would produce. | REQ-2, REQ-3, REQ-4, REQ-5, REQ-6 | INT-1 |
| INT-3 | create | server unit test tree | A conformance guard for REQ-1, in the shape the project already uses for the UI boundary (`client/scripts/check-ui-conformance.mjs`): it fails when a name comparison is written anywhere in `server/src/` outside the new area. The allow-list is **explicit and small**, and every entry on it is a comparison whose order carries meaning rather than a name comparison: the path-ordered outputs of `image-analysis` (`image-diff-service.ts`, `filesystem-extraction-service.ts`, `secret-pattern-scan.ts`), the size-ranked findings (`layer-duplicate-detection.ts`, `layer-waste-analysis.ts`) and the timestamp-ordered task history in `swarm-services-service.ts`. Without this guard REQ-1 is true on the day it is written and decays silently afterwards. | REQ-1 | INT-1 |

## Done when

- The three interventions are in place and the two new test files pass, run narrowed:
  from `server/`, `node --experimental-test-module-mocks --import tsx --test-reporter=dot --test test/unit/<file>.test.ts`.
- `npm run test:typecheck -w server` passes.
- **No service consumes the rule yet** and no file under `client/src/` is touched: the product
  behaves exactly as before. That is what an enabling batch looks like.
- Batch-scoped runs only. The full unit suite and the e2e suite are not this batch's business.
