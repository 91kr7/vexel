import type { ReactNode } from 'react';
import './controls.css';

export type StatusTone = 'success' | 'neutral' | 'warning' | 'danger';

export interface StatusPillProps {
  children?: ReactNode;
  tone?: StatusTone;
}

/** Small dot + label pill used for live/connection/health status. */
export function StatusPill({ children, tone = 'success' }: StatusPillProps) {
  const classes = tone === 'success' ? 'ui-status-pill' : `ui-status-pill ui-status-pill--tone-${tone}`;
  return (
    <span className={classes}>
      <span className="ui-status-pill__dot" />
      {children}
    </span>
  );
}
