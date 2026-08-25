import type { ReactNode } from 'react';
import { DISMISSAL_FOCUS_TARGET_ATTRIBUTE } from '../controls/escape-arbitration';
import './layout.css';

/**
 * A named arrangement the library owns end to end: the caller asks for the shape, not for a track
 * template. `pair` — two equal columns, one when too narrow. `even-row` — one equal track per child.
 * `cards` — three equal tracks of entity cards, two then one as the width falls.
 */
export type GridArrangement = 'pair' | 'even-row' | 'cards';

export interface GridProps {
  children?: ReactNode;
  columns?: string;
  gap?: string;
  /** When set, the arrangement owns the tracks and the gap; `columns`/`gap` are ignored. */
  arrangement?: GridArrangement;
  /** Where the point of interaction returns when `Escape` dismisses a surface inside; adds no tab stop. */
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

/** A child that occupies the whole row whatever the arrangement's track count is. */
export function GridSpan({ children }: GridSpanProps) {
  return <div className="ui-grid__span-full">{children}</div>;
}
