import type { MetricTone } from './MetricTile';
import './metrics.css';

export interface MeterProps {
  label?: string;
  /** Consumed amount; negative values are treated as 0. */
  value: number;
  /** Full scale; when missing or not positive the metric has no measurable maximum. */
  max?: number;
  /** Reading shown at the right of the label (e.g. "128MB / 512MB"). */
  reading?: string;
  tone?: MetricTone;
  ariaLabel?: string;
}

const NO_MAXIMUM_TEXT = 'No measurable maximum';

/** Proportional bar showing how much of a limit is consumed, with its reading. */
export function Meter({ label, value, max, reading, tone = 'accent', ariaLabel }: MeterProps) {
  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;
  const bounded = max !== undefined && max > 0;
  const ratio = bounded ? Math.min(safeValue / max, 1) : 0;
  const percent = ratio * 100;
  const fillClass = tone === 'accent' ? 'ui-meter__fill' : `ui-meter__fill ui-meter__fill--${tone}`;
  /* An unfilled track and a track that has no scale to fill against look the
     same, and the second is a fact about the metric rather than a bar that did
     not draw (plan-ui-coherence-optimisation/REQ-64). Same box, so a bounded
     reading and an unbounded one are the same height. */
  const trackClass = bounded ? 'ui-meter__track' : 'ui-meter__track ui-meter__track--unbounded';
  return (
    <div className="ui-meter">
      {label !== undefined || reading !== undefined ? (
        <div className="ui-meter__head">
          {label !== undefined ? <p className="ui-meter__label">{label}</p> : null}
          {reading !== undefined ? <span className="ui-meter__reading">{reading}</span> : null}
        </div>
      ) : null}
      <div
        className={trackClass}
        role="meter"
        aria-label={ariaLabel ?? label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={bounded ? undefined : NO_MAXIMUM_TEXT}
      >
        <div className={fillClass} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
