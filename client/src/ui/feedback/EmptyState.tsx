import type { ReactNode } from 'react';
import './feedback.css';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * Compact: the height of its own content, at the top of the space it is given
   * — for a placeholder inside a pane, where the full-height, centred
   * presentation reads as a void the pane could not fill. Screens and lists keep
   * the default.
   */
  compact?: boolean;
}

/** Placeholder shown when a screen or list has nothing to display yet. */
export function EmptyState({ title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={compact ? 'ui-empty-state ui-empty-state--compact' : 'ui-empty-state'}>
      <p className="ui-empty-state__title">{title}</p>
      {description ? <p className="ui-empty-state__description">{description}</p> : null}
      {action}
    </div>
  );
}
