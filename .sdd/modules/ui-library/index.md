# ui-library — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Design tokens | configuration | `client/src/ui/tokens.css` | Color, typography, spacing, radii, border, elevation and z-index custom properties; single source of truth for every visual value | `specs/design-tokens.md` |
| Foundation stylesheet | configuration | `client/src/ui/foundation.css` | The library's single style entry point: imports tokens, applies the base reset | `specs/foundation-stylesheet.md` |
| Backdrop | UI component | `client/src/ui/background/Backdrop.tsx` | Fixed, full-viewport layer rendering the static pre-blurred background asset | `specs/backdrop.md` |
| Surface | UI component | `client/src/ui/glass/Surface.tsx` | Base glass panel with elevation variants, built from translucency and borders | `specs/surface.md` |
| Card | UI component | `client/src/ui/glass/Card.tsx` | Padded glass Surface with an optional eyebrow title | `specs/card.md` |
| SectionHeader | UI component | `client/src/ui/glass/SectionHeader.tsx` | Title, one-line description and a trailing actions slot for a content section | `specs/section-header.md` |
| Divider | UI component | `client/src/ui/glass/Divider.tsx` | Hairline separator, horizontal or vertical | `specs/divider.md` |
| ScrollArea | UI component | `client/src/ui/glass/ScrollArea.tsx` | Scrollable region with a styled scrollbar | `specs/scroll-area.md` |
| CollapsibleSection | UI component | `client/src/ui/glass/CollapsibleSection.tsx` | Titled section of a detail surface that expands/collapses its content | `specs/collapsible-section.md` |
| DetailPanel | UI component | `client/src/ui/glass/DetailPanel.tsx` | Detail surface for a selected object: header with title/subtitle, trailing actions and a close control, and a body | `specs/detail-panel.md` |
| Frame | UI component | `client/src/ui/layout/Frame.tsx` | Application frame: rail / header / content / footer as floating glass panels over the Backdrop; owns the responsive breakpoints and the phone off-canvas rail drawer | `specs/frame.md` |
| Stack | UI component | `client/src/ui/layout/Stack.tsx` | Vertical flex layout primitive | `specs/layout-primitives.md` |
| Row | UI component | `client/src/ui/layout/Row.tsx` | Horizontal flex layout primitive with alignment helpers | `specs/layout-primitives.md` |
| Grid | UI component | `client/src/ui/layout/Grid.tsx` | CSS-grid layout primitive | `specs/layout-primitives.md` |
| Spacer | UI component | `client/src/ui/layout/Spacer.tsx` | Flexible spacer for Row/Stack siblings | `specs/layout-primitives.md` |
| SplitPane | UI component | `client/src/ui/layout/SplitPane.tsx` | Two-pane surface — a fixed-width side next to a flexible one, divided by a hairline — for a tree/list next to its detail view | `specs/split-pane.md` |
| NavRail, NavBrand | UI component | `client/src/ui/navigation/NavRail.tsx` | Persistent left navigation rail and its brand mark | `specs/navigation-primitives.md` |
| NavGroup | UI component | `client/src/ui/navigation/NavGroup.tsx` | Labeled group of navigation entries | `specs/navigation-primitives.md` |
| NavItem | UI component | `client/src/ui/navigation/NavItem.tsx` | Single navigation entry: glyph, label, active state, count badge | `specs/navigation-primitives.md` |
| FooterStatus | UI component | `client/src/ui/navigation/FooterStatus.tsx` | Footer status block (e.g. active Docker context) | `specs/navigation-primitives.md` |
| PageHeader | UI component | `client/src/ui/controls/PageHeader.tsx` | Screen header: title, description, trailing actions | `specs/page-header.md` |
| StatusPill | UI component | `client/src/ui/controls/StatusPill.tsx` | Dot + label status indicator, with an optional inline action (e.g. retry) | `specs/status-pill.md` |
| Button | UI component | `client/src/ui/controls/Button.tsx` | Button with primary/secondary/ghost/destructive variants | `specs/button.md` |
| IconButton | UI component | `client/src/ui/controls/IconButton.tsx` | Square icon-only button with a required accessible label | `specs/icon-button.md` |
| Badge | UI component | `client/src/ui/controls/Badge.tsx` | Small tag/count/status label, optionally clickable as a selection action | `specs/badge.md` |
| KeyHint | UI component | `client/src/ui/controls/KeyHint.tsx` | Keyboard-shortcut hint | `specs/key-hint.md` |
| PathInput | UI component | `client/src/ui/controls/PathInput.tsx` | Host-path text field with a validation state, refusal message and browse hint | `specs/path-input.md` |
| StorageUsageRow | UI component | `client/src/ui/controls/StorageUsageRow.tsx` | Label/description/size row with an optional clear action | `specs/storage-usage-row.md` |
| TextField, SearchField | UI component | `client/src/ui/controls/TextField.tsx`, `client/src/ui/controls/SearchField.tsx` | Single-line text input, and its full-width search/filter variant | `specs/search-field.md` |
| FilterChips | UI component | `client/src/ui/controls/FilterChips.tsx` | Single-select row of filter chips | `specs/filter-chips.md` |
| ActionButtonGroup | UI component | `client/src/ui/controls/ActionButtonGroup.tsx` | Inline group of dense row-action buttons, with a destructive variant | `specs/action-button-group.md` |
| BulkActionBar | UI component | `client/src/ui/controls/BulkActionBar.tsx` | Bar shown above a list once rows are multi-selected: selection count, bulk actions, clear | `specs/bulk-action-bar.md` |
| FilePicker | UI component | `client/src/ui/controls/FilePicker.tsx` | Picks a file from the operator's own machine to upload, showing its chosen name and size | `specs/file-picker.md` |
| ScreenToolbar | UI component | `client/src/ui/controls/ScreenToolbar.tsx` | Screen action bar: leading primary action, secondary actions, trailing destructive action, optional filters row | `specs/screen-toolbar.md` |
| Tabs | UI component | `client/src/ui/controls/Tabs.tsx` | Single-select row of tabs switching a detail surface's active content panel | `specs/tabs.md` |
| CopyButton | UI component | `client/src/ui/controls/CopyButton.tsx` | Copies an exact value to the clipboard, with a transient "Copied" confirmation | `specs/copy-button.md` |
| NumberField | UI component | `client/src/ui/controls/NumberField.tsx` | Single-line numeric form input | `specs/number-field.md` |
| Stepper | UI component | `client/src/ui/controls/Stepper.tsx` | Decrement / value / increment control for a small bounded integer (e.g. a service's replica count) | `specs/stepper.md` |
| Select | UI component | `client/src/ui/controls/Select.tsx` | Single-choice dropdown | `specs/select.md` |
| Toggle | UI component | `client/src/ui/controls/Toggle.tsx` | Boolean on/off switch | `specs/toggle.md` |
| FieldMessage | UI component | `client/src/ui/controls/FieldMessage.tsx` | Field-level helper or validation message | `specs/field-message.md` |
| EndpointField | UI component | `client/src/ui/controls/EndpointField.tsx` | Endpoint form group: the endpoint kind and the single host value that kind needs, or the fixed host it uses | `specs/endpoint-field.md` |
| KeyValueEditor | UI component | `client/src/ui/controls/KeyValueEditor.tsx` | Repeatable key/value row editor (e.g. environment variables) | `specs/key-value-editor.md` |
| RepeatableRowList | UI component | `client/src/ui/controls/RepeatableRowList.tsx` | Generic repeatable list of custom-rendered rows with add/remove (e.g. ports, mounts) | `specs/repeatable-row-list.md` |
| FormFooter | UI component | `client/src/ui/controls/FormFooter.tsx` | Save/cancel form footer with a dirty indicator | `specs/form-footer.md` |
| FormField | UI component | `client/src/ui/controls/FormField.tsx` | Labelled form control with a hint line replaced by the validation message when invalid | `specs/form-field.md` |
| FormSection | UI component | `client/src/ui/controls/FormSection.tsx` | One titled group of fields inside a long, sectioned form | `specs/form-section.md` |
| Combobox | UI component | `client/src/ui/controls/Combobox.tsx` | Text input suggesting known (possibly asynchronously loaded) options while accepting any free text | `specs/combobox.md` |
| ChipInput | UI component | `client/src/ui/controls/ChipInput.tsx` | Free-form list of short values, each entered value becoming a removable chip | `specs/chip-input.md` |
| Chip, ChipGroup | UI component | `client/src/ui/controls/Chip.tsx` | Label chip with an optional inline secondary action, and a row of such chips with an optional trailing "add" affordance | `specs/chip.md` |
| CrossReference, CrossReferenceList | UI component | `client/src/ui/controls/CrossReference.tsx` | Reference leading to another object, with an "unavailable, because…" variant carrying the reason in its place, and a wrapping row of such references | `specs/cross-reference.md` |
| SegmentedControl | UI component | `client/src/ui/controls/SegmentedControl.tsx` | Row of joined segments selecting one or several options, never emptied | `specs/segmented-control.md` |
| TailSizeSelector | UI component | `client/src/ui/controls/TailSizeSelector.tsx` | Picks how many trailing lines of a stream to load, or all of them | `specs/tail-size-selector.md` |
| TimeRangeField | UI component | `client/src/ui/controls/TimeRangeField.tsx` | Since/until pair of inputs bounding a stream in time | `specs/time-range-field.md` |
| StreamSearchField | UI component | `client/src/ui/controls/StreamSearchField.tsx` | In-surface stream search box with match count and next/previous | `specs/stream-search-field.md` |
| DataTable | UI component | `client/src/ui/data/DataTable.tsx` | Dense, column-defined table with hover/selected row states, virtualised scrolling, and an optional per-row expansion slot | `specs/data-table.md` |
| CardList | UI component | `client/src/ui/data/CardList.tsx` | Full-width card rows (title, monospace subtitle, trailing badge group and meta values), selectable, with an optional expanded content slot inside the same card and an active-selection row variant (active marker plus a "use" action) | `specs/card-list.md` |
| GroupedRowsPanel | UI component | `client/src/ui/data/GroupedRowsPanel.tsx` | One card per group with a header (status, title, subtitle, actions) over its indented child rows (status, title, muted subtitle, trailing control) | `specs/grouped-rows-panel.md` |
| TreeView | UI component | `client/src/ui/data/TreeView.tsx` | Virtualised, expandable/collapsible tree with entry-type glyphs, single selection, keyboard navigation, a lazily loaded subtree contract and an optional per-node status accent | `specs/tree-view.md` |
| DiffTreeView | UI component | `client/src/ui/data/DiffTreeView.tsx` | Diff variant of TreeView: added/removed/changed node status, directory roll-up counts and a status filter row | `specs/diff-tree-view.md` |
| StatusDotCell, TwoLineCell, MetaCell, IdentifierCell, BadgeListCell, ProportionBarCell | UI component | `client/src/ui/data/TableCells.tsx` | Reusable DataTable cell contents: status dot, title/subtitle pair, muted monospace value (with an "unavailable" state), truncated identifier, badge list with overflow indicator, magnitude-proportional bar | `specs/table-cells.md` |
| DefinitionList | UI component | `client/src/ui/data/DefinitionList.tsx` | Label → value rows with an optional copy affordance | `specs/definition-list.md` |
| CodeViewer | UI component | `client/src/ui/data/CodeViewer.tsx` | Read-only monospace code/JSON block with a copy affordance | `specs/code-viewer.md` |
| CodeEditor | UI component | `client/src/ui/data/CodeEditor.tsx` | Editable monospace code surface with a line-number gutter, dirty state and a validation status-line slot | `specs/code-editor.md` |
| TextViewer, HexDumpViewer | UI component | `client/src/ui/data/ContentViewer.tsx` | Read-only monospace text preview with line numbers, and a hex-dump preview, each with a truncation notice for an oversized file and an optional shared-scroll hookup | `specs/content-viewer.md` |
| SideBySideViewer | UI component | `client/src/ui/data/SideBySideViewer.tsx` | Pairs two content viewers under per-side headers with a shared scroll position | `specs/side-by-side-viewer.md` |
| LogStream | UI component | `client/src/ui/data/LogStream.tsx` | Virtualised monospace log surface: follow/jump-to-live, timestamps, stdout/stderr tagging, match highlighting, copy/download | `specs/log-stream.md` |
| MetricTile | UI component | `client/src/ui/metrics/MetricTile.tsx` | Metric reading: label, prominent value, sub-label and a slot for a meter/sparkline | `specs/metric-primitives.md` |
| Meter | UI component | `client/src/ui/metrics/Meter.tsx` | Proportional bar for a used/limit pair, with its reading | `specs/metric-primitives.md` |
| Sparkline | UI component | `client/src/ui/metrics/Sparkline.tsx` | Compact line over a bounded window of recent samples, redrawn only on new samples | `specs/metric-primitives.md` |
| Modal | UI component | `client/src/ui/feedback/Modal.tsx` | Centered glass dialog over a dimmed overlay | `specs/modal.md` |
| ConfirmDialog | UI component | `client/src/ui/feedback/ConfirmDialog.tsx` | Destructive-confirmation dialog naming the target and the consequence | `specs/confirm-dialog.md` |
| ToastProvider, useToast | UI component | `client/src/ui/feedback/Toast.tsx` | Transient toast notification stack and its provider/hook | `specs/toast.md` |
| ErrorBanner | UI component | `client/src/ui/feedback/ErrorBanner.tsx` | Inline failure banner showing the upstream error message verbatim, with an optional retry action | `specs/error-banner.md` |
| Callout | UI component | `client/src/ui/feedback/Callout.tsx` | Persistent, non-dismissible explanatory banner (e.g. a heuristic-signal disclaimer) | `specs/callout.md` |
| ProgressBar | UI component | `client/src/ui/feedback/ProgressBar.tsx` | Determinate or indeterminate progress indicator | `specs/progress-bar.md` |
| StepProgressList | UI component | `client/src/ui/feedback/StepProgressList.tsx` | One row per unit of work (e.g. an image layer transfer), each with its own progress and terminal state | `specs/step-progress-list.md` |
| TransferProgressDialog | UI component | `client/src/ui/feedback/TransferProgressDialog.tsx` | Dialog for a long-running byte transfer: byte progress bar, cancel while active, close once ended | `specs/transfer-progress-dialog.md` |
| FormDialog | UI component | `client/src/ui/feedback/FormDialog.tsx` | Dialog shell for a short create/pull/tag form: description, body slot, cancel/submit footer | `specs/form-dialog.md` |
| FormSheet | UI component | `client/src/ui/feedback/FormSheet.tsx` | Dialog surface for a long, sectioned form: pinned banner slot, scrolling body of sections, footer holding cancel plus several commit choices | `specs/form-sheet.md` |
| Spinner | UI component | `client/src/ui/feedback/Spinner.tsx` | Small rotating pending indicator | `specs/spinner.md` |
| EmptyState | UI component | `client/src/ui/feedback/EmptyState.tsx` | Placeholder for a screen or list with nothing to display | `specs/empty-state.md` |
| EventStream | UI component | `client/src/ui/feedback/EventStream.tsx` | Monospace, timestamped daemon event list with type/action emphasis | `specs/event-stream.md` |
| Terminal | UI component | `client/src/ui/terminal/Terminal.tsx` | Interactive terminal surface wrapping the xterm.js emulator (documented `CLAUDE.md` escape hatch); typed write/focus/dispose handle and input/resize callbacks | `specs/terminal.md` |
| SessionHeader, SessionEndedOverlay, SessionSurface | UI component | `client/src/ui/terminal/SessionChrome.tsx` | Session header with connection state and disconnect/detach action, session-ended overlay, and the surface that positions one over the other | `specs/session-chrome.md` |
| triggerDownload | UI utility | `client/src/ui/utils/trigger-download.ts` | Triggers a native browser download of a URL via a transient, invisible anchor, so the app never reads or buffers the response body | `specs/trigger-download.md` |
| UI library entry point | module entry | `client/src/ui/index.ts` | Re-exports every UI-library component; the only import path feature code uses | `specs/library-entry-point.md` |
