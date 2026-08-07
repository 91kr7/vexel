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
  /**
   * An optional inline action next to the text (e.g. an edit affordance).
   * Hidden until the cell is hovered or a descendant gains focus, so dense
   * rows stay quiet by default; never `display: none`, so it stays reachable
   * via Tab and to assistive technology regardless of hover state.
   */
  action?: ReactNode;
}

/**
 * A title over a muted subtitle line (e.g. name over short id / state), with
 * an optional trailing inline action. Both lines are single-line and
 * ellipsis-truncate instead of wrapping, with the full text available as a
 * tooltip, so the cell never grows the row or loses text to the row's
 * overflow clipping.
 */
export function TwoLineCell({ title, subtitle, action }: TwoLineCellProps) {
  const titleTooltip = typeof title === 'string' ? title : undefined;
  const subtitleTooltip = typeof subtitle === 'string' ? subtitle : undefined;
  return (
    <span className="ui-table-two-line-cell">
      <span className="ui-table-two-line-cell__text">
        <span className="ui-table-two-line-cell__title" title={titleTooltip}>
          {title}
        </span>
        {subtitle ? (
          <span className="ui-table-two-line-cell__subtitle" title={subtitleTooltip}>
            {subtitle}
          </span>
        ) : null}
      </span>
      {action ? <span className="ui-table-two-line-cell__action">{action}</span> : null}
    </span>
  );
}

export interface MetaCellProps {
  children?: ReactNode;
  /** Wraps long unbroken values (e.g. a PATH-style env line) instead of overflowing; off by default so dense table columns keep truncating normally. */
  wrap?: boolean;
  /** Full value shown as a tooltip when the content is truncated; defaults to the text content itself. */
  title?: string;
}

/**
 * Muted, monospace value for a numeric/meta column (CPU, memory, ports,
 * uptime, …). By default a single line that ellipsis-truncates instead of
 * wrapping or overflowing its cell, with the full value available as a
 * tooltip (native `title`), so a row never grows taller than its fixed
 * height regardless of content length.
 */
export function MetaCell({ children, wrap = false, title }: MetaCellProps) {
  const className = wrap ? 'ui-table-meta-cell ui-table-meta-cell--wrap' : 'ui-table-meta-cell';
  const tooltip = title ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : undefined);
  return (
    <span className={className} title={tooltip}>
      {children ?? '–'}
    </span>
  );
}
