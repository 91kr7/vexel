import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { subscribeToDaemonEvents, type DaemonEvent } from '../../data/live-channel';

const MAX_EVENTS = 50;

interface EventStreamContextValue {
  events: DaemonEvent[];
}

const EventStreamContext = createContext<EventStreamContextValue | undefined>(undefined);

/** Keeps the most recent live daemon events app-wide, newest first (REQ-11, REQ-12). */
export function DaemonEventStreamProvider({ children }: { children?: ReactNode }) {
  const [events, setEvents] = useState<DaemonEvent[]>([]);

  useEffect(() => {
    return subscribeToDaemonEvents((event) => {
      setEvents((previous) => {
        // The same event can arrive twice — the browser reopens the dropped
        // stream and the server replays the catch-up backlog. Held once, it
        // stays one row instead of a second child under an existing key.
        if (previous.some((held) => held.id === event.id)) return previous;
        return [event, ...previous].slice(0, MAX_EVENTS);
      });
    });
  }, []);

  return <EventStreamContext.Provider value={{ events }}>{children}</EventStreamContext.Provider>;
}

export function useDaemonEventStream(): EventStreamContextValue {
  const context = useContext(EventStreamContext);
  if (!context) throw new Error('useDaemonEventStream must be used within a DaemonEventStreamProvider');
  return context;
}
