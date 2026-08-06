import type { ReactNode } from 'react';
import './controls.css';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  children?: ReactNode;
  tone?: BadgeTone;
}

/** Small tag/count label; also used as a status/lifecycle indicator. */
export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  const classes = tone === 'neutral' ? 'ui-badge' : `ui-badge ui-badge--tone-${tone}`;
  return <span className={classes}>{children}</span>;
}
