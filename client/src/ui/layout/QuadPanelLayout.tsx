import type { ReactNode } from 'react';
import './layout.css';

export interface QuadPanelLayoutProps {
  topStart: ReactNode;
  topEnd: ReactNode;
  bottomStart: ReactNode;
  bottomEnd: ReactNode;
}

/**
 * Four panels of equal width in two rows — the arrangement of a screen whose
 * subject splits into four equally important inventories. Unlike
 * DashboardLayout, whose two columns are deliberately unequal, none of these
 * four is the subject more than the others. Below the tablet breakpoint the
 * grid becomes a single column, the panels keeping their reading order.
 */
export function QuadPanelLayout({ topStart, topEnd, bottomStart, bottomEnd }: QuadPanelLayoutProps) {
  return (
    <div className="ui-quad-panel-layout">
      {topStart}
      {topEnd}
      {bottomStart}
      {bottomEnd}
    </div>
  );
}
