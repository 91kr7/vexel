---
module: containers
component: ContainerLogsView
type: UI component
---

# ContainerLogsView

**Purpose** → the logs surface of a container: stream selection and filters above a live-tailing
log region, with in-surface search, highlighted matches and download of the buffer.

## Contract

Description:

- `<ContainerLogsView container />` — `container` is the `ContainerSummary` whose logs are shown.
- **Two** control rows above the log region, and no more:
  - the first states what the daemon is asked for — stream selection, timestamps, tail size,
    since/until;
  - the second is the log region's own action row, holding the search box with its match count and
    previous/next at the start and `Download` at its end.
- The delivered arrangement was **three** stacked rows, the third holding `Download` alone,
  right-aligned (`plan-ui-coherence-optimisation/REQ-62`). The search moved onto the region's action
  row rather than the download moving up into a filter row: the search acts on what the region is
  showing, and the download takes what the region is holding, so the row they share is the region's.
- No row holds a single button. Nothing about which lines are streamed, buffered, rendered or
  downloaded follows from this: it is an arrangement, and the controls are the delivered ones.
- The log region asks the library for its **fill** mode (`log-stream.md`) instead of a stated
  maximum: its bound is the region this view is placed in, and it states no length of its own.
  Nothing about which lines are streamed, buffered, rendered or downloaded follows from that either.

Shows:

- the container's log lines as they arrive, tagged stdout/stderr, timestamps shown only when the
  timestamps control is on.
- the search matches highlighted, with the current match emphasized and brought into view.
- a failure banner carrying the stream error message verbatim, with a retry, when the stream fails.
- a muted "Stream ended." indication when the daemon closed the output while lines had been
  received; when no line was ever received, the empty state says so instead.

Actions:

- stream selection (stdout / stderr) → reopens the stream with the selected streams; the last
  selected stream cannot be turned off.
- "Timestamps" → shows/hides the timestamp column; the stream is reopened so that timestamps are
  actually requested from the daemon.
- tail size → reopens the stream reading that many trailing lines.
- since/until → reopens the stream bounded to that range.
- follow / "Jump to live" → follows the tail, or stops following when the operator scrolls up.
- search → highlights every match; next/previous move the current match; the match count is shown.
- "Download" → saves the buffered log as `<container name>-logs.txt`. It is the only way to take
  the buffer off this surface: the region is virtualised, so a hand-selection captures the rendered
  window and never the buffer (`plan-docker_management_app-remove_copy_controls`/REQ-20, which
  records that as an accepted cost).
- retry on the failure banner → reopens the stream.

## Rules and invariants

- Changing any control resets the buffer, since the daemon is re-queried from scratch.
- Only the buffered lines are copied, downloaded and searched — never the container's full history
  on the daemon.
- `Download` delivers the **whole** buffer, not the rendered window: the region is virtualised, and
  which of its rows happen to be mounted is not a property of the file (`log-stream.md`).
- The log region takes the height left by the two control rows, and the lines scroll inside it: the
  control rows stay put however long the stream grows, and the stream never stretches whatever holds
  this view.
- Every control is where the operator can reach it: each is hit-testable at the centre of its own
  visible box, and none of them is behind another (`plan-ui-coherence-optimisation/REQ-62`).

## Dependencies

- useContainerLogs
- ui-library: LogStream (its `toolbar` slot and its `fill` mode), SegmentedControl, TailSizeSelector, TimeRangeField,
  StreamSearchField, Toggle, Row, Stack, MetaCell, ErrorBanner

## Requirements served

- plan-docker_management_app/REQ-30
- plan-docker_management_app/REQ-31
- plan-ui-coherence-optimisation/REQ-62
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-3
