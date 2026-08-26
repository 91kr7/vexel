import type { MouseEvent, ReactNode } from 'react';
import './layout.css';

export interface RowProps {
  children?: ReactNode;
  gap?: string;
  align?: 'start' | 'center';
  justify?: 'start' | 'between';
  wrap?: boolean;
  /** The truncation contract over the row's groups: the leading one gives way, the trailing one never shrinks. */
  truncating?: boolean;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

/** Horizontal flex layout with alignment/justification helpers. */
export function Row({
  children,
  gap = 'var(--space-3)',
  align = 'start',
  justify = 'start',
  wrap = false,
  truncating = false,
  onClick,
}: RowProps) {
  const classes = [
    'ui-row',
    align === 'center' ? 'ui-row--align-center' : '',
    justify === 'between' ? 'ui-row--justify-between' : '',
    wrap ? 'ui-row--wrap' : '',
    truncating ? 'ui-row--truncating' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} style={{ gap }} onClick={onClick}>
      {children}
    </div>
  );
}
