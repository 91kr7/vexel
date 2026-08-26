---
module: containers
component: ContainerLogsView
type: UI component
---

# ContainerLogsView

**Purpose** → the logs surface of a container: the controls in two labelled groups above a
live-tailing log region whose lines say what they are, with in-surface search, highlighted matches
and download of the buffer.

## Contract

Description:

- `<ContainerLogsView container />` — `container` is the `ContainerSummary` whose logs are shown.
- The controls form **two labelled groups**, on the log region's own action row:
  - `Fetch` — what the daemon is asked for, every one of which reopens the stream: the stream
    selection, the tail size, the since/until range;
  - `Read` — how what has arrived is read: the search box with its match count and previous/next,
    the timestamps control, and `Download`.
- **Where a control sits says what changing it does**, and that is the whole point of the two
  groups: `Fetch` empties the buffer and re-queries, `Read` acts on what is already there. The
  timestamps control belongs to `Read` because that is what it means to the operator — the fact that
  the daemon has to be re-asked to send them is this view's business, not the operator's, and it is
  unchanged.
- The delivered arrangement was **three** stacked rows, the third holding `Download` alone,
  right-aligned (`plan-ui-coherence-optimisation/REQ-62`), then **two** — the daemon filters, then
  the region's own row with the search and `Download`. The two groups are those same controls
  regrouped by what they do, on the region's one action row: that requirement is **refined, not
  superseded** — it forbade a row holding the download alone, and there is still no such row.
- No row holds a single button. Nothing about which lines are streamed, buffered, rendered or
  downloaded follows from any of this: it is an arrangement, and the controls are the delivered
  ones.
- The log region asks the library for its **fill** mode (`log-stream.md`) instead of a stated
  maximum: its bound is the region this view is placed in, and it states no length of its own.
  Nothing about which lines are streamed, buffered, rendered or downloaded follows from that either.

Shows:

- the container's log lines as they arrive, tagged stdout/stderr, timestamps shown only when the
  timestamps control is on.
- each line distinguished by the level its own text states, read by `log-level.md` — the error lines
  in the danger tone, the warned ones in the warning tone. **A line stating no recognised marker is
  left neutral**, which is the reading being conservative and not a gap in it.
- a line's own text exactly as the container wrote it, whatever distinguishes it: nothing is
  prefixed, trimmed or rewritten, and the search goes on finding and marking its matches over the
  colouring.
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

- Changing a `Fetch` control resets the buffer, since the daemon is re-queried from scratch; so does
  the timestamps control, for the same reason and although it is a `Read` one.
- **The two groups wrap as whole blocks**: at every width the break falls between them and never
  inside one, and no control is separated from the group it belongs to. A group breaks internally
  only where it alone is wider than the row — the narrow viewport, where wrapping beats overflowing.
- **The level is deduced from the line's text and from nothing else** (`log-level.md`), and the
  stream a line came from is a separate distinction the library draws on a channel of its own: a
  stderr line stays told from a stdout line whether or not it states a level, and an error line on
  stdout is not mistaken for a stderr one.
- Only the buffered lines are copied, downloaded and searched — never the container's full history
  on the daemon.
- `Download` delivers the **whole** buffer, not the rendered window: the region is virtualised, and
  which of its rows happen to be mounted is not a property of the file (`log-stream.md`).
- The log region takes the height left by the control row above it, and the lines scroll inside it:
  the row stays put however long the stream grows, and the stream never stretches whatever holds
  this view.
- Every control is where the operator can reach it: each is hit-testable at the centre of its own
  visible box, and none of them is behind another (`plan-ui-coherence-optimisation/REQ-62`).

## Dependencies

- useContainerLogs
- Log level reading (`log-level.md`)
- ui-library: LogStream (its `toolbar` slot in the composer form, and its `fill` mode), ControlGroup,
  SegmentedControl, TailSizeSelector, TimeRangeField, StreamSearchField, Toggle, Stack, MetaCell,
  ErrorBanner

## Requirements served

- plan-docker_management_app/REQ-30
- plan-docker_management_app/REQ-31
- plan-ui-coherence-optimisation/REQ-62
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-3
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-27
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-28
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-29
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-30
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-31
