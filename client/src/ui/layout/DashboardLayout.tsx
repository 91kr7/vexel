import type { ReactNode } from 'react';
import './layout.css';

export interface DashboardLayoutProps {
  /** The summary tiles, laid out as one row of equal-width cells that wraps rather than shrinks. */
  tiles: ReactNode;
  /** The wide panel of the two-column area. */
  primary: ReactNode;
  /** The narrow panel beside it. */
  secondary: ReactNode;
  /** Optional full-width panel below the two columns. */
  footer?: ReactNode;
}

/**
 * The overview arrangement: a row of equal tiles above a two-column panel
 * grid, with an optional full-width panel underneath. Below the tablet
 * breakpoint the two columns become one, primary first, so nothing is
 * squeezed into an unreadable width.
 */
export function DashboardLayout({ tiles, primary, secondary, footer }: DashboardLayoutProps) {
  return (
    <div className="ui-dashboard-layout">
      <div className="ui-dashboard-layout__tiles">{tiles}</div>
      <div className="ui-dashboard-layout__panels">
        <div className="ui-dashboard-layout__primary">{primary}</div>
        <div className="ui-dashboard-layout__secondary">{secondary}</div>
      </div>
      {footer ? <div className="ui-dashboard-layout__footer">{footer}</div> : null}
    </div>
  );
}
