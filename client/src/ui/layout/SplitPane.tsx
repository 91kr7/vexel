import type { ReactNode } from 'react';
import { Divider } from '../glass/Divider';
import './split-pane.css';

export interface SplitPaneProps {
  /** Fixed-width leading pane (e.g. a tree). */
  start: ReactNode;
  /** Flexible trailing pane (e.g. a detail view). */
  end: ReactNode;
  /** CSS width of the start pane (default `'320px'`). */
  startWidth?: string;
  /** Caps the pane's height so both sides scroll independently within it. */
  maxHeight?: string;
}

/** Two-pane surface (a fixed-width side next to a flexible one), divided by a hairline — e.g. a tree next to its detail view. */
export function SplitPane({ start, end, startWidth = '320px', maxHeight }: SplitPaneProps) {
  return (
    <div className="ui-split-pane" style={maxHeight ? { maxHeight } : undefined}>
      <div className="ui-split-pane__start" style={{ width: startWidth }}>
        {start}
      </div>
      <Divider orientation="vertical" />
      <div className="ui-split-pane__end">{end}</div>
    </div>
  );
}
