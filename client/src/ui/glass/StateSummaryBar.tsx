import type { ReactNode } from 'react';
import { Surface } from './Surface';
import { StatusDotCell } from '../data/TableCells';
import type { StatusTone } from '../controls/StatusPill';
import './state-summary-bar.css';

export interface StateSummaryBarProps {
  tone?: StatusTone;
  /** The state in words, e.g. "CLI channel · full daemon privileges". */
  title: string;
  /** The readings qualifying the state; rendered as one monospace line separated by `·`. */
  facts?: string[];
  /** Trailing actions that change the state. */
  actions?: ReactNode;
}

/**
 * Full-width strip stating the condition of a whole subsystem: a state dot,
 * the state in words, the readings qualifying it and the actions that change
 * it. It states a condition even with nothing to qualify it, so a subsystem
 * that is switched off is announced rather than left blank.
 */
export function StateSummaryBar({ tone = 'neutral', title, facts, actions }: StateSummaryBarProps) {
  const line = (facts ?? []).filter((fact) => fact !== '');
  return (
    <Surface elevation="raised" padding="md">
      <div className="ui-state-summary-bar">
        <div className="ui-state-summary-bar__state">
          <StatusDotCell tone={tone} />
          <div className="ui-state-summary-bar__text">
            <span className="ui-state-summary-bar__title">{title}</span>
            {line.length > 0 ? <span className="ui-state-summary-bar__facts">{line.join(' · ')}</span> : null}
          </div>
        </div>
        {actions ? <div className="ui-state-summary-bar__actions">{actions}</div> : null}
      </div>
    </Surface>
  );
}
