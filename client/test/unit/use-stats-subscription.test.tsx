import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useStatsSubscription } from '../../src/data/use-stats-subscription';

// The proof a consumer exists: a connection held open for as long as somebody is being shown the
// sampled figures, re-established when it drops and never when the hook itself ended it
// (containers/specs/use-stats-subscription.md;
// plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-1, REQ-2, REQ-4, REQ-6,
// REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-19).

const SUBSCRIPTION_URL = 'ws://localhost:3000/api/containers/stats/subscription';
/** The spec's spacing: 1 s after the first drop, doubling, never above 15 s. */
const FIRST_WAIT_MS = 1000;
const MAX_WAIT_MS = 15000;

/** Stands in for the browser's WebSocket: the connection is the whole observable of this hook. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  closed = false;
  /** Whatever the hook sent on the connection: the contract allows nothing. */
  sent: unknown[] = [];
  private listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: Event) => void) {
    const forType = this.listeners.get(type) ?? new Set();
    forType.add(handler);
    this.listeners.set(type, forType);
  }

  removeEventListener(type: string, handler: (event: Event) => void) {
    this.listeners.get(type)?.delete(handler);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.end();
  }

  /** The connection reaching the server, which is what resets the spacing. */
  reachOpen() {
    this.emit('open');
  }

  /** The connection ending without the hook asking: a drop. */
  drop() {
    this.end();
  }

  /** Data arriving on a connection that carries none. */
  deliver(data: string) {
    this.emit('message', Object.assign(new Event('message'), { data }));
  }

  private end() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }

  private emit(type: string, event: Event = new Event(type)) {
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler(event);
  }
}

/** The connections opened so far, in order. */
function connections(): FakeWebSocket[] {
  return FakeWebSocket.instances;
}

/** The connections still held open — what the server counts as live consumers. */
function openConnections(): FakeWebSocket[] {
  return FakeWebSocket.instances.filter((instance) => !instance.closed);
}

function held(): FakeWebSocket {
  const open = openConnections();
  expect(open, 'no connection is held').toHaveLength(1);
  return open[0]!;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useStatsSubscription', () => {
  // use-stats-subscription.md — "opens a WebSocket to /api/containers/stats/subscription on the
  // page's own host ... and keeps it open" (REQ-1, REQ-6)
  it('opens the connection on mount, on the page own host, and holds it', () => {
    renderHook(() => useStatsSubscription());

    expect(connections()).toHaveLength(1);
    expect(connections()[0]?.url).toBe(SUBSCRIPTION_URL);
    expect(openConnections()).toHaveLength(1);
  });

  // use-stats-subscription.md — "wss when the page is https and ws otherwise" (REQ-6)
  it('opens a secure connection when the page itself is secure', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'location')!;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'https:', host: 'vexel.example:8443' },
    });
    try {
      renderHook(() => useStatsSubscription());

      expect(connections()[0]?.url).toBe('wss://vexel.example:8443/api/containers/stats/subscription');
    } finally {
      Object.defineProperty(window, 'location', original);
    }
  });

  // use-stats-subscription.md — "nothing is sent on the connection and nothing arriving on it is
  // read: the figures themselves keep arriving with the container list" (REQ-2)
  it('sends nothing on the connection, and data arriving on it changes nothing', () => {
    renderHook(() => useStatsSubscription());
    const connection = held();

    connection.deliver('{"cpuPercent":12}');

    expect(connection.sent, 'the hook wrote to a connection that carries no application data').toEqual([]);
    expect(connections()).toHaveLength(1);
    expect(openConnections()).toHaveLength(1);
  });

  // use-stats-subscription.md — "on unmount → closes it": leaving the screen that displays the
  // figures is what closes the gate (REQ-4)
  it('closes the connection when the screen holding it goes away', () => {
    const { unmount } = renderHook(() => useStatsSubscription());

    unmount();

    expect(openConnections()).toHaveLength(0);
    expect(connections()).toHaveLength(1);
  });

  // use-stats-subscription.md — "on the tab being hidden or backgrounded → closes it" (REQ-4)
  it('closes the connection when the tab is hidden', () => {
    renderHook(() => useStatsSubscription());

    setVisibility('hidden');

    expect(openConnections()).toHaveLength(0);
  });

  // use-stats-subscription.md — "on the tab becoming visible again → opens a new one" (REQ-4)
  it('opens a new connection when the tab comes back', () => {
    renderHook(() => useStatsSubscription());

    setVisibility('hidden');
    setVisibility('visible');

    expect(openConnections()).toHaveLength(1);
    expect(connections()).toHaveLength(2);
    expect(connections()[1]?.url).toBe(SUBSCRIPTION_URL);
  });

  // use-stats-subscription.md — "Exactly one connection is held per mounted caller, whatever the
  // number of visibility changes ... so the server's count cannot drift upward"
  it('holds exactly one connection across repeated visibility cycles', () => {
    renderHook(() => useStatsSubscription());

    for (let cycle = 0; cycle < 5; cycle += 1) {
      setVisibility('hidden');
      expect(openConnections()).toHaveLength(0);
      setVisibility('visible');
      expect(openConnections()).toHaveLength(1);
    }
  });

  // A visible-to-visible event changes nothing: a second connection for one caller is exactly the
  // upward drift the count must not suffer.
  it('opens no second connection when a visibility event repeats the state it is already in', () => {
    renderHook(() => useStatsSubscription());

    setVisibility('visible');
    setVisibility('visible');

    expect(openConnections()).toHaveLength(1);
    expect(connections()).toHaveLength(1);
  });

  // use-stats-subscription.md — "on mount, with the tab visible": a caller mounted while the tab is
  // hidden is not a consumer, and becomes one when the tab returns (REQ-4)
  it('holds no connection when mounted while the tab is hidden, and opens one when it returns', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });

    renderHook(() => useStatsSubscription());

    expect(openConnections()).toHaveLength(0);

    setVisibility('visible');
    expect(openConnections()).toHaveLength(1);
  });

  // use-stats-subscription.md — "Two screens using the hook at once are two consumers, which is
  // ordinary: one of them leaving does not stop the sampling the other is reading"
  it('holds one connection per caller, and one caller leaving keeps the other one held', () => {
    const first = renderHook(() => useStatsSubscription());
    renderHook(() => useStatsSubscription());

    expect(openConnections()).toHaveLength(2);

    first.unmount();

    expect(openConnections()).toHaveLength(1);
  });

  // use-stats-subscription.md — the hook releases the listener it added, so an unmounted caller
  // cannot be revived by a later visibility change.
  it('opens nothing on a visibility change after the caller has unmounted', () => {
    const { unmount } = renderHook(() => useStatsSubscription());
    unmount();

    setVisibility('hidden');
    setVisibility('visible');

    expect(openConnections()).toHaveLength(0);
  });

  // use-stats-subscription.md — "on a close the hook did not ask for → opens a new connection after
  // a wait" (REQ-12), and the wait is the spec's first one.
  it('reopens a dropped connection after the first wait, and not before it', () => {
    renderHook(() => useStatsSubscription());
    const dropped = held();

    dropped.drop();
    expect(openConnections(), 'a dropped connection is not held any more').toHaveLength(0);

    advance(FIRST_WAIT_MS - 1);
    expect(connections(), 'the reopen came before the wait was over').toHaveLength(1);

    advance(1);
    expect(openConnections()).toHaveLength(1);
    expect(connections()).toHaveLength(2);
  });

  // use-stats-subscription.md — "Reconnection resumes nothing: no cursor, no missed state and no
  // replay" (REQ-14): the connection that replaces a dropped one is addressed exactly as the first.
  it('reopens at the same address, carrying nothing of the connection it replaces', () => {
    renderHook(() => useStatsSubscription());

    held().drop();
    advance(FIRST_WAIT_MS);

    expect(connections()[1]?.url).toBe(SUBSCRIPTION_URL);
    expect(connections()[1]?.sent).toEqual([]);
  });

  // use-stats-subscription.md — "A close the hook asked for is never followed by a reopen": an
  // unmount ends the gate and leaves it ended (REQ-13).
  it('never reopens after an unmount', () => {
    const { unmount } = renderHook(() => useStatsSubscription());

    unmount();
    advance(60_000);

    expect(connections()).toHaveLength(1);
    expect(openConnections()).toHaveLength(0);
  });

  // use-stats-subscription.md — the same for a hidden tab: the gate stays closed for as long as the
  // tab is away, however long that is (REQ-13).
  it('never reopens behind a hidden tab', () => {
    renderHook(() => useStatsSubscription());

    setVisibility('hidden');
    advance(60_000);

    expect(connections()).toHaveLength(1);
    expect(openConnections()).toHaveLength(0);
  });

  // use-stats-subscription.md — "1 s after the first drop, doubling with each further attempt that
  // does not reach an open connection, never above 15 s" (REQ-15).
  it('doubles the wait after each attempt that does not reach an open connection, up to the cap', () => {
    renderHook(() => useStatsSubscription());
    const waits = [1000, 2000, 4000, 8000, MAX_WAIT_MS, MAX_WAIT_MS];

    let expectedConnections = 1;
    for (const wait of waits) {
      held().drop();

      advance(wait - 1);
      expect(connections(), `a wait of ${wait}ms was not respected`).toHaveLength(expectedConnections);

      advance(1);
      expectedConnections += 1;
      expect(connections(), `no connection was opened after ${wait}ms`).toHaveLength(expectedConnections);
    }
  });

  // use-stats-subscription.md — "A connection that opens resets the wait to its first value."
  it('goes back to the first wait once a connection has opened', () => {
    renderHook(() => useStatsSubscription());

    held().drop();
    advance(FIRST_WAIT_MS);
    held().drop();
    advance(2000);

    // This one reaches the server, so the next drop is a first drop again.
    held().reachOpen();
    held().drop();

    advance(FIRST_WAIT_MS - 1);
    expect(connections()).toHaveLength(3);
    advance(1);
    expect(connections(), 'the wait did not go back to its first value after a connection opened').toHaveLength(4);
  });

  // use-stats-subscription.md — "Reconnection never gives up on its own. It stops when the screen
  // stops needing the figures" (REQ-16).
  it('keeps reopening for as long as the screen needs the figures, and stops when it does not', () => {
    const { unmount } = renderHook(() => useStatsSubscription());

    for (let attempt = 0; attempt < 12; attempt += 1) {
      held().drop();
      advance(MAX_WAIT_MS);
      expect(openConnections(), `attempt ${attempt} gave up`).toHaveLength(1);
    }

    unmount();
    advance(60_000);
    expect(openConnections(), 'the screen going away did not stop the reconnection').toHaveLength(0);
  });

  // use-stats-subscription.md — "a reopen scheduled but not yet fired is dropped when the caller
  // opens or closes on its own, so the server's count cannot drift upward".
  it('drops a scheduled reopen when the tab comes back before it fires', () => {
    renderHook(() => useStatsSubscription());

    held().drop();
    setVisibility('hidden');
    setVisibility('visible');

    expect(openConnections(), 'the tab returning holds exactly one connection').toHaveLength(1);

    advance(60_000);

    expect(openConnections(), 'a reopen fired beside the connection the tab already holds').toHaveLength(1);
  });

  // use-stats-subscription.md — "Nothing is signalled at unload: no beforeunload, no pagehide, no
  // unload and no beacon" (REQ-19).
  it('registers no unload signal of any kind and sends no beacon', () => {
    const windowListeners = vi.spyOn(window, 'addEventListener');
    const documentListeners = vi.spyOn(document, 'addEventListener');
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', Object.assign(Object.create(Object.getPrototypeOf(navigator)), navigator, { sendBeacon: beacon }));

    const { unmount } = renderHook(() => useStatsSubscription());
    setVisibility('hidden');
    unmount();

    const registered = [...windowListeners.mock.calls, ...documentListeners.mock.calls].map(([type]) => type);
    for (const forbidden of ['beforeunload', 'pagehide', 'unload']) {
      expect(registered, `the hook listens for ${forbidden}`).not.toContain(forbidden);
    }
    expect(beacon).not.toHaveBeenCalled();

    windowListeners.mockRestore();
    documentListeners.mockRestore();
  });
});
