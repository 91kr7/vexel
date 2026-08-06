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
| Frame | UI component | `client/src/ui/layout/Frame.tsx` | Application frame: rail / header / content / footer as floating glass panels over the Backdrop; owns the responsive breakpoints and the phone off-canvas rail drawer | `specs/frame.md` |
| Stack | UI component | `client/src/ui/layout/Stack.tsx` | Vertical flex layout primitive | `specs/layout-primitives.md` |
| Row | UI component | `client/src/ui/layout/Row.tsx` | Horizontal flex layout primitive with alignment helpers | `specs/layout-primitives.md` |
| Grid | UI component | `client/src/ui/layout/Grid.tsx` | CSS-grid layout primitive | `specs/layout-primitives.md` |
| Spacer | UI component | `client/src/ui/layout/Spacer.tsx` | Flexible spacer for Row/Stack siblings | `specs/layout-primitives.md` |
| NavRail, NavBrand | UI component | `client/src/ui/navigation/NavRail.tsx` | Persistent left navigation rail and its brand mark | `specs/navigation-primitives.md` |
| NavGroup | UI component | `client/src/ui/navigation/NavGroup.tsx` | Labeled group of navigation entries | `specs/navigation-primitives.md` |
| NavItem | UI component | `client/src/ui/navigation/NavItem.tsx` | Single navigation entry: glyph, label, active state, count badge | `specs/navigation-primitives.md` |
| FooterStatus | UI component | `client/src/ui/navigation/FooterStatus.tsx` | Footer status block (e.g. active Docker context) | `specs/navigation-primitives.md` |
| PageHeader | UI component | `client/src/ui/controls/PageHeader.tsx` | Screen header: title, description, trailing actions | `specs/page-header.md` |
| StatusPill | UI component | `client/src/ui/controls/StatusPill.tsx` | Dot + label status indicator, with an optional inline action (e.g. retry) | `specs/status-pill.md` |
| Button | UI component | `client/src/ui/controls/Button.tsx` | Button with primary/secondary/ghost/destructive variants | `specs/button.md` |
| IconButton | UI component | `client/src/ui/controls/IconButton.tsx` | Square icon-only button with a required accessible label | `specs/icon-button.md` |
| Badge | UI component | `client/src/ui/controls/Badge.tsx` | Small tag/count/status label | `specs/badge.md` |
| KeyHint | UI component | `client/src/ui/controls/KeyHint.tsx` | Keyboard-shortcut hint | `specs/key-hint.md` |
| PathInput | UI component | `client/src/ui/controls/PathInput.tsx` | Host-path text field with a validation state, refusal message and browse hint | `specs/path-input.md` |
| StorageUsageRow | UI component | `client/src/ui/controls/StorageUsageRow.tsx` | Label/description/size row with an optional clear action | `specs/storage-usage-row.md` |
| TextField, SearchField | UI component | `client/src/ui/controls/TextField.tsx`, `client/src/ui/controls/SearchField.tsx` | Single-line text input, and its full-width search/filter variant | `specs/search-field.md` |
| FilterChips | UI component | `client/src/ui/controls/FilterChips.tsx` | Single-select row of filter chips | `specs/filter-chips.md` |
| ActionButtonGroup | UI component | `client/src/ui/controls/ActionButtonGroup.tsx` | Inline group of dense row-action buttons, with a destructive variant | `specs/action-button-group.md` |
| ScreenToolbar | UI component | `client/src/ui/controls/ScreenToolbar.tsx` | Screen action bar: leading primary action, secondary actions, trailing destructive action, optional filters row | `specs/screen-toolbar.md` |
| DataTable | UI component | `client/src/ui/data/DataTable.tsx` | Dense, column-defined table with hover/selected row states and virtualised scrolling | `specs/data-table.md` |
| StatusDotCell, TwoLineCell, MetaCell | UI component | `client/src/ui/data/TableCells.tsx` | Reusable DataTable cell contents: status dot, title/subtitle pair, muted monospace value | `specs/table-cells.md` |
| Modal | UI component | `client/src/ui/feedback/Modal.tsx` | Centered glass dialog over a dimmed overlay | `specs/modal.md` |
| ConfirmDialog | UI component | `client/src/ui/feedback/ConfirmDialog.tsx` | Destructive-confirmation dialog naming the target and the consequence | `specs/confirm-dialog.md` |
| ToastProvider, useToast | UI component | `client/src/ui/feedback/Toast.tsx` | Transient toast notification stack and its provider/hook | `specs/toast.md` |
| ErrorBanner | UI component | `client/src/ui/feedback/ErrorBanner.tsx` | Inline failure banner showing the upstream error message verbatim, with an optional retry action | `specs/error-banner.md` |
| ProgressBar | UI component | `client/src/ui/feedback/ProgressBar.tsx` | Determinate or indeterminate progress indicator | `specs/progress-bar.md` |
| Spinner | UI component | `client/src/ui/feedback/Spinner.tsx` | Small rotating pending indicator | `specs/spinner.md` |
| EmptyState | UI component | `client/src/ui/feedback/EmptyState.tsx` | Placeholder for a screen or list with nothing to display | `specs/empty-state.md` |
| EventStream | UI component | `client/src/ui/feedback/EventStream.tsx` | Monospace, timestamped daemon event list with type/action emphasis | `specs/event-stream.md` |
| UI library entry point | module entry | `client/src/ui/index.ts` | Re-exports every UI-library component; the only import path feature code uses | `specs/library-entry-point.md` |
