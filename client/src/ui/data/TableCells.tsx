import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '../controls/Badge';
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
  /**
   * When `children` is empty and this is given, renders "unavailable" instead
   * of the default '–', with the reason as a tooltip — for a value the
   * daemon genuinely cannot provide (as opposed to one that is merely empty).
   */
  unavailableReason?: string;
}

/**
 * Muted, monospace value for a numeric/meta column (CPU, memory, ports,
 * uptime, …). By default a single line that ellipsis-truncates instead of
 * wrapping or overflowing its cell, with the full value available as a
 * tooltip (native `title`), so a row never grows taller than its fixed
 * height regardless of content length.
 */
export function MetaCell({ children, wrap = false, title, unavailableReason }: MetaCellProps) {
  const className = wrap ? 'ui-table-meta-cell ui-table-meta-cell--wrap' : 'ui-table-meta-cell';
  const isEmpty = children === undefined || children === null || children === '';
  if (isEmpty && unavailableReason) {
    return (
      <span className={`${className} ui-table-meta-cell--unavailable`} title={unavailableReason}>
        unavailable
      </span>
    );
  }
  const tooltip = title ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : undefined);
  return (
    <span className={className} title={tooltip}>
      {children ?? '–'}
    </span>
  );
}

export interface IdentifierCellProps {
  value?: string;
  /** Characters kept before the value is cut at its tail; unset keeps the whole value. */
  maxChars?: number;
}

/**
 * An opaque identifier (hash, digest, key) in monospace. Cutting at a fixed
 * character count — not only at the column's width — keeps every row showing
 * the same amount of the identifier; the full value stays available as a
 * native tooltip.
 */
export function IdentifierCell({ value, maxChars }: IdentifierCellProps) {
  if (!value) return <span className="ui-table-identifier-cell">–</span>;
  const shortened = maxChars !== undefined && value.length > maxChars ? `${value.slice(0, maxChars)}…` : value;
  return (
    <span className="ui-table-identifier-cell" title={value}>
      {shortened}
    </span>
  );
}

export interface BadgeListCellProps {
  labels: string[];
  tone?: BadgeTone;
  /** Badges rendered before the overflow indicator takes over. Default 3. */
  maxVisible?: number;
  emptyLabel?: string;
  emptyTone?: BadgeTone;
}

/**
 * A single line of badges for a list-valued column, with a `+N` indicator
 * carrying the hidden entries in its tooltip so the row height never changes
 * with the number of entries.
 */
export function BadgeListCell({ labels, tone = 'neutral', maxVisible = 3, emptyLabel, emptyTone = 'neutral' }: BadgeListCellProps) {
  if (labels.length === 0) {
    if (!emptyLabel) return <span className="ui-table-badge-list-cell">–</span>;
    return (
      <span className="ui-table-badge-list-cell">
        <Badge tone={emptyTone}>{emptyLabel}</Badge>
      </span>
    );
  }
  const visible = labels.slice(0, maxVisible);
  const hidden = labels.slice(maxVisible);
  return (
    <span className="ui-table-badge-list-cell">
      {visible.map((label) => (
        <span key={label} className="ui-table-badge-list-cell__item" title={label}>
          <Badge tone={tone}>{label}</Badge>
        </span>
      ))}
      {hidden.length > 0 ? (
        <span className="ui-table-badge-list-cell__item" title={hidden.join(', ')}>
          <Badge>{`+${hidden.length}`}</Badge>
        </span>
      ) : null}
    </span>
  );
}

export interface ProportionBarCellProps {
  /** This row's share of the column's largest row, `0..1`; clamped, and treated as `0` when not finite. */
  fraction: number;
  label: ReactNode;
  tone?: BadgeTone;
}

/**
 * A rounded bar filled to `fraction` of the cell's width, carrying `label`
 * inside it — the row's magnitude relative to the largest row in the same
 * column (e.g. a build step's share of its layer stack's largest layer). A
 * small minimum width keeps a near-zero row's bar visible and selectable.
 */
export function ProportionBarCell({ fraction, label, tone = 'neutral' }: ProportionBarCellProps) {
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const tooltip = typeof label === 'string' ? label : undefined;
  return (
    <span className="ui-table-proportion-bar-cell">
      <span
        className={`ui-table-proportion-bar-cell__fill ui-table-proportion-bar-cell__fill--tone-${tone}`}
        style={{ width: `${Math.max(clamped * 100, 8)}%` }}
        title={tooltip}
      >
        {label}
      </span>
    </span>
  );
}
