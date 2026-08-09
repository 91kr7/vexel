import type { ReactNode } from 'react';
import { Surface } from '../glass/Surface';
import './metrics.css';

export type MetricTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export interface MetricTileProps {
  label: string;
  value: ReactNode;
  subLabel?: ReactNode;
  /** Colors the value; `neutral` (default) uses the primary text color. */
  tone?: MetricTone;
  /** Renders the reading on its own glass panel instead of bare, for a tile standing alone. */
  surface?: boolean;
  /** Makes the whole tile activatable by pointer and keyboard; `ariaLabel` names what it leads to. */
  onActivate?: () => void;
  ariaLabel?: string;
  /** Extra content shown under the sub-label, e.g. a Meter or a Sparkline. */
  children?: ReactNode;
}

/** One reading of a metric: label, prominent value and an optional sub-label. */
export function MetricTile({ label, value, subLabel, tone = 'neutral', surface = false, onActivate, ariaLabel, children }: MetricTileProps) {
  const valueClass = tone === 'neutral' ? 'ui-metric-tile__value' : `ui-metric-tile__value ui-metric-tile__value--${tone}`;
  const reading = (
    <div className="ui-metric-tile">
      <p className="ui-metric-tile__label">{label}</p>
      <p className={valueClass}>{value}</p>
      {subLabel !== undefined ? <p className="ui-metric-tile__sub-label">{subLabel}</p> : null}
      {children ? <div className="ui-metric-tile__extra">{children}</div> : null}
    </div>
  );

  const tile = surface ? (
    <Surface elevation="flat" padding="md">
      {reading}
    </Surface>
  ) : (
    reading
  );

  if (!onActivate) return tile;
  return (
    <button type="button" className="ui-metric-tile__activator" onClick={onActivate} aria-label={ariaLabel}>
      {tile}
    </button>
  );
}
