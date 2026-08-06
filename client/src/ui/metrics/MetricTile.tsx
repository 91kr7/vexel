import type { ReactNode } from 'react';
import './metrics.css';

export type MetricTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export interface MetricTileProps {
  label: string;
  value: ReactNode;
  subLabel?: ReactNode;
  /** Colors the value; `neutral` (default) uses the primary text color. */
  tone?: MetricTone;
  /** Extra content shown under the sub-label, e.g. a Meter or a Sparkline. */
  children?: ReactNode;
}

/** One reading of a metric: label, prominent value and an optional sub-label. */
export function MetricTile({ label, value, subLabel, tone = 'neutral', children }: MetricTileProps) {
  const valueClass = tone === 'neutral' ? 'ui-metric-tile__value' : `ui-metric-tile__value ui-metric-tile__value--${tone}`;
  return (
    <div className="ui-metric-tile">
      <p className="ui-metric-tile__label">{label}</p>
      <p className={valueClass}>{value}</p>
      {subLabel !== undefined ? <p className="ui-metric-tile__sub-label">{subLabel}</p> : null}
      {children ? <div className="ui-metric-tile__extra">{children}</div> : null}
    </div>
  );
}
