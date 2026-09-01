// Live-event subscription to the server's daemon event stream (REQ-11, REQ-12).
export interface DaemonEvent {
  id: string;
  timestamp: string;
  type: string;
  action: string;
  /** The object's name when the daemon reports one, else its identifier. */
  actor?: string;
  /** The object's identifier, whatever the daemon reported as its name (plan-docker_management_app-refresh_cache/REQ-6). */
  actorId?: string;
}

type EventListener = (event: DaemonEvent) => void;

let eventSource: EventSource | undefined;
const listeners = new Set<EventListener>();

function ensureConnection(): EventSource {
  if (eventSource) return eventSource;
  const source = new EventSource("/api/events/stream");
  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as DaemonEvent;
    listeners.forEach((listener) => listener(event));
  };
  eventSource = source;
  return source;
}

/** Subscribes to every live daemon event; returns an unsubscribe function. */
export function subscribeToDaemonEvents(listener: EventListener): () => void {
  ensureConnection();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
