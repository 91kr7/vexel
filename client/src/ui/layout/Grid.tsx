import type { ReactNode } from 'react';
import { DISMISSAL_FOCUS_TARGET_ATTRIBUTE } from '../controls/escape-arbitration';
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
 *
 * `cards` — three equal tracks of entity cards, two where three would each fall
 * under a readable card width, one below the phone breakpoint. The count is
 * stated rather than auto-fitted: how many cards belong on a row is a decision
 * about the list, not something a track size should discover. Every card of a
 * row takes the height of the tallest; rows are not matched to each other and
 * no minimum height is imposed.
 */
export type GridArrangement = 'pair' | 'even-row' | 'cards';

export interface GridProps {
  children?: ReactNode;
  columns?: string;
  gap?: string;
  /** When set, the arrangement owns the tracks and the gap; `columns`/`gap` are ignored. */
  arrangement?: GridArrangement;
  /**
   * Marks the grid as the region the point of interaction returns to when a
   * dismissible surface inside it is dismissed by `Escape` rather than by a
   * control of its own — for a grid that *is* a list, its expansion opening
   * inside it. It adds no stop of its own to the tab order.
   */
  dismissalFocusTarget?: boolean;
}

/** CSS-grid layout; `columns` takes a grid-template-columns value. */
export function Grid({
  children,
  columns = 'repeat(auto-fill, minmax(220px, 1fr))',
  gap = 'var(--space-4)',
  arrangement,
  dismissalFocusTarget = false,
}: GridProps) {
  const dismissal = {
    tabIndex: dismissalFocusTarget ? -1 : undefined,
    ...(dismissalFocusTarget ? { [DISMISSAL_FOCUS_TARGET_ATTRIBUTE]: '' } : {}),
  };
  if (arrangement) {
    return (
      <div className={`ui-grid ui-grid--${arrangement}`} {...dismissal}>
        {children}
      </div>
    );
  }
  return (
    <div className="ui-grid" style={{ gridTemplateColumns: columns, gap }} {...dismissal}>
      {children}
    </div>
  );
}

export interface GridSpanProps {
  children?: ReactNode;
}

/**
 * A child that occupies the whole row whatever the arrangement's track count
 * is: a list's expansion opening under the item that owns it, an empty state,
 * a banner standing among tiles.
 */
export function GridSpan({ children }: GridSpanProps) {
  return <div className="ui-grid__span-full">{children}</div>;
}
