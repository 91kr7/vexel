import './metrics.css';

export interface MetricReading {
  /** What the reading is, shown beside the value (e.g. "in", "read"). */
  label: string;
  /** The reading itself, already formatted by the caller. */
  value: string;
}

export interface MetricReadingPairProps {
  /** The two readings, in reading order; each takes one of the pair's two roles. */
  readings: readonly [MetricReading, MetricReading];
}

/**
 * The two directions of one metric — in and out, read and written — as two
 * labelled readings told apart by their own treatment, rather than one `a / b`
 * string in which they differ only by position. Inline elements throughout, so
 * it can stand as a `MetricTile`'s value.
 */
export function MetricReadingPair({ readings: [first, second] }: MetricReadingPairProps) {
  return (
    <span className="ui-metric-reading-pair">
      <span className="ui-metric-reading ui-metric-reading--first">
        <span className="ui-metric-reading__value">{first.value}</span>
        <span className="ui-metric-reading__label">{first.label}</span>
      </span>
      <span className="ui-metric-reading ui-metric-reading--second">
        <span className="ui-metric-reading__value">{second.value}</span>
        <span className="ui-metric-reading__label">{second.label}</span>
      </span>
    </span>
  );
}
