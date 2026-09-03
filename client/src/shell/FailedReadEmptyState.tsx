import { EmptyState } from '../ui';

/**
 * The one sentence a screen shows when it holds no data because its read failed
 * (plan-docker_management_app-inline_error_panels/REQ-3).
 */
export const FAILED_READ_TITLE = 'This data could not be loaded';

export interface FailedReadEmptyStateProps {
  /** The library's compact presentation, for a placeholder inside a pane. */
  compact?: boolean;
}

/**
 * What a screen shows in place of the data it could not read: one wording for every screen and
 * every cause, the lost connection included, with no cause stated and no control offered — the
 * retry is the header's, and a control here would be a second one
 * (plan-docker_management_app-inline_error_panels/REQ-3, /REQ-4).
 */
export function FailedReadEmptyState({ compact }: FailedReadEmptyStateProps) {
  return <EmptyState title={FAILED_READ_TITLE} description={null} action={null} compact={compact} />;
}
