import './feedback.css';

export type ResultSummaryTone = 'neutral' | 'success' | 'danger';

export interface ResultSummaryItem {
  label: string;
  value: string;
  /** Marks this line as the failed part of an otherwise successful outcome. */
  failed?: boolean;
}

export interface ResultSummaryProps {
  title: string;
  /** The outcome's headline figure, e.g. "1.2GB reclaimed". */
  headline: string;
  items?: ResultSummaryItem[];
  tone?: ResultSummaryTone;
}

/** Block reporting what an action just did: a headline figure over one line per part of the work. */
export function ResultSummary({ title, headline, items = [], tone = 'neutral' }: ResultSummaryProps) {
  return (
    <div className={tone === 'neutral' ? 'ui-result-summary' : `ui-result-summary ui-result-summary--tone-${tone}`}>
      <div className="ui-result-summary__head">
        <p className="ui-result-summary__title">{title}</p>
        <p className="ui-result-summary__headline">{headline}</p>
      </div>
      {items.length > 0 ? (
        <ul className="ui-result-summary__items">
          {items.map((item) => (
            <li key={item.label} className="ui-result-summary__item">
              <span className="ui-result-summary__label">{item.label}</span>
              <span className={item.failed ? 'ui-result-summary__value ui-result-summary__value--failed' : 'ui-result-summary__value'}>
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
