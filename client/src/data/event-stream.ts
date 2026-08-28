// Live-event subscription to the server's daemon event stream (REQ-11, REQ-12),
// plus a by-object-type invalidation registry so a view showing an affected
// object can re-read it automatically when a matching event arrives.
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

/** Docker's short form of an identifier; below it a prefix comparison is not evidence of identity. */
const SHORT_ID_LENGTH = 12;
const HEX_IDENTIFIER = /^[0-9a-f]+$/;

/**
 * Whether an event is about the object a detail view was opened for
 * (plan-docker_management_app-refresh_cache/REQ-7). An event carrying no
 * identifier is attributed to it: a view must never go stale by ignoring an
 * event it could not attribute (plan-docker_management_app-refresh_cache/REQ-8).
 */
export function daemonEventConcerns(event: DaemonEvent, identifier: string | undefined): boolean {
  const actorId = normalizeIdentifier(event.actorId);
  const target = normalizeIdentifier(identifier);
  if (!actorId || !target) return true;
  return namesOneObject(actorId, target) || namesOneObject(normalizeIdentifier(event.actor), target);
}

function normalizeIdentifier(value: string | undefined): string {
  return (value ?? '').trim().replace(/^sha256:/, '').toLowerCase();
}

/**
 * Two identifiers name one object when they are equal, or when the shorter is
 * the truncated form of the longer. Truncation is only read into hexadecimal
 * identifiers: two names sharing a prefix are two objects.
 */
function namesOneObject(one: string, other: string): boolean {
  if (!one || !other) return false;
  if (one === other) return true;
  const [shorter, longer] = one.length < other.length ? [one, other] : [other, one];
  if (shorter.length < SHORT_ID_LENGTH) return false;
  return HEX_IDENTIFIER.test(shorter) && HEX_IDENTIFIER.test(longer) && longer.startsWith(shorter);
}
