import { EmptyState } from './EmptyState';
import { ScrollArea } from '../glass/ScrollArea';
import './feedback.css';

export interface EventStreamEntry {
  id: string;
  /** Display-ready timestamp (formatting is a feature-layer concern). */
  timestamp: string;
  type: string;
  action: string;
  summary?: string;
}

export interface EventStreamProps {
  entries: EventStreamEntry[];
  emptyLabel?: string;
  maxHeight?: string;
}

/** Monospace, timestamped stream of daemon events with type/action emphasis. */
export function EventStream({ entries, emptyLabel = 'No events yet.', maxHeight = '260px' }: EventStreamProps) {
  if (entries.length === 0) {
    return <EmptyState title={emptyLabel} description={null} action={null} />;
  }
  return (
    <ScrollArea maxHeight={maxHeight}>
      <div className="ui-event-stream">
        {entries.map((entry) => (
          <div className="ui-event-stream__line" key={entry.id}>
            <span className="ui-event-stream__timestamp">{entry.timestamp}</span>
            <span className="ui-event-stream__type">{entry.type}</span>
            <span className="ui-event-stream__action">{entry.action}</span>
            {entry.summary ? <span className="ui-event-stream__summary">{entry.summary}</span> : null}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
