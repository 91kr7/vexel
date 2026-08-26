import type { ReactNode } from 'react';
import { Meter, type MeterProps } from './Meter';
import './metrics.css';

export interface MetricStripColumn extends MeterProps {
  id: string;
}

export interface MetricStripReading {
  id: string;
  /** Muted label of the reading (e.g. "in"). */
  label: string;
  /** The reading itself, shown prominently. */
  value: string;
}

export interface MetricStripReadings {
  label: string;
  items: MetricStripReading[];
}

export interface MetricStripRow {
  id: string;
  /** The row's label, in the strip's own small uppercase muted treatment. */
  label: string;
  /** What the row reports, right-aligned; already-built elements the strip never reads. */
  content: ReactNode;
}

export interface MetricStripProps {
  /** The tracked columns, all of the same width, in reading order. */
  columns: MetricStripColumn[];
  /** The narrower trailing column: a label over a pair of readings, and no track. */
  readings?: MetricStripReadings;
  /** Lays the metrics one per row at any width; below the phone breakpoint the strip stacks regardless. */
  stacked?: boolean;
  /** Track-less rows drawn after the metrics, on their rhythm: label at the left, content right-aligned. */
  rows?: MetricStripRow[];
}

/**
 * A row of metric columns spanning its container's width: tracked columns of equal width, then a
 * narrower one carrying readings. One component so the columns line up across the strips of a list.
 */
export function MetricStrip({ columns, readings, stacked = false, rows = [] }: MetricStripProps) {
  const strip = (
    <div className={stacked ? 'ui-metric-strip ui-metric-strip--stacked' : 'ui-metric-strip'}>
      {columns.map(({ id, ...meter }) => (
        <div key={id} className="ui-metric-strip__column">
          <Meter {...meter} />
        </div>
      ))}
      {readings ? (
        <div className="ui-metric-strip__column ui-metric-strip__column--readings">
          <div className="ui-metric-strip__readings-head">
            <p className="ui-meter__label--eyebrow">{readings.label}</p>
          </div>
          <div className="ui-metric-strip__readings">
            {readings.items.map((item) => (
              <span key={item.id} className="ui-metric-strip__reading">
                <span className="ui-metric-strip__reading-label">{item.label}</span>
                <span className="ui-meter__value">{item.value}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (rows.length === 0) return strip;
  return (
    <div className="ui-metric-strip-group">
      {strip}
      {rows.map((row) => (
        <div key={row.id} className="ui-metric-strip__row">
          <p className="ui-meter__label--eyebrow">{row.label}</p>
          <div className="ui-metric-strip__row-content">{row.content}</div>
        </div>
      ))}
    </div>
  );
}
