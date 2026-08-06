import type { ReactNode } from 'react';
import './feedback.css';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Placeholder shown when a screen or list has nothing to display yet. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="ui-empty-state">
      <p className="ui-empty-state__title">{title}</p>
      {description ? <p className="ui-empty-state__description">{description}</p> : null}
      {action}
    </div>
  );
}
