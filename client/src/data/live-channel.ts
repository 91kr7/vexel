// The browser's one connection to the server: the daemon events and every value the server holds,
// on a single SSE channel that reconnects on its own (REQ-1, REQ-3, REQ-9, REQ-10).
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

/** One value the server holds, named so the client routes it without opening a second channel. */
export interface PushedValue {
  name: string;
  value: unknown;
}

const CHANNEL_URL = '/api/live';

const eventListeners = new Set<(event: DaemonEvent) => void>();
const valueListeners = new Set<(pushed: PushedValue) => void>();
const discardListeners = new Set<() => void>();
const reloadEndWaiters = new Set<() => void>();
const deliveryListeners = new Set<(delivering: boolean) => void>();

let channel: EventSource | undefined;
let delivering = false;

function ensureChannel(): void {
  if (channel) return;
  const opened = new EventSource(CHANNEL_URL);
  opened.addEventListener('open', () => setDelivering(true));
  // The browser reopens a dropped channel on its own; the state says so meanwhile.
  opened.addEventListener('error', () => setDelivering(false));
  opened.addEventListener('daemon-event', (message) => {
    const event = JSON.parse(dataOf(message)) as DaemonEvent;
    eventListeners.forEach((listener) => listener(event));
  });
  opened.addEventListener('value', (message) => {
    const pushed = JSON.parse(dataOf(message)) as PushedValue;
    valueListeners.forEach((listener) => listener(pushed));
  });
  opened.addEventListener('discarded', () => discardListeners.forEach((listener) => listener()));
  opened.addEventListener('reloaded', settleReloadEndWaiters);
  channel = opened;
}

function dataOf(message: Event): string {
  return (message as MessageEvent<string>).data;
}

function setDelivering(next: boolean): void {
  if (delivering === next) return;
  delivering = next;
  // A channel that stopped delivering carries no end-of-reload message: a waiter parked on one
  // would never end, and the interface already says the channel is down (REQ-11, REQ-18).
  if (!next) settleReloadEndWaiters();
  deliveryListeners.forEach((listener) => listener(next));
}

function settleReloadEndWaiters(): void {
  const settling = [...reloadEndWaiters];
  reloadEndWaiters.clear();
  settling.forEach((settle) => settle());
}

function subscribe<T>(listeners: Set<T>, listener: T): () => void {
  ensureChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribes to every live daemon event; returns an unsubscribe function. */
export function subscribeToDaemonEvents(listener: (event: DaemonEvent) => void): () => void {
  return subscribe(eventListeners, listener);
}

/** Subscribes to every value the channel delivers, whichever value it is. */
export function subscribeToPushedValues(listener: (pushed: PushedValue) => void): () => void {
  return subscribe(valueListeners, listener);
}

/** Subscribes to the server saying the values it held are gone. */
export function subscribeToChannelDiscard(listener: () => void): () => void {
  return subscribe(discardListeners, listener);
}

/** Parked before the reload is asked for, never after: the message can arrive before the endpoint answers (REQ-23). */
export function awaitReloadEnd(): Promise<void> {
  ensureChannel();
  if (!delivering) return Promise.resolve();
  return new Promise<void>((resolve) => {
    reloadEndWaiters.add(resolve);
  });
}

/** Subscribes to whether the channel is delivering; returns an unsubscribe function. */
export function subscribeToChannelDelivery(listener: (delivering: boolean) => void): () => void {
  return subscribe(deliveryListeners, listener);
}

export function isChannelDelivering(): boolean {
  return delivering;
}

/** Asks for the channel again, for an operator told it is not delivering (REQ-18). */
export function reconnectLiveChannel(): void {
  channel?.close();
  channel = undefined;
  setDelivering(false);
  ensureChannel();
}
