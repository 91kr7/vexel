import type { ReactNode } from 'react';
import './layout.css';

export interface GridProps {
  children?: ReactNode;
  columns?: string;
  gap?: string;
}

/** CSS-grid layout; `columns` takes a grid-template-columns value. */
export function Grid({ children, columns = 'repeat(auto-fill, minmax(220px, 1fr))', gap = 'var(--space-4)' }: GridProps) {
  return (
    <div className="ui-grid" style={{ gridTemplateColumns: columns, gap }}>
      {children}
    </div>
  );
}
