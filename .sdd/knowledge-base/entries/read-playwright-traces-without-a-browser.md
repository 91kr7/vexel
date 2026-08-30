---
id: read-playwright-traces-without-a-browser
kind: how-to
scope: test
date: 2026-08-31
source: chat, the overnight repair mandate on the red e2e suite
---

# A failure's trace is read from the files, never with `show-trace`

**Rule** → Read a Playwright trace by opening its zip and reading the files inside. Do **not** run
`npx playwright show-trace`: it starts a second Playwright process. And read the trace of **every**
failure, the ones a new run produces included — "un fallimento senza la sua traccia letta è un
fallimento spiegato a indovinare".

**Why** → the human's instruction, given with the five traces of the interrupted run of 2026-08-31.
A trace says whether the action landed and what the page held at the moment of the failure; without
it the explanation is a guess, and two of the three menu failures of that run would have been read
as flakes.

**How to apply** →
- *test* → `error-context.md`, beside the trace: the error message and the page snapshot at the
  failure — it says whether the element looked for was there, and what stood in its place.
- *test* → `*.trace` inside `trace.zip`: one JSON object per line. The useful fields are `type`
  (`before` / `after`), `title` (e.g. `Click locator(...)`), `params.selector` and `startTime`. A
  `before` with no matching `after` is an action that never finished; a `before`/`after` pair that
  closed quickly is an action that landed, which is how "the click worked and the menu never came"
  is told apart from "the click never happened".
- *test* → `*.network`: the requests, to line an action up with what happened on the wire.
- *test* → the trace of an aborted run may have no `error-context.md` and still have its `.trace`.
  Read it anyway. See [[save-the-traces-before-the-next-run]].
