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

export interface MetricStripProps {
  /** The tracked columns, all of the same width, in reading order. */
  columns: MetricStripColumn[];
  /** The narrower trailing column: a label over a pair of readings, and no track. */
  readings?: MetricStripReadings;
  /**
   * Lays the metrics one per row instead of side by side, at any width. For a
   * strip inside a box too narrow to carry its columns as a row — a card
   * standing in a grid rather than across the page. Below the phone breakpoint
   * the strip stacks regardless.
   */
  stacked?: boolean;
}

/**
 * A row of metric columns spanning its container's width: tracked columns of
 * equal width, then a narrower one carrying readings on the tracks' own line.
 *
 * It exists as one component because the columns' alignment **across several
 * strips** is a property of the arrangement: three columns composed by hand on
 * each object of a list would drift with that object's content, and the values
 * would stop lining up down the list. Below the phone breakpoint it stacks to
 * one full-width column per metric, each keeping everything it showed.
 *
 * Domain-agnostic: it receives already-formatted strings and plain numbers.
 */
export function MetricStrip({ columns, readings, stacked = false }: MetricStripProps) {
  return (
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
}
