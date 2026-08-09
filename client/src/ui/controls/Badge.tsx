import type { ReactNode } from 'react';
import './controls.css';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/**
 * `quiet` drops the fill and renders the label in muted monospace: a secondary
 * attribute of an object (a node's availability next to its role) that must not
 * read as a second pill competing with the first.
 */
export type BadgeVariant = 'solid' | 'quiet';

export interface BadgeProps {
  children?: ReactNode;
  tone?: BadgeTone;
  variant?: BadgeVariant;
  /** Renders the badge as a click target (e.g. "use" to select an object as active) instead of a plain label. */
  onClick?: () => void;
}

/** Small tag/count label; also used as a status/lifecycle indicator, or as a clickable selection action. */
export function Badge({ children, tone = 'neutral', variant = 'solid', onClick }: BadgeProps) {
  const classes = ['ui-badge', variant === 'quiet' ? 'ui-badge--quiet' : '', tone === 'neutral' ? '' : `ui-badge--tone-${tone}`]
    .filter(Boolean)
    .join(' ');
  if (onClick) {
    return (
      <button
        type="button"
        className={`${classes} ui-badge--clickable`}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        {children}
      </button>
    );
  }
  return <span className={classes}>{children}</span>;
}
