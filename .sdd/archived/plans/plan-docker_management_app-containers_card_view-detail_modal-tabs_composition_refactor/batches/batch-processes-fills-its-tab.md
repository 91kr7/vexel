---
batch: processes-fills-its-tab
feature: F6 — The process table takes the height it is offered
closed_req: [REQ-32, REQ-33]
depends: [stable-detail-height]
---

# Batch — A 320px table stops sitting in an 860px dialog

`MAX_TABLE_HEIGHT = '320px'` was a right measure inside an inline panel that divided a row of the
grid. Inside the large dialog it leaves half the surface empty under the table and goes on scrolling
the process list through a little window. It is a leftover of the move, not a design decision, and
nothing revisited it when the panel moved.

**It cannot be done before `stable-detail-height`**, and that is the mock's own argument for doing
F0 first: the table cannot take the available height while the available height is whatever the
table takes.

**`fill` is the library's existing name for this**, carried by `TreeView` since
`plan-docker_management_app-filesystem_browser_layout` — bounded by the region it is placed in, the
window measured from the scroll container itself so virtualisation keeps working and follows the
container as it follows the screen. `DataTable` takes the same opt-in rather than a second idiom, and
the delivered `maxHeight` path is preserved exactly for every other caller.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/data/DataTable.tsx` | The table gains the `fill` opt-in `TreeView` already carries: its bound comes from the region it is placed in rather than from a stated `maxHeight`, virtualisation preserved and measured from the scroll container, the sticky column header still sharing one scrolling box with the rows. A caller that does not ask for it keeps the delivered `maxHeight` path exactly, `autoRowHeight` included. | REQ-32 | — |
| INT-2 | modify | `client/src/containers/ContainerProcessesView.tsx` | The table asks for that fill, and the `MAX_TABLE_HEIGHT` constant leaves the file — no length is stated in feature code at all. The header row (process count, refresh) stays a band above it, and the table takes what is left. | REQ-32 | INT-1 |
| INT-3 | modify | `client/src/containers/ContainerProcessesView.tsx` | A `%CPU` reading above the threshold is drawn distinguished in its column, the threshold and its tone taken from the library's tokens. The `–` shown where the daemon reports no reading is unchanged, and no other column is toned. | REQ-33 | — |
| INT-4 | modify | `client/e2e/container-stats-processes.spec.ts`, `client/test/unit/container-processes-view.test.tsx` | The check that pinned the table at its fixed height is rewritten as the opposite property — the table measures differently at two viewport heights, and leaves no band of empty surface beneath it — rather than deleted; a check asserts that a `%CPU` above the threshold is distinguished from one below it, and that the listing is still read once and only re-read on an explicit refresh. | REQ-41, REQ-43, REQ-44, REQ-45 | INT-2, INT-3 |

**Standing constraints on every intervention above** — REQ-38, REQ-39, REQ-40, REQ-41, REQ-42. They
are closed in the plan's last batch and honoured in this one.

## Human acceptance

### Scenario: the process list uses the room the dialog gives it

- REQ → REQ-32
- Given → a running container with many processes, its detail open on Processes
- When → the operator looks at the tab
- Then → the table reaches down to the bottom of the dialog, with no empty band beneath it, and the
  rows scroll inside the table rather than in a window a third of its height

### Scenario: the consuming process is found without reading every row

- REQ → REQ-33
- Given → a container where one process is using noticeably more CPU than the others
- When → the operator looks at the `%CPU` column
- Then → that row's reading is distinguished from the others, and the rows below the threshold are
  not
