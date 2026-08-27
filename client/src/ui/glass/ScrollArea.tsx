import { forwardRef, type ReactNode, type UIEvent } from 'react';
import './scroll-area.css';

export interface ScrollAreaProps {
  children?: ReactNode;
  maxHeight?: string;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  /**
   * Inset: room around the scrolled content, for a document made of surfaces
   * rather than of lines. A `Card` at the region's edge then draws the whole of
   * its drop shadow instead of having it clipped, and the scrollbar keeps a
   * gutter of its own instead of sitting on the content's trailing edge.
   *
   * An opt-in and not the default because the library's own scrolling surfaces
   * — the log stream, the console, the data table, the tree view, the content
   * and code viewers, the event stream — align their own headers, gutters and
   * virtualised rows against this box and must keep the one they have.
   */
  inset?: boolean;
}

/** Scrollable region with a styled, thin scrollbar; no scroll-driven animation. */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { children, maxHeight, onScroll, inset = false },
  ref,
) {
  return (
    <div
      ref={ref}
      className={inset ? 'ui-scroll-area ui-scroll-area--inset' : 'ui-scroll-area'}
      style={maxHeight ? { maxHeight } : undefined}
      onScroll={onScroll}
    >
      {children}
    </div>
  );
});
