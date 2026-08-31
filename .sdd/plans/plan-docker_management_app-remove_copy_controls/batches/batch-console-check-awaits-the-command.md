---
batch: console-check-awaits-the-command
feature: The raw-console check drives the console by its contract
closed_req: REQ-36, REQ-37, REQ-38, REQ-39, REQ-40, REQ-41, REQ-42
depends: —
---

# Batch — the raw-console check drives the console by its contract

The requirements are in `../requirements.md` and are cited here by id.

**This batch changes no product source.** Nothing under `client/src/` or `server/src/` moves, no
component spec changes and no index changes. It corrects one check and removes one debt entry. A
batch that touched `ConsoleSurface` here would be changing a certified contract to make a check
pass.

## What is wrong with the check

`client/e2e/copy-affordance-absence.spec.ts:725` — *"raw console: no transcript entry offers a copy,
and every one keeps its Re-run and its status"*. `expect(entries).toHaveCount(2)` receives 1, times
out at 30 s and takes the test's budget with it.

The case types two commands one after the other and waits for neither:

```ts
for (const suffix of ['first', 'second']) {
  await prompt.fill(`docker ps --filter label=${marker}-${suffix}`);
  await prompt.press('Enter');
}
```

| Claim | Who guarantees it | Observable |
|-------|-------------------|------------|
| the first command produces a transcript entry that ends | **the product**, and it is `plan-docker_management_app/REQ-100` | the entry's own status badge, `exit 0` |
| a second `Enter` is accepted while the first command runs | **nobody**, and the contract says the opposite | the second command's text, still on the prompt line |

`.sdd/modules/ui-library/specs/console-surface.md:58` — "`Enter` in the prompt → calls `onSubmit`;
**does nothing when `busy`** or when the value is blank". So the second submission is dropped on
purpose. On an idle machine the first `docker ps` finishes before the second `Enter` arrives and the
case passes; with the whole file running the daemon is loaded, the first command is still in flight,
and the case fails. It passed 2 of 2 alone and failed 2 of 2 in its file, on 2026-08-28.

The busy state is not hidden while this happens: the running entry shows a pending indicator, a
`Cancel` control appears, and the typed text stays in the prompt.

## The correction

Send the second command after the first one has ended. That is the contract's own precondition, so
the corrected case is deterministic: it no longer depends on how fast the daemon answers.

**The condition to wait for is the first entry's final status.** `console-surface.md` says an entry
shows a pending indicator while it is running and its status badge once it is not, so the badge is
the observable end of the busy state. It is what the sibling checks already wait for, and it costs
the case nothing it was not already paying — the same status is asserted at the end today.

**This is not a wait added to cover a race** (REQ-38). A retry, a fixed delay or a longer budget
would leave the case sending a command the product refuses, and would hide the refusal instead of
respecting it. What changes is the order of two actions the case already performs.

**Nothing the case asserts moves** (REQ-37). Two entries, every entry, the action group holding
`Re-run` and nothing else, a badge beside it, and no clipboard write on the screen. The reason the
case exists is that a check on the first entry alone says nothing about the others.

## The other console checks were read, and none of them makes the same bet

Every check that submits to the raw console waits for the previous command's status before sending
the next one. The failing case is the only one that does not.

| Check | What it does |
|-------|--------------|
| `client/e2e/raw-console.spec.ts` | one `submit` per case, and the two cases that send twice wait for the first entry's status first (`:158`–`:167`, `:322`–`:324`) |
| `client/e2e/raw-console-payload.spec.ts:413` | the closest cousin of the failing case — three commands, every entry asserted — and it waits for `exit 0` inside the loop |
| `client/e2e/raw-console-swarm.spec.ts` | one `submit` per case |
| `client/e2e/exclusive/raw-console-destructive.spec.ts` | one `submit`, then the confirmation dialog |
| `client/e2e/copy-affordance-geometry.spec.ts:305` | one `submit`, then the entry's status |
| `client/test/unit/console-surface.test.tsx:222`, `:144` | assert the inert behaviour rather than bet against it: `Enter` while `busy` calls nothing, and `Re-run` is disabled |
| `client/test/unit/raw-console-screen.test.tsx` | one command per case |

`client/e2e/container-exec-attach.spec.ts` sends keystrokes to an interactive session, where
`use-container-session.md` declares `send` a no-op while the channel is not open. It waits for the
shell prompt and then for the echo of what it typed, which is the same discipline this batch is
applying. INT-4 reads the two trees again rather than trusting this table.

## The question this batch does not answer

The product ignores the submission **in silence**. The operator presses `Enter` and sees no reply to
that keypress. It can be argued that this is rude.

**No product change is planned here.** The behaviour is certified, deliberate, and the busy state is
already visible — the pending indicator and the `Cancel` control. Changing it is a cycle of its own,
with its own analysis. The planner's opinion goes to the human in the report, and an opinion asked
for is not a work order ([[an-opinion-asked-for-is-not-a-work-order]]).

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `client/e2e/copy-affordance-absence.spec.ts`, the raw-console case at line 725 | Submit the first command, wait for its own entry to carry its final status, then submit the second. Each entry is found by its command text, not by its position. | REQ-36, REQ-38, REQ-42 | — |
| INT-2 | modify | the comment above the same case | State that `console-surface.md` declares `Enter` inert while busy, so the order is the contract's precondition. State that no retry, delay or wider budget may be added here. | REQ-36, REQ-38 | INT-1 |
| INT-3 | modify | the same case, its assertions | Keep them as they are: two entries, every entry, the action group holding `Re-run` alone, its badge, and no clipboard write. Nothing is added, removed or relaxed. | REQ-37, REQ-42 | INT-1 |
| INT-4 | modify | `client/e2e/` and `client/test/`, every check that drives the console | Read each against the contract: none may submit while a command is running. Correct any that does. Planning found none besides INT-1's. | REQ-40, REQ-42 | — |
| INT-5 | modify | `.sdd/tech-debt/` | Delete `entries/raw-console-second-entry-order-dependent.md` and its row in `index.md`, and correct the provenance paragraph that counts and names it. No other entry moves. | REQ-41, REQ-42 | INT-1, INT-3 |

## How the batch is certified

**A green run of the case alone certifies nothing**: it always passed alone. The two arrangements the
debt entry measured are both run.

- The whole file, `client/e2e/copy-affordance-absence.spec.ts`, three times in a row. It failed 2 of
  2 there.
- The case alone, twice. It passed 2 of 2 there, and must still.
- The corrected case run red on purpose once (INT-3's verification), then the source restored and
  both trees stated clean ([[a-neutralisation-is-undone-before-delivery]]).

Runs are batch-scoped. The full suites are the human's, and only one Playwright process runs at a
time ([[one-playwright-process-at-a-time]]).

## Human acceptance

### Scenario: The console check passes wherever it is run

- REQ → REQ-36, REQ-37, REQ-38
- Given → the check failed whenever its own file ran, because it typed the second command while the first was still running
- When → the check drives the raw console, sending the second command after the first entry shows its status
- Then → it passes with the whole file and on its own, on every run, and it waits for nothing but the first command's result

### Scenario: A copy affordance that comes back is still caught

- REQ → REQ-37, REQ-39
- Given → a build where a transcript entry offers a control again beside its `Re-run`
- When → the check is run
- Then → it fails, naming the entry and what its action group holds

### Scenario: No other check bets against an inert control

- REQ → REQ-40
- Given → the other checks that drive the raw console, in `client/e2e` and `client/test`
- When → each is read against the console's contract
- Then → none of them submits a command while another is running, and the reading is reported with the files named

### Scenario: The register holds only what is still open

- REQ → REQ-41
- Given → the register carries `raw-console-second-entry-order-dependent` as open debt
- When → the human opens `.sdd/tech-debt/index.md` after this batch
- Then → neither the row nor the entry file is there, and no sentence of the register still counts or names it

### Scenario: The console the operator uses is the one it was

- REQ → REQ-42
- Given → the raw console, with a command running
- When → the operator types a second command and presses `Enter`
- Then → the console behaves exactly as before this batch: the typed line stays in the prompt, and the running entry keeps its pending indicator and its `Cancel`
