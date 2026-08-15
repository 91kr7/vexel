import type { ReactNode } from 'react';
import './layout.css';

/**
 * A named arrangement the library owns end to end: the caller asks for the
 * shape, not for a track template.
 *
 * `pair` — two equal columns side by side, one column when the grid's own box
 * is too narrow to carry both.
 *
 * `even-row` — one track per child, all equal, on a single row: the track count
 * is the child count, so nothing can be orphaned onto a row of its own. One
 * stacked column below the phone breakpoint.
 */
export type GridArrangement = 'pair' | 'even-row';

export interface GridProps {
  children?: ReactNode;
  columns?: string;
  gap?: string;
  /** When set, the arrangement owns the tracks and the gap; `columns`/`gap` are ignored. */
  arrangement?: GridArrangement;
}

/** CSS-grid layout; `columns` takes a grid-template-columns value. */
export function Grid({ children, columns = 'repeat(auto-fill, minmax(220px, 1fr))', gap = 'var(--space-4)', arrangement }: GridProps) {
  if (arrangement) {
    return <div className={`ui-grid ui-grid--${arrangement}`}>{children}</div>;
  }
  return (
    <div className="ui-grid" style={{ gridTemplateColumns: columns, gap }}>
      {children}
    </div>
  );
}
