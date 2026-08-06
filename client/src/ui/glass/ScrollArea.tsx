import type { ReactNode } from 'react';
import './scroll-area.css';

export interface ScrollAreaProps {
  children?: ReactNode;
  maxHeight?: string;
}

/** Scrollable region with a styled, thin scrollbar; no scroll-driven animation. */
export function ScrollArea({ children, maxHeight }: ScrollAreaProps) {
  return (
    <div className="ui-scroll-area" style={maxHeight ? { maxHeight } : undefined}>
      {children}
    </div>
  );
}
