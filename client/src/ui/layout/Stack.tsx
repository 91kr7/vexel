import type { ReactNode } from 'react';
import { DISMISSAL_FOCUS_TARGET_ATTRIBUTE } from '../controls/escape-arbitration';
import './layout.css';

export interface StackProps {
  children?: ReactNode;
  gap?: string;
  /** Where the point of interaction returns when `Escape` dismisses a surface inside; adds no tab stop. */
  dismissalFocusTarget?: boolean;
}

/** Vertical flex layout; feature code uses this instead of a wrapper <div>. */
export function Stack({ children, gap = 'var(--space-4)', dismissalFocusTarget = false }: StackProps) {
  return (
    <div
      className="ui-stack"
      style={{ gap }}
      tabIndex={dismissalFocusTarget ? -1 : undefined}
      {...(dismissalFocusTarget ? { [DISMISSAL_FOCUS_TARGET_ATTRIBUTE]: '' } : {})}
    >
      {children}
    </div>
  );
}
