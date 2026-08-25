import type { ReactNode } from 'react';
import { DISMISSAL_FOCUS_TARGET_ATTRIBUTE } from '../controls/escape-arbitration';
import './layout.css';

export interface StackProps {
  children?: ReactNode;
  gap?: string;
  /**
   * Marks the stack as the region the point of interaction returns to when a
   * dismissible surface inside it is dismissed by `Escape` rather than by a
   * control of its own — for a stack that *is* a list, its expansion opening
   * inside it. It adds no stop of its own to the tab order.
   */
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
