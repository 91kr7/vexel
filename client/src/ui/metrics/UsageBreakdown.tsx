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
 * label, its absolute reading and a bar as long as its share of the whole.
 *
 * Deliberately not a stack of `Meter`s: a meter's bar is colored by a semantic
 * tone (this reading is healthy, this one is alarming), while these colors are
 * categorical — they only tell one row apart from the next — and each row can
 * lead somewhere of its own.
 */
export function UsageBreakdown({ items, total, emptyState }: UsageBreakdownProps) {
  const scale = total !== undefined ? total : items.reduce((sum, item) => sum + magnitude(item.value), 0);
  if (items.length === 0) return <div className="ui-usage-breakdown__empty">{emptyState}</div>;

  return (
    <div className="ui-usage-breakdown">
      {items.map((item, index) => {
        const share = scale > 0 ? Math.min(magnitude(item.value) / scale, 1) : 0;
        const percent = share * 100;
        const body = (
          <>
            <div className="ui-usage-breakdown__head">
              <span className="ui-usage-breakdown__label">{item.label}</span>
              <span className="ui-usage-breakdown__value">{item.valueLabel}</span>
            </div>
            <div
              className="ui-usage-breakdown__track"
              role="meter"
              aria-label={item.label}
              aria-valuenow={Math.round(percent)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`ui-usage-breakdown__fill ui-usage-breakdown__fill--series-${(index % SERIES_COLOR_COUNT) + 1}`}
                style={{ width: `${percent}%` }}
              />
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
  );
}

function magnitude(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
