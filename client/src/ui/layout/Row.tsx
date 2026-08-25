import type { MouseEvent, ReactNode } from 'react';
import './layout.css';

export interface RowProps {
  children?: ReactNode;
  gap?: string;
  align?: 'start' | 'center';
  justify?: 'start' | 'between';
  wrap?: boolean;
  /**
   * Applies the truncation contract to the row's own groups: the leading group
   * gives way when the width runs out (its lines ellipsise, if they asked to),
   * the trailing group keeps its natural width and never shrinks.
   */
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
