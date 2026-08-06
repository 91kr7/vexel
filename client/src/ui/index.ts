// Public entry point of the UI library. Feature code imports UI primitives
// only from this module, never from a file under client/src/ui/ directly.

export { Backdrop } from './background/Backdrop';

export { Surface, type SurfaceElevation, type SurfacePadding, type SurfaceProps } from './glass/Surface';
export { Card, type CardProps } from './glass/Card';
export { SectionHeader, type SectionHeaderProps } from './glass/SectionHeader';
export { Divider, type DividerProps } from './glass/Divider';
export { ScrollArea, type ScrollAreaProps } from './glass/ScrollArea';

export { Frame, type FrameProps } from './layout/Frame';
export { Stack, type StackProps } from './layout/Stack';
export { Row, type RowProps } from './layout/Row';
export { Grid, type GridProps } from './layout/Grid';
export { Spacer } from './layout/Spacer';

export { NavRail, NavBrand, type NavRailProps, type NavBrandProps } from './navigation/NavRail';
export { NavGroup, type NavGroupProps } from './navigation/NavGroup';
export { NavItem, type NavItemProps } from './navigation/NavItem';
export { FooterStatus, type FooterStatusProps } from './navigation/FooterStatus';

export { PageHeader, type PageHeaderProps } from './controls/PageHeader';
export { StatusPill, type StatusPillProps, type StatusTone, type StatusPillAction } from './controls/StatusPill';
export { Button, type ButtonProps, type ButtonVariant } from './controls/Button';
export { IconButton, type IconButtonProps } from './controls/IconButton';
export { Badge, type BadgeProps, type BadgeTone } from './controls/Badge';
export { KeyHint, type KeyHintProps } from './controls/KeyHint';
export { PathInput, type PathInputProps, type PathInputValidationState } from './controls/PathInput';
export { StorageUsageRow, type StorageUsageRowProps, type StorageUsageRowAction } from './controls/StorageUsageRow';

export { Modal, type ModalProps } from './feedback/Modal';
export { ConfirmDialog, type ConfirmDialogProps } from './feedback/ConfirmDialog';
export { ToastProvider, useToast, type ToastInput, type ToastTone } from './feedback/Toast';
export { ErrorBanner, type ErrorBannerProps } from './feedback/ErrorBanner';
export { ProgressBar, type ProgressBarProps } from './feedback/ProgressBar';
export { Spinner, type SpinnerProps } from './feedback/Spinner';
export { EmptyState, type EmptyStateProps } from './feedback/EmptyState';
export { EventStream, type EventStreamProps, type EventStreamEntry } from './feedback/EventStream';
