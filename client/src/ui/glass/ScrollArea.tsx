import { forwardRef, type ReactNode, type UIEvent } from 'react';
import './scroll-area.css';

export interface ScrollAreaProps {
  children?: ReactNode;
  maxHeight?: string;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
}

/** Scrollable region with a styled, thin scrollbar; no scroll-driven animation. */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { children, maxHeight, onScroll },
  ref,
) {
  return (
    <div ref={ref} className="ui-scroll-area" style={maxHeight ? { maxHeight } : undefined} onScroll={onScroll}>
      {children}
    </div>
  );
});
