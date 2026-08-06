---
module: containers
component: ContainerLogsView
type: UI component
---

# ContainerLogsView

**Purpose** → the logs surface of a container: stream selection and filters above a live-tailing
log region, with in-surface search, highlighted matches and copy/download of the buffer.

## Contract

Description:

- `<ContainerLogsView container />` — `container` is the `ContainerSummary` whose logs are shown.
- a controls row (stream selection, timestamps, tail size, since/until, search) above the log
  region.

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
- "Copy" → copies the buffered log as text; "Download" → saves it as
  `<container name>-logs.txt`.
- retry on the failure banner → reopens the stream.

## Rules and invariants

- Changing any control resets the buffer, since the daemon is re-queried from scratch.
- Only the buffered lines are copied, downloaded and searched — never the container's full history
  on the daemon.

## Dependencies

- useContainerLogs
- ui-library: LogStream, SegmentedControl, TailSizeSelector, TimeRangeField, StreamSearchField,
  Toggle, Row, Stack, ErrorBanner, SectionHeader

## Requirements served

- plan-docker_management_app/REQ-30
- plan-docker_management_app/REQ-31
