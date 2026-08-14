import type { CSSProperties, ReactNode } from 'react';
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
  /**
   * Takes the height of the region it is placed in instead of a stated maximum:
   * each side scrolls independently within whatever that region turns out to be,
   * and below the narrow breakpoint the two panes stack, `start` first and
   * keeping the larger share of the height.
   */
  fill?: boolean;
}

/** Two-pane surface (a fixed-width side next to a flexible one), divided by a hairline — e.g. a tree next to its detail view. */
export function SplitPane({ start, end, startWidth = '320px', maxHeight, fill = false }: SplitPaneProps) {
  // The start pane's width travels as a custom property rather than as `width`,
  // so the stacked breakpoint can drop it in the stylesheet instead of having to
  // out-shout an inline declaration. What it computes to is unchanged.
  const style = { '--ui-split-pane-start-width': startWidth, ...(maxHeight ? { maxHeight } : {}) } as CSSProperties;
  return (
    <div className={fill ? 'ui-split-pane ui-split-pane--fill' : 'ui-split-pane'} style={style}>
      <div className="ui-split-pane__start">{start}</div>
      <Divider orientation="vertical" />
      <div className="ui-split-pane__end">{end}</div>
    </div>
  );
}
