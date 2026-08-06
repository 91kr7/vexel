import type { ReactNode } from 'react';
import './controls.css';

export type StatusTone = 'success' | 'neutral' | 'warning' | 'danger';

export interface StatusPillAction {
  label: string;
  onClick: () => void;
}

export interface StatusPillProps {
  children?: ReactNode;
  tone?: StatusTone;
  /** Inline action (e.g. "Retry") appended after the label. */
  action?: StatusPillAction;
}

/** Small dot + label pill used for live/connection/health status. */
export function StatusPill({ children, tone = 'success', action }: StatusPillProps) {
  const classes = tone === 'success' ? 'ui-status-pill' : `ui-status-pill ui-status-pill--tone-${tone}`;
  return (
    <span className={classes}>
      <span className="ui-status-pill__dot" />
      {children}
      {action ? (
        <button type="button" className="ui-status-pill__action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </span>
  );
}
