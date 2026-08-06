import type { ReactNode } from 'react';
import type { StatusTone } from '../controls/StatusPill';
import './data-table.css';

export interface StatusDotCellProps {
  tone: StatusTone;
  label?: ReactNode;
}

/** A colored status dot, with an optional label next to it. */
export function StatusDotCell({ tone, label }: StatusDotCellProps) {
  return (
    <span className="ui-table-status-dot-cell">
      <span className={`ui-table-status-dot ui-table-status-dot--tone-${tone}`} />
      {label}
    </span>
  );
}

export interface TwoLineCellProps {
  title: ReactNode;
  subtitle?: ReactNode;
}

/** A title over a muted subtitle line (e.g. name over short id / state). */
export function TwoLineCell({ title, subtitle }: TwoLineCellProps) {
  return (
    <span className="ui-table-two-line-cell">
      <span className="ui-table-two-line-cell__title">{title}</span>
      {subtitle ? <span className="ui-table-two-line-cell__subtitle">{subtitle}</span> : null}
    </span>
  );
}

export interface MetaCellProps {
  children?: ReactNode;
}

/** Muted, monospace value for a numeric/meta column (CPU, memory, ports, uptime, …). */
export function MetaCell({ children }: MetaCellProps) {
  return <span className="ui-table-meta-cell">{children ?? '–'}</span>;
}
