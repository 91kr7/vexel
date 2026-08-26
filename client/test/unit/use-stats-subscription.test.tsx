import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useStatsSubscription } from '../../src/data/use-stats-subscription';

// The proof a consumer exists: a connection held open for exactly as long as
// somebody is being shown the sampled figures
// (containers/specs/use-stats-subscription.md,
// plan-docker_management_app-containers_card_view/REQ-42, REQ-43, REQ-45, REQ-48, REQ-51).

const SUBSCRIPTION_URL = '/api/containers/stats/subscription';

/** Stands in for the browser's EventSource: the connection is the whole observable of this hook. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  onmessage: ((message: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener() {}
  removeEventListener() {}

  close() {
    this.closed = true;
  }
}

/** The connections opened so far, in order. */
function connections(): FakeEventSource[] {
  return FakeEventSource.instances;
}

/** The connections still held open — what the server counts as live consumers. */
function openConnections(): FakeEventSource[] {
  return FakeEventSource.instances.filter((instance) => !instance.closed);
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useStatsSubscription', () => {
  // use-stats-subscription.md — "on mount, with the tab visible → opens
  // GET /api/containers/stats/subscription and keeps it open"
  it('opens the subscription connection on mount and holds it', () => {
    renderHook(() => useStatsSubscription());

    expect(connections()).toHaveLength(1);
    expect(connections()[0]?.url).toBe(SUBSCRIPTION_URL);
    expect(openConnections()).toHaveLength(1);
  });

  // use-stats-subscription.md — "on unmount → closes it": leaving the section that displays the
  // figures is what closes the gate (REQ-42, REQ-48)
  it('closes the connection when the screen holding it goes away', () => {
    const { unmount } = renderHook(() => useStatsSubscription());

    unmount();

    expect(openConnections()).toHaveLength(0);
    expect(connections()).toHaveLength(1);
  });

  // use-stats-subscription.md — "on the tab being hidden or backgrounded → closes it" (REQ-43)
  it('closes the connection when the tab is hidden', () => {
    renderHook(() => useStatsSubscription());

    setVisibility('hidden');

    expect(openConnections()).toHaveLength(0);
  });

  // use-stats-subscription.md — "on the tab becoming visible again → opens a new one" (REQ-51)
  it('opens a new connection when the tab comes back', () => {
    renderHook(() => useStatsSubscription());

    setVisibility('hidden');
    setVisibility('visible');

    expect(openConnections()).toHaveLength(1);
    expect(connections()).toHaveLength(2);
    expect(connections()[1]?.url).toBe(SUBSCRIPTION_URL);
  });

  // use-stats-subscription.md — "Exactly one connection is held per mounted caller, whatever the
  // number of visibility changes ... so the server's count cannot drift upward" (REQ-54)
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
  // upward drift the count must not suffer (REQ-54)
  it('opens no second connection when a visibility event repeats the state it is already in', () => {
    renderHook(() => useStatsSubscription());

    setVisibility('visible');
    setVisibility('visible');

    expect(openConnections()).toHaveLength(1);
    expect(connections()).toHaveLength(1);
  });

  // use-stats-subscription.md — "on mount, with the tab visible": a caller mounted while the tab is
  // hidden is not a consumer, and becomes one when the tab returns (REQ-43, REQ-48)
  it('holds no connection when mounted while the tab is hidden, and opens one when it returns', () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });

    renderHook(() => useStatsSubscription());

    expect(openConnections()).toHaveLength(0);

    setVisibility('visible');
    expect(openConnections()).toHaveLength(1);
  });

  // use-stats-subscription.md — "Two screens using the hook at once are two consumers, which is
  // ordinary: one of them leaving does not stop the sampling the other is reading" (REQ-45, REQ-47)
  it('holds one connection per caller, and one caller leaving keeps the other one held', () => {
    const first = renderHook(() => useStatsSubscription());
    renderHook(() => useStatsSubscription());

    expect(openConnections()).toHaveLength(2);

    first.unmount();

    expect(openConnections()).toHaveLength(1);
  });

  // use-stats-subscription.md — the hook releases the listener it added, so an unmounted caller
  // cannot be revived by a later visibility change (REQ-54)
  it('opens nothing on a visibility change after the caller has unmounted', () => {
    const { unmount } = renderHook(() => useStatsSubscription());
    unmount();

    setVisibility('hidden');
    setVisibility('visible');

    expect(openConnections()).toHaveLength(0);
  });
});
