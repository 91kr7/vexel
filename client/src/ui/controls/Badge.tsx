import type { ReactNode } from 'react';
import './controls.css';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  children?: ReactNode;
  tone?: BadgeTone;
  /** Renders the badge as a click target (e.g. "use" to select an object as active) instead of a plain label. */
  onClick?: () => void;
}

/** Small tag/count label; also used as a status/lifecycle indicator, or as a clickable selection action. */
export function Badge({ children, tone = 'neutral', onClick }: BadgeProps) {
  const toneClass = tone === 'neutral' ? '' : ` ui-badge--tone-${tone}`;
  if (onClick) {
    return (
      <button
        type="button"
        className={`ui-badge ui-badge--clickable${toneClass}`}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        {children}
      </button>
    );
  }
  return <span className={`ui-badge${toneClass}`}>{children}</span>;
}
