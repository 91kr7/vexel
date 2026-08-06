import type { MetricTone } from './MetricTile';
import './metrics.css';

export interface MeterProps {
  label?: string;
  /** Consumed amount; negative values are treated as 0. */
  value: number;
  /** Full scale; when missing or not positive the bar stays empty. */
  max?: number;
  /** Reading shown at the right of the label (e.g. "128MB / 512MB"). */
  reading?: string;
  tone?: MetricTone;
  ariaLabel?: string;
}

/** Proportional bar showing how much of a limit is consumed, with its reading. */
export function Meter({ label, value, max, reading, tone = 'accent', ariaLabel }: MeterProps) {
  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;
  const ratio = max !== undefined && max > 0 ? Math.min(safeValue / max, 1) : 0;
  const percent = ratio * 100;
  const fillClass = tone === 'accent' ? 'ui-meter__fill' : `ui-meter__fill ui-meter__fill--${tone}`;
  return (
    <div className="ui-meter">
      {label !== undefined || reading !== undefined ? (
        <div className="ui-meter__head">
          {label !== undefined ? <p className="ui-meter__label">{label}</p> : null}
          {reading !== undefined ? <span className="ui-meter__reading">{reading}</span> : null}
        </div>
      ) : null}
      <div
        className="ui-meter__track"
        role="meter"
        aria-label={ariaLabel ?? label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={fillClass} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
