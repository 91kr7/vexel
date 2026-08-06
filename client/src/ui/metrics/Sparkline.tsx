import { useMemo } from 'react';
import type { MetricTone } from './MetricTile';
import './metrics.css';

export interface SparklineProps {
  /** Oldest sample first; the caller owns the window's size. */
  values: number[];
  /** Full scale of the vertical axis; defaults to the largest value in the window. */
  max?: number;
  tone?: MetricTone;
  /** Rendered height in px (default 32). */
  height?: number;
  ariaLabel?: string;
  /** Shown instead of the line while there are fewer than two samples. */
  emptyLabel?: string;
}

const VIEWBOX_WIDTH = 100;

/**
 * Compact time-series line over a bounded sample window. It is a plain SVG
 * path recomputed only when `values` changes: no animation loop, no timers.
 */
export function Sparkline({ values, max, tone = 'accent', height = 32, ariaLabel, emptyLabel = 'No samples yet' }: SparklineProps) {
  const geometry = useMemo(() => {
    if (values.length < 2) return undefined;
    const scale = max !== undefined && max > 0 ? max : Math.max(...values, 0);
    const top = scale > 0 ? scale : 1;
    const step = VIEWBOX_WIDTH / (values.length - 1);
    const points = values.map((value, index) => {
      const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), top);
      return `${(index * step).toFixed(2)},${(100 - (clamped / top) * 100).toFixed(2)}`;
    });
    return { line: `M${points.join(' L')}`, area: `M0,100 L${points.join(' L')} L${VIEWBOX_WIDTH},100 Z` };
  }, [values, max]);

  if (!geometry) {
    return (
      <div className="ui-sparkline__empty" style={{ height: `${height}px` }}>
        {emptyLabel}
      </div>
    );
  }

  const lineClass = tone === 'accent' ? 'ui-sparkline__line' : `ui-sparkline__line ui-sparkline__line--${tone}`;
  const areaClass = tone === 'accent' ? 'ui-sparkline__area' : `ui-sparkline__area ui-sparkline__area--${tone}`;
  return (
    <svg
      className="ui-sparkline"
      style={{ height: `${height}px` }}
      viewBox={`0 0 ${VIEWBOX_WIDTH} 100`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <path className={areaClass} d={geometry.area} />
      <path className={lineClass} d={geometry.line} />
    </svg>
  );
}
