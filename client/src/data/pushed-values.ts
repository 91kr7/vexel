// What the live channel delivered, kept for the screens to read instead of asking the server
// (REQ-10, REQ-12, REQ-39).
import { useCallback, useSyncExternalStore } from 'react';
import { subscribeToChannelDiscard, subscribeToPushedValues } from './live-channel';

interface Delivered {
  value: unknown;
  serialised: string;
}

const delivered = new Map<string, Delivered>();
const listeners = new Map<string, Set<() => void>>();
let wired = false;

function wireOnce(): void {
  if (wired) return;
  wired = true;
  subscribeToPushedValues((pushed) => {
    const serialised = JSON.stringify(pushed.value);
    // Unchanged replaces nothing, so what the operator selected or scrolled to stays as it was (REQ-12).
    if (delivered.get(pushed.name)?.serialised === serialised) return;
    delivered.set(pushed.name, { value: pushed.value, serialised });
    notify(listeners.get(pushed.name));
  });
  subscribeToChannelDiscard(() => {
    const names = [...delivered.keys()];
    delivered.clear();
    names.forEach((name) => notify(listeners.get(name)));
  });
}

function notify(subscribers: Set<() => void> | undefined): void {
  subscribers?.forEach((subscriber) => subscriber());
}

/** What the channel last delivered for `name`, undefined while it has delivered none. */
function getPushedValue<T>(name: string): T | undefined {
  wireOnce();
  return delivered.get(name)?.value as T | undefined;
}

function subscribeToValue(name: string, listener: () => void): () => void {
  wireOnce();
  const subscribers = listeners.get(name) ?? new Set<() => void>();
  subscribers.add(listener);
  listeners.set(name, subscribers);
  return () => {
    subscribers.delete(listener);
  };
}

/** Reads the value named, re-rendering whenever the channel delivers a different one. */
export function usePushedValue<T>(name: string): T | undefined {
  const subscribe = useCallback((listener: () => void) => subscribeToValue(name, listener), [name]);
  return useSyncExternalStore(subscribe, () => getPushedValue<T>(name));
}
