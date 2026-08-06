import type { ReactNode } from 'react';
import { Backdrop } from '../background/Backdrop';
import './layout.css';

export interface FrameProps {
  rail: ReactNode;
  header: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * Application frame: a sticky navigation rail on the left and, on the right,
 * a header, a scrollable content area and an optional footer. Renders the
 * static backdrop once, behind everything.
 *
 * The main region is placed before the rail in the DOM (content-first
 * reading/tab order) while an explicit grid-column keeps the rail visually
 * on the left; visual layout does not depend on markup order.
 */
export function Frame({ rail, header, footer, children }: FrameProps) {
  return (
    <>
      <Backdrop />
      <div className="ui-frame">
        <div className="ui-frame__main">
          <div className="ui-frame__header">{header}</div>
          <div className="ui-frame__content">{children}</div>
          {footer ? <div className="ui-frame__footer">{footer}</div> : null}
        </div>
        <div className="ui-frame__rail">{rail}</div>
      </div>
    </>
  );
}
