import type { ReactNode } from 'react';
import './metrics.css';

/** How many distinct colors the categorical palette holds before it repeats. */
const SERIES_COLOR_COUNT = 4;

export interface UsageBreakdownItem {
  id: string;
  label: string;
  /** Magnitude of this row; negative or non-finite is treated as 0. */
  value: number;
  /** The absolute reading, already formatted, shown opposite the label. */
  valueLabel: string;
  /** The magnitude could not be read: `value` is ignored and the row draws the unmeasured track. */
  unavailable?: boolean;
  /** Makes the row activatable by pointer and keyboard; `ariaLabel` names what it leads to. */
  onActivate?: () => void;
  ariaLabel?: string;
}

export interface UsageBreakdownProps {
  items: UsageBreakdownItem[];
  /** Full scale each row's bar is drawn against; defaults to the sum of every item's value. */
  total?: number;
  /** Shown in place of the rows when there is nothing to break down. */
  emptyState?: ReactNode;
}

/**
 * A magnitude split across named categories: one row per category with its
 * label, its absolute reading and a bar as long as its share of the whole,
 * under a legend pairing every color it paints with what that color means.
 *
 * Deliberately not a stack of `Meter`s: a meter's bar is colored by a semantic
 * tone (this reading is healthy, this one is alarming), while these colors are
 * categorical — they only tell one row apart from the next — and each row can
 * lead somewhere of its own.
 *
 * Zero and unmeasured are two drawn states rather than one absence: a bar of
 * width 0 and a reading nobody could take are the same picture, and that
 * picture was shipped (REQ-68).
 */
export function UsageBreakdown({ items, total, emptyState }: UsageBreakdownProps) {
  const scale = total !== undefined ? total : items.reduce((sum, item) => sum + magnitude(item.value), 0);
  if (items.length === 0) return <div className="ui-usage-breakdown__empty">{emptyState}</div>;

  return (
    <div className="ui-usage-breakdown">
      <div className="ui-usage-breakdown__rows">
        {items.map((item, index) => {
          const series = seriesOf(index);
          const share = scale > 0 ? Math.min(magnitude(item.value) / scale, 1) : 0;
          const percent = share * 100;
          const zero = !item.unavailable && magnitude(item.value) === 0;
          const body = (
            <>
              <div className="ui-usage-breakdown__head">
                <span className="ui-usage-breakdown__label">{item.label}</span>
                <span className="ui-usage-breakdown__value">{item.valueLabel}</span>
              </div>
              <div
                className={
                  item.unavailable
                    ? 'ui-usage-breakdown__track ui-usage-breakdown__track--unmeasured'
                    : 'ui-usage-breakdown__track'
                }
                role="meter"
                aria-label={item.label}
                aria-valuenow={Math.round(percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={item.unavailable ? item.valueLabel : undefined}
              >
                {item.unavailable ? null : zero ? (
                  <div className={`ui-usage-breakdown__zero ui-usage-breakdown__zero--series-${series}`} />
                ) : (
                  <div
                    className={`ui-usage-breakdown__fill ui-usage-breakdown__fill--series-${series}`}
                    style={{ width: `${percent}%` }}
                  />
                )}
              </div>
            </>
          );
          return item.onActivate ? (
            <button key={item.id} type="button" className="ui-usage-breakdown__row ui-usage-breakdown__row--activatable" onClick={item.onActivate} aria-label={item.ariaLabel}>
              {body}
            </button>
          ) : (
            <div key={item.id} className="ui-usage-breakdown__row">
              {body}
            </div>
          );
        })}
      </div>
      <div className="ui-usage-breakdown__legend">
        {items.map((item, index) => (
          <span key={item.id} className="ui-usage-breakdown__legend-item">
            <span
              className={
                item.unavailable
                  ? 'ui-usage-breakdown__swatch ui-usage-breakdown__swatch--unmeasured'
                  : `ui-usage-breakdown__swatch ui-usage-breakdown__swatch--series-${seriesOf(index)}`
              }
            />
            <span className="ui-usage-breakdown__legend-label">{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function seriesOf(index: number): number {
  return (index % SERIES_COLOR_COUNT) + 1;
}

function magnitude(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
