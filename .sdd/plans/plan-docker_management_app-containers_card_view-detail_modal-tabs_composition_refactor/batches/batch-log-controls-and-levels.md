---
batch: log-controls-and-levels
feature: F5 — The log controls in two groups, and the lines distinguished
closed_req: [REQ-27, REQ-28, REQ-29, REQ-30, REQ-31]
depends: [stable-detail-height]
---

# Batch — Fetch on one side, Read on the other, and a line that says what it is

Four controls of different natures share one wrapping row. Two of them change **what is asked of the
daemon** — the streams, the tail size, the since/until range: each reopens the stream and empties the
buffer. Two change **only how what has arrived is read** — the timestamps, the search. In one row
they look interchangeable, and at intermediate widths the line break falls inside a group.

And the lines have no colour at all. An `ERR` and a `201` read alike, while finding the first error
is almost always why the logs were opened.

**The risk this batch carries is its own colouring.** A line containing `error` inside a URL read as
a failure is worse than no colour, because the first misleading line costs the trust in every other.
The deduction is conservative by requirement (REQ-29): recognised markers only, neutral otherwise,
and the line's own text unaltered and still searchable underneath it (REQ-31).

**stderr is already told from stdout** by `LogStream` and stays so; REQ-30 is a non-regression here,
not new work, and the level distinction must not swallow it.

**`plan-ui-coherence-optimisation/REQ-62` is refined, not broken.** It forbade a third stacked row
holding the download alone, and left two rows: the daemon filters, then the region's own action row
with the search and `Download`. The two groups are the same controls regrouped by what they do, and
the download belongs to `Read` — so the caller's controls and the download go on sharing one row,
which is exactly what REQ-62 asked for.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/data/LogStream.tsx` | A line may carry a level, and a line that carries one is drawn distinguished by it. The stderr / stdout distinction is unchanged and independent of it; the line's own text is rendered exactly as given, complete and selectable; the match highlighting still marks its occurrences over the colouring. The region still runs no animation and no blur, and the jump-to-live control keeps the only blur here. | REQ-29, REQ-30, REQ-31 | — |
| INT-2 | modify | `client/src/ui/data/LogStream.tsx` | The row above the region lets the caller present its controls as its own groups, the download among them, instead of fixing the download at the row's end. A caller that passes neither a toolbar nor a download still gets no row at all. | REQ-27, REQ-28 | — |
| INT-3 | create | client, containers feature area | The conservative reading of a log line's level from its text: recognised markers only, and no level at all where none is recognised. Domain reading and a deliberate guess, so it lives in the feature layer and never in the library. | REQ-29 | — |
| INT-4 | modify | `client/src/containers/ContainerLogsView.tsx` | The controls form two labelled groups — `Fetch` holding the streams, the tail size and the since/until range, `Read` holding the search, the timestamps and the download — each wrapping as a whole block so a break falls between them and never inside one. Every control keeps what it does, and every one stays hit-testable at the centre of its own visible box. The lines are handed the level the reading above returns. | REQ-27, REQ-28, REQ-29 | INT-2, INT-3 |
| INT-5 | modify | `client/e2e/container-logs.spec.ts`, `client/test/unit/container-logs-view.test.tsx` | The checks that locate a control on one of the two delivered rows are rewritten against the groups rather than deleted; a check drives the two groups at a narrowing width and asserts the break falls between them; a check asserts a line with no recognised marker is left neutral, and that a line's text is unchanged and still searchable under the colouring. The jump-to-live control is re-asserted as still blurring the lines beneath it inside the dialog. | REQ-39, REQ-43, REQ-44, REQ-45 | INT-1, INT-4 |

**Standing constraints on every intervention above** — REQ-38, REQ-39, REQ-40, REQ-41, REQ-42. They
are closed in the plan's last batch and honoured in this one.

## Human acceptance

### Scenario: the controls that reopen the stream are told from the ones that do not

- REQ → REQ-27
- Given → a running container's detail, open on Logs
- When → the operator looks at the controls above the lines
- Then → they read as two labelled groups: `Fetch`, holding the stream selection, the tail size and
  the time range, and `Read`, holding the search, the timestamps and the download

### Scenario: narrowing the dialog breaks the row between the groups

- REQ → REQ-28
- Given → the Logs tab with both groups on one line
- When → the surface is narrowed until the controls no longer fit on one line
- Then → the two groups go onto lines of their own, whole, and no control is left behind on the
  other group's line

### Scenario: the first error is findable without reading every line

- REQ → REQ-29, REQ-30, REQ-31
- Given → a container whose output holds an error line, an ordinary line and a line written to
  stderr
- When → the operator opens the Logs tab
- Then → the error line is distinguished by its level, the stderr line is distinguished as coming
  from stderr, the ordinary line is left neutral, and every line's text reads exactly as the
  container wrote it and is still found by the search
