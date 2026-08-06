import type { ReactNode } from 'react';
import './layout.css';

export interface RowProps {
  children?: ReactNode;
  gap?: string;
  align?: 'start' | 'center';
  justify?: 'start' | 'between';
  wrap?: boolean;
}

/** Horizontal flex layout with alignment/justification helpers. */
export function Row({ children, gap = 'var(--space-3)', align = 'start', justify = 'start', wrap = false }: RowProps) {
  const classes = [
    'ui-row',
    align === 'center' ? 'ui-row--align-center' : '',
    justify === 'between' ? 'ui-row--justify-between' : '',
    wrap ? 'ui-row--wrap' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} style={{ gap }}>
      {children}
    </div>
  );
}
