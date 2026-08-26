import type { MetricTone } from './MetricTile';
import './metrics.css';

export interface MeterProps {
  label?: string;
  /** The prominent reading beside the label; its presence gives the label the eyebrow treatment. */
  valueText?: string;
  /** Consumed amount; negative values are treated as 0. */
  value: number;
  /** Full scale; when missing or not positive the metric has no measurable maximum. */
  max?: number;
  /** Reading shown at the right of the label (e.g. "128MB / 512MB", "of 8 cores"). */
  reading?: string;
  tone?: MetricTone;
  ariaLabel?: string;
  /** Nothing was measured — distinct from an unmeasurable maximum and from a measured zero. */
  noSample?: boolean;
}

const NO_MAXIMUM_TEXT = 'No measurable maximum';
const NO_SAMPLE_VALUE = '—';
const NO_SAMPLE_TEXT = 'no sample';

/** Proportional bar showing how much of a limit is consumed, with its reading. */
export function Meter({ label, valueText, value, max, reading, tone = 'accent', ariaLabel, noSample = false }: MeterProps) {
  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;
  const bounded = !noSample && max !== undefined && max > 0;
  const ratio = bounded ? Math.min(safeValue / max, 1) : 0;
  const percent = ratio * 100;
  /* A measurement that exists is drawn, however small: below a minimum width the
     fill is a sliver and reads as an empty track. */
  const fillClass = [
    'ui-meter__fill',
    tone === 'accent' ? '' : `ui-meter__fill--${tone}`,
    safeValue > 0 && bounded ? 'ui-meter__fill--present' : '',
  ]
    .filter(Boolean)
    .join(' ');
  /* An unfilled track and a track that has no scale to fill against look the
     same, and the second is a fact about the metric rather than a bar that did
     not draw (plan-ui-coherence-optimisation/REQ-64). Same box, so a bounded
     reading and an unbounded one are the same height; an unmeasured one is the
     third state, empty and fainter. */
  const trackClass = noSample
    ? 'ui-meter__track ui-meter__track--no-sample'
    : bounded
      ? 'ui-meter__track'
      : 'ui-meter__track ui-meter__track--unbounded';

  const shownValue = noSample ? NO_SAMPLE_VALUE : valueText;
  const shownReading = noSample ? NO_SAMPLE_TEXT : reading;
  const prominent = shownValue !== undefined;
  return (
    <div className={prominent ? 'ui-meter ui-meter--prominent' : 'ui-meter'}>
      {label !== undefined || shownValue !== undefined || shownReading !== undefined ? (
        <div className="ui-meter__head">
          <span className="ui-meter__name">
            {label !== undefined ? <p className={prominent ? 'ui-meter__label--eyebrow' : 'ui-meter__label'}>{label}</p> : null}
            {shownValue !== undefined ? <span className="ui-meter__value">{shownValue}</span> : null}
          </span>
          {shownReading !== undefined ? <span className="ui-meter__reading">{shownReading}</span> : null}
        </div>
      ) : null}
      <div
        className={trackClass}
        role="meter"
        aria-label={ariaLabel ?? label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={noSample ? NO_SAMPLE_TEXT : bounded ? undefined : NO_MAXIMUM_TEXT}
      >
        {noSample ? null : <div className={fillClass} style={{ width: `${percent}%` }} />}
      </div>
    </div>
  );
}
