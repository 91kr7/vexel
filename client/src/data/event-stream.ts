// Live-event subscription to the server's daemon event stream (REQ-11, REQ-12),
// plus a by-object-type invalidation registry so a view showing an affected
// object can re-read it automatically when a matching event arrives.
export interface DaemonEvent {
  id: string;
  timestamp: string;
  type: string;
  action: string;
  actor?: string;
}

type EventListener = (event: DaemonEvent) => void;

let eventSource: EventSource | undefined;
const listeners = new Set<EventListener>();
const typeListeners = new Map<string, Set<() => void>>();

function ensureConnection(): EventSource {
  if (eventSource) return eventSource;
  const source = new EventSource("/api/events/stream");
  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as DaemonEvent;
    listeners.forEach((listener) => listener(event));
    typeListeners.get(event.type)?.forEach((invalidate) => invalidate());
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

/**
 * Registers `invalidate` to run whenever an event of the given Docker object
 * type (container, image, network, volume, builder, ...) arrives.
 */
export function onDaemonObjectTypeChanged(objectType: string, invalidate: () => void): () => void {
  ensureConnection();
  const set = typeListeners.get(objectType) ?? new Set<() => void>();
  set.add(invalidate);
  typeListeners.set(objectType, set);
  return () => set.delete(invalidate);
}
