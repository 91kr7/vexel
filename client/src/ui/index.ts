// Public entry point of the UI library. Feature code imports UI primitives
// only from this module, never from a file under client/src/ui/ directly.

export { Backdrop } from './background/Backdrop';

export { Surface, type SurfaceElevation, type SurfacePadding, type SurfaceProps } from './glass/Surface';
export { Card, type CardProps } from './glass/Card';
export { SectionHeader, type SectionHeaderProps } from './glass/SectionHeader';
export { Divider, type DividerProps } from './glass/Divider';
export { ScrollArea, type ScrollAreaProps } from './glass/ScrollArea';
export { CollapsibleSection, type CollapsibleSectionProps } from './glass/CollapsibleSection';
export { DetailPanel, type DetailPanelProps } from './glass/DetailPanel';
export { StateSummaryBar, type StateSummaryBarProps } from './glass/StateSummaryBar';

export { Frame, type FrameProps } from './layout/Frame';
export { Stack, type StackProps } from './layout/Stack';
export { Row, type RowProps } from './layout/Row';
export { Grid, type GridProps } from './layout/Grid';
export { DashboardLayout, type DashboardLayoutProps } from './layout/DashboardLayout';
export { QuadPanelLayout, type QuadPanelLayoutProps } from './layout/QuadPanelLayout';
export { Spacer } from './layout/Spacer';
export { SplitPane, type SplitPaneProps } from './layout/SplitPane';

export { NavRail, NavBrand, type NavRailProps, type NavBrandProps } from './navigation/NavRail';
export { NavGroup, type NavGroupProps } from './navigation/NavGroup';
export { NavItem, type NavItemProps } from './navigation/NavItem';
export { FooterStatus, type FooterStatusProps } from './navigation/FooterStatus';

export { PageHeader, type PageHeaderProps } from './controls/PageHeader';
export { StatusPill, type StatusPillProps, type StatusTone, type StatusPillAction } from './controls/StatusPill';
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './controls/Button';
export { IconButton, type IconButtonProps } from './controls/IconButton';
export { Badge, type BadgeProps, type BadgeTone, type BadgeVariant } from './controls/Badge';
export { KeyHint, type KeyHintProps } from './controls/KeyHint';
export { PathInput, type PathInputProps, type PathInputValidationState } from './controls/PathInput';
export { StorageUsageRow, type StorageUsageRowProps, type StorageUsageRowAction } from './controls/StorageUsageRow';
export { CheckboxGroup, type CheckboxGroupProps, type CheckboxOption } from './controls/CheckboxGroup';
export { TextField, type TextFieldProps } from './controls/TextField';
export { SearchField, type SearchFieldProps } from './controls/SearchField';
export { SecretField, type SecretFieldProps } from './controls/SecretField';
export { FilterChips, type FilterChipsProps, type FilterChipOption } from './controls/FilterChips';
export { ActionButtonGroup, type ActionButtonGroupProps, type RowAction } from './controls/ActionButtonGroup';
export { BulkActionBar, type BulkActionBarProps, type BulkActionBarAction } from './controls/BulkActionBar';
export { FilePicker, type FilePickerProps } from './controls/FilePicker';
export { ScreenToolbar, type ScreenToolbarProps, type ScreenToolbarAction } from './controls/ScreenToolbar';
export { Tabs, type TabsProps, type TabItem } from './controls/Tabs';
export { CopyButton, type CopyButtonProps } from './controls/CopyButton';
export { RevealableValue, type RevealableValueProps, type RevealableValueAction } from './controls/RevealableValue';
export { NumberField, type NumberFieldProps } from './controls/NumberField';
export { Stepper, type StepperProps } from './controls/Stepper';
export { Select, type SelectProps, type SelectOption } from './controls/Select';
export { Toggle, type ToggleProps } from './controls/Toggle';
export { FieldMessage, type FieldMessageProps, type FieldMessageTone } from './controls/FieldMessage';
export { EndpointField, type EndpointFieldProps, type EndpointKindOption } from './controls/EndpointField';
export { KeyValueEditor, type KeyValueEditorProps, type KeyValuePair } from './controls/KeyValueEditor';
export { RepeatableRowList, type RepeatableRowListProps } from './controls/RepeatableRowList';
export { FormFooter, type FormFooterProps } from './controls/FormFooter';
export { FormField, type FormFieldProps } from './controls/FormField';
export { FormSection, type FormSectionProps } from './controls/FormSection';
export { Combobox, type ComboboxProps, type ComboboxOption } from './controls/Combobox';
export { ChipInput, type ChipInputProps } from './controls/ChipInput';
export { Chip, type ChipProps, ChipGroup, type ChipGroupProps, type ChipGroupItem } from './controls/Chip';
export {
  CrossReference,
  type CrossReferenceProps,
  CrossReferenceList,
  type CrossReferenceListProps,
  type CrossReferenceItem,
} from './controls/CrossReference';
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from './controls/SegmentedControl';
export { TailSizeSelector, type TailSizeSelectorProps, type TailSize } from './controls/TailSizeSelector';
export { TimeRangeField, type TimeRangeFieldProps, type TimeRange } from './controls/TimeRangeField';
export { StreamSearchField, type StreamSearchFieldProps } from './controls/StreamSearchField';

export { DataTable, type DataTableProps, type DataTableColumn, type DataTableSelection } from './data/DataTable';
export {
  StatusDotCell,
  type StatusDotCellProps,
  TwoLineCell,
  type TwoLineCellProps,
  MetaCell,
  type MetaCellProps,
  IdentifierCell,
  type IdentifierCellProps,
  BadgeListCell,
  type BadgeListCellProps,
  ProportionBarCell,
  type ProportionBarCellProps,
} from './data/TableCells';
export { DefinitionList, type DefinitionListProps, type DefinitionItem } from './data/DefinitionList';
export { CodeViewer, type CodeViewerProps } from './data/CodeViewer';
export { CodeEditor, type CodeEditorProps } from './data/CodeEditor';
export { GroupedRowsPanel, type GroupedRowsPanelProps, type GroupedRowsPanelGroup, type GroupedRowsPanelRow } from './data/GroupedRowsPanel';
export { TextViewer, type TextViewerProps, HexDumpViewer, type HexDumpViewerProps } from './data/ContentViewer';
export { LogStream, type LogStreamProps, type LogStreamLine } from './data/LogStream';
export { CardList, type CardListProps, type CardListRowContent, type CardListRowSelection } from './data/CardList';
export { TreeView, type TreeViewProps, type TreeNode, type TreeEntryKind } from './data/TreeView';
export { DiffTreeView, type DiffTreeViewProps, type DiffTreeNode, type DiffStatus, type DiffStatusFilter } from './data/DiffTreeView';
export { SideBySideViewer, type SideBySideViewerProps, type SideBySideSide } from './data/SideBySideViewer';

export { MetricTile, type MetricTileProps, type MetricTone } from './metrics/MetricTile';
export { Meter, type MeterProps } from './metrics/Meter';
export { Sparkline, type SparklineProps } from './metrics/Sparkline';
export { UsageBreakdown, type UsageBreakdownProps, type UsageBreakdownItem } from './metrics/UsageBreakdown';

export { Modal, type ModalProps, type ModalSize } from './feedback/Modal';
export { ConfirmDialog, type ConfirmDialogProps } from './feedback/ConfirmDialog';
export { ToastProvider, useToast, type ToastInput, type ToastTone } from './feedback/Toast';
export { ErrorBanner, type ErrorBannerProps } from './feedback/ErrorBanner';
export { Callout, type CalloutProps, type CalloutTone } from './feedback/Callout';
export { ResultSummary, type ResultSummaryProps, type ResultSummaryItem, type ResultSummaryTone } from './feedback/ResultSummary';
export { ProgressBar, type ProgressBarProps } from './feedback/ProgressBar';
export { Spinner, type SpinnerProps } from './feedback/Spinner';
export { EmptyState, type EmptyStateProps } from './feedback/EmptyState';
export { EventStream, type EventStreamProps, type EventStreamEntry } from './feedback/EventStream';
export { FormDialog, type FormDialogProps } from './feedback/FormDialog';
export { FormSheet, type FormSheetProps, type FormSheetCommit } from './feedback/FormSheet';
export { StepProgressList, type StepProgressListProps, type ProgressStep, type ProgressStepStatus } from './feedback/StepProgressList';
export { TransferProgressDialog, type TransferProgressDialogProps, type TransferStatus } from './feedback/TransferProgressDialog';

export { triggerDownload } from './utils/trigger-download';

export { Terminal, type TerminalHandle, type TerminalProps } from './terminal/Terminal';
export {
  SessionHeader,
  type SessionHeaderProps,
  type SessionConnectionState,
  SessionEndedOverlay,
  type SessionEndedOverlayProps,
  SessionSurface,
  type SessionSurfaceProps,
} from './terminal/SessionChrome';
