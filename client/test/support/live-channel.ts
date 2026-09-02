/**
 * The browser's `EventSource`, stood in for, so a unit test can drive the live
 * channel the way the server does: values, daemon events, a discard, the end of
 * a reload, and the drop that stops delivery.
 *
 * jsdom implements no `EventSource` at all, and the one `test/setup.ts` installs
 * is inert on purpose. This one records what the channel client subscribed to
 * and hands the test a way to send it.
 */

type Listener = (event: Event) => void;

export class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readonly listeners = new Map<string, Set<Listener>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const registered = this.listeners.get(type) ?? new Set<Listener>();
    registered.add(listener);
    this.listeners.set(type, registered);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  /** Delivers one server-sent message of the named type, `data` already serialised. */
  emit(type: string, data = '{}'): void {
    const message = { data } as MessageEvent<string>;
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(message as unknown as Event);
  }
}

/** Where the client opens the live channel; other streams of the page open elsewhere. */
const CHANNEL_URL = '/api/live';

/**
 * The channel the client currently holds: the last one opened on the channel's
 * own URL. A page under test opens other server-sent streams of its own, so the
 * last `EventSource` built is not always this one.
 */
export function liveChannel(): FakeEventSource {
  const opened = [...FakeEventSource.instances].reverse().find((instance) => instance.url === CHANNEL_URL);
  if (!opened) throw new Error('no live channel was opened');
  return opened;
}

/** The channel starts delivering, as the server accepting the connection does. */
export function channelOpens(): void {
  liveChannel().emit('open');
}

/** One value message, naming which value it carries. */
export function deliverValue(name: string, value: unknown): void {
  liveChannel().emit('value', JSON.stringify({ name, value }));
}

/** One daemon event, in the shape the server writes. */
export function deliverDaemonEvent(event: Record<string, unknown>): void {
  liveChannel().emit('daemon-event', JSON.stringify(event));
}

/** The server says the values it held are gone. */
export function deliverDiscard(): void {
  liveChannel().emit('discarded');
}

/** The server says a manual reload has ended. */
export function deliverReloadEnd(): void {
  liveChannel().emit('reloaded');
}

/** The channel drops, which is what the browser reports as an error on it. */
export function dropChannel(): void {
  liveChannel().emit('error');
}
