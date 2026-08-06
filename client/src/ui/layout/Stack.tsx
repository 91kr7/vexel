import type { ReactNode } from 'react';
import './layout.css';

export interface StackProps {
  children?: ReactNode;
  gap?: string;
}

/** Vertical flex layout; feature code uses this instead of a wrapper <div>. */
export function Stack({ children, gap = 'var(--space-4)' }: StackProps) {
  return (
    <div className="ui-stack" style={{ gap }}>
      {children}
    </div>
  );
}
